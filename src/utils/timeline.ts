import type { CharacterState, CharacterStateKind, FlexibleTimestamp, StoryEvent } from '@/types'
import { compareFlexibleTime } from '@/utils/time'

/**
 * 时间线领域工具（Sprint 5 US-301~304）：
 * - 事件与人物状态变化合并为统一条目（角色时间线 US-304）
 * - 排序：compareFlexibleTime 类别主序（relative<fuzzy<chapter<exact），同类并列按 updatedAt 倒序
 * - 手动排序：fuzzy/relative 事件可在同类段内上移/下移，写入 time.sortOrder（US-303）
 */

export type TimelineItemKind = 'event' | 'state'

/** 时间线条目（事件 或 人物状态变化） */
export interface TimelineItem {
  key: string
  kind: TimelineItemKind
  id: string
  time: FlexibleTimestamp
  /** 事件名 / 状态摘要 */
  name: string
  /** 事件类型 */
  eventType?: string
  /** 事件星级 */
  importance?: number
  locationId?: string
  participantIds: string[]
  /** 状态条目所属人物名（未知时显示“未知”） */
  charName?: string
  stateKind?: CharacterStateKind
  updatedAt: string
}

export function compareTimelineItems(
  a: { time: FlexibleTimestamp; updatedAt: string },
  b: { time: FlexibleTimestamp; updatedAt: string },
): number {
  const cmp = compareFlexibleTime(a.time, b.time)
  if (cmp !== 0) return cmp
  return b.updatedAt.localeCompare(a.updatedAt)
}

/** 构建并排序时间线条目：states 传入时合并（角色时间线），否则仅事件 */
export function buildTimelineItems(options: {
  events: StoryEvent[]
  states?: CharacterState[]
  charById: (id: string) => { name: string } | undefined
}): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const e of options.events) {
    items.push({
      key: `event:${e.id}`,
      kind: 'event',
      id: e.id,
      time: e.time,
      name: e.name,
      eventType: e.type,
      importance: e.importance,
      locationId: e.locationId,
      participantIds: e.participantIds ?? [],
      updatedAt: e.updatedAt,
    })
  }
  for (const s of options.states ?? []) {
    const ch = options.charById(s.characterId)
    items.push({
      key: `state:${s.id}`,
      kind: 'state',
      id: s.id,
      time: s.time,
      name: s.state,
      charName: ch?.name ?? '未知',
      participantIds: [s.characterId],
      stateKind: s.kind,
      updatedAt: s.updatedAt,
    })
  }
  return items.sort(compareTimelineItems)
}

/** 该时间是否支持手动排序（fuzzy/relative），返回其段类别 */
export function manualKindOf(t?: FlexibleTimestamp): 'fuzzy' | 'relative' | null {
  if (!t) return null
  return t.type === 'fuzzy' || t.type === 'relative' ? t.type : null
}

/** 相邻两项是否可在手动段内互换（同为 fuzzy 或同为 relative） */
export function canSwapAdjacent(
  a?: FlexibleTimestamp,
  b?: FlexibleTimestamp,
): boolean {
  const ka = manualKindOf(a)
  return ka !== null && ka === manualKindOf(b)
}

/** 手动段条目（写回需 id + 新 time） */
export interface ManualWrite {
  id: string
  time: FlexibleTimestamp
}

/**
 * 手动段是否已归一化（顺序连续 0..n-1，无缺失/重复）。
 * items 须按期望顺序传入（当前展示顺序）。
 */
export function needsManualNormalize(items: ManualWrite[]): boolean {
  return items.some((it, idx) => it.time.sortOrder !== idx)
}

/**
 * 将手动段归一为 0..n-1 连续序号（按传入顺序）。
 * 仅返回需要写回的条目（排序与序号不一致的）。
 */
export function normalizeManualSegment(items: ManualWrite[]): ManualWrite[] {
  return items
    .map((it, idx) => ({ id: it.id, time: { ...it.time, sortOrder: idx } }))
    .filter((w, idx) => items[idx].time.sortOrder !== w.time.sortOrder)
}

/** 交换相邻两条目的 sortOrder，返回需要写回的条目（归一段内已编号后调用） */
export function swapManualNeighbors(a: ManualWrite, b: ManualWrite): ManualWrite[] {
  const oa = a.time.sortOrder ?? 0
  const ob = b.time.sortOrder ?? 0
  if (oa === ob) {
    // 尚未编号：按相对位置赋予
    return [
      { id: a.id, time: { ...a.time, sortOrder: oa - 1 } },
      { id: b.id, time: { ...b.time, sortOrder: ob + 1 } },
    ]
  }
  return [
    { id: a.id, time: { ...a.time, sortOrder: ob } },
    { id: b.id, time: { ...b.time, sortOrder: oa } },
  ]
}
