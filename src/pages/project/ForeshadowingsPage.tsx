import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Anchor, Flag, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, Select, Textarea, cn } from '@/components/ui'
import { CharacterMultiSelect } from '@/components/people/CharacterMultiSelect'
import { useProjectEntityList } from '@/hooks/useProjectEntityList'
import { useProjectStore } from '@/stores/projectStore'
import { characterRepo, deleteForeshadowingCascade, eventRepo, foreshadowingRepo, outlineRepo } from '@/db/repositories'
import { createEntity } from '@/utils/common'
import { timeLabel } from '@/utils/time'
import { FORESHADOWING_STATUS_LABELS, type Foreshadowing, type ForeshadowingStatus } from '@/types/meta'
import type { Character } from '@/types'
import type { Priority } from '@/types/base'
import type { StoryEvent } from '@/types/world'

const STATUS_FILTERS: Array<'all' | ForeshadowingStatus> = ['all', 'active', 'resolved', 'abandoned']
const STATUS_BADGE: Record<ForeshadowingStatus, 'violet' | 'green' | 'slate'> = {
  active: 'violet',
  resolved: 'green',
  abandoned: 'slate',
}
const PRIORITY_BADGE: Record<Priority, 'red' | 'amber' | 'slate'> = {
  high: 'red',
  medium: 'amber',
  low: 'slate',
}

/** 伏笔管理页（Sprint 6 US-601：手动标记伏笔，描述 + 优先级 + 预期回收事件，列表管理） */
export default function ForeshadowingsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const project = useProjectStore((s) => s.currentProject())
  const { items: foreshadowings, loaded, refresh } = useProjectEntityList(foreshadowingRepo, projectId)
  const { items: characters } = useProjectEntityList(characterRepo, projectId)
  const { items: events } = useProjectEntityList(eventRepo, projectId)
  const { items: outlineNodes } = useProjectEntityList(outlineRepo, projectId)

  const [statusFilter, setStatusFilter] = useState<'all' | ForeshadowingStatus>('all')
  const [editing, setEditing] = useState<Foreshadowing | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Foreshadowing | null>(null)

  const charById = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters])
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events])
  /** 大纲节点对伏笔的埋设/回收引用计数（跨模块展示） */
  const outlineUses = useMemo(() => {
    const map = new Map<string, { planted: number; resolved: number }>()
    for (const n of outlineNodes) {
      for (const pid of n.foreshadowingPlantedIds ?? []) {
        const u = map.get(pid) ?? { planted: 0, resolved: 0 }
        u.planted += 1
        map.set(pid, u)
      }
      for (const rid of n.foreshadowingResolvedIds ?? []) {
        const u = map.get(rid) ?? { planted: 0, resolved: 0 }
        u.resolved += 1
        map.set(rid, u)
      }
    }
    return map
  }, [outlineNodes])

  const filtered = useMemo(() => {
    const list = [...foreshadowings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return statusFilter === 'all' ? list : list.filter((f) => f.status === statusFilter)
  }, [foreshadowings, statusFilter])

  const count = (s: 'all' | ForeshadowingStatus) =>
    s === 'all' ? foreshadowings.length : foreshadowings.filter((f) => f.status === s).length

  async function handleDelete() {
    if (!deleting) return
    await deleteForeshadowingCascade(deleting.id)
    setDeleting(null)
    void refresh()
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">伏笔管理</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {project?.name} · 共 {foreshadowings.length} 条 · 活跃 {count('active')} 条
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus className="size-4" /> 新建伏笔
        </Button>
      </div>

      {/* 状态筛选 */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors',
              statusFilter === s
                ? 'bg-violet-700 text-white'
                : 'border border-stone-200 bg-white text-stone-500 hover:border-violet-300 hover:text-violet-700',
            )}
          >
            {s === 'all' ? '全部' : FORESHADOWING_STATUS_LABELS[s]}
            <span className="ml-1 opacity-70">{count(s)}</span>
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="h-96 animate-pulse rounded-2xl bg-stone-200/60" />
      ) : foreshadowings.length === 0 ? (
        <EmptyState
          icon={<Flag className="size-6" />}
          title="还没有伏笔"
          description="记录埋下的悬念与暗示，标记优先级与预期回收事件，时间线会同步显示待回收节点。"
          action={
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus className="size-4" /> 新建伏笔
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Flag className="size-6" />} title="当前状态下没有伏笔" description="切换上方状态筛选查看其它伏笔。" />
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((f) => {
            const anchorEvent = f.expectedResolveEventId ? eventById.get(f.expectedResolveEventId) : undefined
            const u = outlineUses.get(f.id)
            const chars = f.relatedCharacterIds.map((id) => charById.get(id)).filter((c): c is Character => Boolean(c))
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setEditing(f)}
                  className="group w-full cursor-pointer rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-violet-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-serif-sc text-[15px] font-bold leading-relaxed text-stone-900">{f.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-stone-500">
                        <Badge color={PRIORITY_BADGE[f.priority]}>{f.priority === 'high' ? '高优先' : f.priority === 'medium' ? '中优先' : '低优先'}</Badge>
                        <Badge color={STATUS_BADGE[f.status]}>{FORESHADOWING_STATUS_LABELS[f.status]}</Badge>
                        {anchorEvent ? (
                          <span className="inline-flex items-center gap-1 text-violet-700">
                            <Anchor className="size-3.5" />
                            预期回收：{timeLabel(anchorEvent.time) || '时间未定'} · {anchorEvent.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-stone-400">
                            <Anchor className="size-3.5" />
                            未设预期回收事件
                          </span>
                        )}
                        {u && (u.planted > 0 || u.resolved > 0) && (
                          <span className="text-stone-400">
                            {u.planted > 0 && `大纲埋设 ${u.planted} 处`}
                            {u.planted > 0 && u.resolved > 0 && ' · '}
                            {u.resolved > 0 && `大纲回收 ${u.resolved} 处`}
                          </span>
                        )}
                      </div>
                      {chars.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          {chars.slice(0, 5).map((c) => (
                            <span key={c.id} className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                              {c.name}
                            </span>
                          ))}
                          {chars.length > 5 && <span className="text-[11px] text-stone-400">等 {chars.length} 人</span>}
                        </div>
                      )}
                    </div>
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleting(f)
                      }}
                      className="shrink-0 rounded-lg p-1.5 text-stone-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 cursor-pointer"
                      aria-label={`删除伏笔：${f.description}`}
                    >
                      <Trash2 className="size-4" />
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-stone-300">更新于 {new Date(f.updatedAt).toLocaleString('zh-CN', { hour12: false })}</div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {editing && (
        <ForeshadowingFormModal
          key={editing === 'new' ? 'new' : editing.id}
          projectId={projectId!}
          editing={editing}
          characters={characters}
          events={events}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void refresh()
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="删除伏笔"
        description={deleting ? `确定删除「${deleting.description.slice(0, 40)}${deleting.description.length > 40 ? '…' : ''}」吗？将同步解除其在大纲中的埋设/回收引用。` : undefined}
        confirmText="删除"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}

/** 新建/编辑伏笔弹窗（US-601：描述、优先级、状态、预期回收事件、相关人物） */
function ForeshadowingFormModal({
  projectId,
  editing,
  characters,
  events,
  onClose,
  onSaved,
}: {
  projectId: string
  editing: Foreshadowing | 'new'
  characters: Character[]
  events: StoryEvent[]
  onClose: () => void
  onSaved: () => void
}) {
  const isNew = editing === 'new'
  const existing = !isNew ? (editing as Foreshadowing) : null
  const [description, setDescription] = useState(isNew ? '' : editing.description)
  const [priority, setPriority] = useState<Priority>(isNew ? 'medium' : editing.priority)
  const [status, setStatus] = useState<ForeshadowingStatus>(isNew ? 'active' : editing.status)
  const [resolveEventId, setResolveEventId] = useState(isNew ? '' : editing.expectedResolveEventId ?? '')
  const [charIds, setCharIds] = useState<string[]>(isNew ? [] : editing.relatedCharacterIds)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    const desc = description.trim()
    if (!desc) {
      setError('请填写伏笔描述')
      return
    }
    setSaving(true)
    try {
      const patch = {
        description: desc,
        priority,
        status,
        expectedResolveEventId: resolveEventId || undefined,
        relatedCharacterIds: charIds,
      }
      if (isNew) {
        await foreshadowingRepo.add(
          createEntity<Foreshadowing>(projectId, { ...patch, relatedEventIds: [] }),
        )
      } else if (existing) {
        await foreshadowingRepo.update(existing.id, patch)
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? '新建伏笔' : '编辑伏笔'}
      description="伏笔：埋在故事中的悬念或暗示，可在时间线查看预期回收位置。"
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void handleSave()}>
            保存
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleSave()
        }}
        className="space-y-4"
      >
        <Field label="伏笔描述" required hint="如：主角捡到的神秘戒指，似与百年前的封印有关">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="这条伏笔埋下了什么？回收时揭晓什么？" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="优先级">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="high">高 · 主线关键</option>
              <option value="medium">中 · 重要暗示</option>
              <option value="low">低 · 彩蛋细节</option>
            </Select>
          </Field>
          <Field label="状态">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ForeshadowingStatus)} disabled={isNew}>
              <option value="active">活跃（待回收）</option>
              <option value="resolved">已回收</option>
              <option value="abandoned">已废弃</option>
            </Select>
          </Field>
        </div>
        <Field
          label="预期回收事件"
          hint={
            events.length === 0
              ? '先在「事件」页创建剧情事件，再把伏笔锚到预计回收的事件上'
              : '锚定后该伏笔会出现在时间线的对应位置'
          }
        >
          <Select value={resolveEventId} onChange={(e) => setResolveEventId(e.target.value)}>
            <option value="">未设置</option>
            {[...events]
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {`${timeLabel(e.time) || '时间未定'} · ${e.name}`.slice(0, 60)}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="相关人物" hint="参与这条伏笔的人物（在角色时间线中会看到它）">
          <CharacterMultiSelect characters={characters} value={charIds} onChange={setCharIds} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
