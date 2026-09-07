import { db } from '@/db/database'
import { type EntityStoreName } from '@/types'
import { parseExport, type ExportEnvelope } from './exportImport'

/**
 * 项目共享与合并（Sprint 10 US-1002，设计文档 §2.12）：
 * 以导出的项目 JSON 为「远端副本」，与本地数据按实体 id 做差异比对，
 * 由用户在向导中逐项选择后合并（本地优先，冲突以时间戳提示新旧）。
 */

export type DiffKind =
  /** 远端新增（本地没有） */
  | 'added'
  /** 远端更新（远端 updatedAt 更新） */
  | 'changed'
  /** 本地更新（本地 updatedAt 更新，勾选会用远端覆盖） */
  | 'localNewer'
  /** 远端已删除或从未同步（本地有、远端没有，勾选会删除本地） */
  | 'removed'

export interface EntityDiff {
  store: EntityStoreName
  storeLabel: string
  kind: DiffKind
  id: string
  label: string
  localAt?: string
  remoteAt?: string
  detail?: string
}

export interface MergePlan {
  remoteProjectId: string
  remoteName: string
  remoteExportedAt: string
  diffs: EntityDiff[]
  envelope: ExportEnvelope
}

const STORE_LABELS: Partial<Record<EntityStoreName, string>> = {
  characters: '人物',
  states: '人物状态',
  arcs: '人物弧光',
  relationships: '关系',
  locations: '地点',
  events: '事件',
  outline_nodes: '大纲',
  chapters: '章节',
  scenes: '场景',
  foreshadowings: '伏笔',
  idea_fragments: '灵感碎片',
  comments: '批注',
}

/** 参与合并的实体表（projects 不参与；章节版本由章节重建，不合并） */
const MERGE_STORES: EntityStoreName[] = [
  'characters',
  'states',
  'arcs',
  'relationships',
  'locations',
  'events',
  'outline_nodes',
  'chapters',
  'scenes',
  'foreshadowings',
  'idea_fragments',
  'comments',
]

export const DIFF_LABELS: Record<DiffKind, string> = {
  added: '远端新增',
  changed: '远端更新',
  localNewer: '本地更新',
  removed: '远端缺失',
}

function labelOf(store: EntityStoreName, row: Record<string, unknown>): string {
  const raw =
    row.title ?? row.name ?? row.description ?? row.stage ?? row.content ?? row.label ?? ''
  const text = String(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, 40) : `${STORE_LABELS[store] ?? store} ${String(row.id).slice(0, 6)}`
}

/** 顶层字段差异（忽略时间戳） */
function changedFields(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const out: string[] = []
  for (const k of keys) {
    if (k === 'updatedAt' || k === 'createdAt') continue
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(k)
  }
  return out
}

/** 生成本地 ↔ 远端差异计划 */
export async function buildMergePlan(localProjectId: string, remoteText: string): Promise<MergePlan> {
  const envelope = parseExport(remoteText)
  const diffs: EntityDiff[] = []

  for (const store of MERGE_STORES) {
    const local = (await db.table(store).where('projectId').equals(localProjectId).toArray()) as Array<
      Record<string, unknown>
    >
    const remote = ((envelope.data?.[store] ?? []) as Array<Record<string, unknown>>).filter(
      (r) => r && typeof r === 'object' && r.id !== undefined,
    )
    const localMap = new Map(local.map((r) => [String(r.id), r]))
    const remoteMap = new Map(remote.map((r) => [String(r.id), r]))
    const storeLabel = STORE_LABELS[store] ?? store

    for (const [id, rr] of remoteMap) {
      const ll = localMap.get(id)
      if (!ll) {
        diffs.push({ store, storeLabel, kind: 'added', id, label: labelOf(store, rr), remoteAt: String(rr.updatedAt ?? '') })
        continue
      }
      const la = String(ll.updatedAt ?? '')
      const ra = String(rr.updatedAt ?? '')
      if (la && ra && la === ra) continue
      const fields = changedFields(ll, rr)
      diffs.push({
        store,
        storeLabel,
        kind: ra > la ? 'changed' : 'localNewer',
        id,
        label: labelOf(store, rr),
        localAt: la,
        remoteAt: ra,
        detail: fields.length ? `差异字段：${fields.slice(0, 4).join('、')}` : '仅时间戳不同',
      })
    }

    for (const [id, ll] of localMap) {
      if (remoteMap.has(id)) continue
      diffs.push({ store, storeLabel, kind: 'removed', id, label: labelOf(store, ll), localAt: String(ll.updatedAt ?? '') })
    }
  }

  return {
    remoteProjectId: envelope.project.id,
    remoteName: envelope.project.name,
    remoteExportedAt: envelope.exportedAt,
    diffs,
    envelope,
  }
}

export function diffKey(d: EntityDiff): string {
  return `${d.store}:${d.id}`
}

/** 应用勾选的差异项到本地（远端行写入时 projectId 覆盖为当前项目） */
export async function applyMergePlan(localProjectId: string, plan: MergePlan, selected: ReadonlySet<string>): Promise<number> {
  let count = 0
  for (const d of plan.diffs) {
    if (!selected.has(diffKey(d))) continue
    const table = db.table(d.store)
    if (d.kind === 'removed') {
      await table.delete(d.id)
      count += 1
      continue
    }
    const row = ((plan.envelope.data?.[d.store] ?? []) as Array<Record<string, unknown>>).find(
      (r) => String(r.id) === d.id,
    )
    if (!row) continue
    await table.put({ ...row, projectId: localProjectId })
    count += 1
  }
  return count
}

/** 默认勾选：远端新增 + 远端更新（本地更新与远端缺失不勾选，避免误删/覆盖） */
export function defaultSelection(plan: MergePlan): Set<string> {
  const set = new Set<string>()
  for (const d of plan.diffs) {
    if (d.kind === 'added' || d.kind === 'changed') set.add(diffKey(d))
  }
  return set
}
