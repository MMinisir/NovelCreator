import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarClock, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, Select, Textarea, cn } from '@/components/ui'
import { useProjectStore } from '@/stores/projectStore'
import { useProjectEntityList } from '@/hooks/useProjectEntityList'
import { characterRepo, deleteEventCascade, eventRepo, locationRepo } from '@/db/repositories'
import { createEntity } from '@/utils/common'
import { compareFlexibleTime } from '@/utils/time'
import type { Character, FlexibleTimestamp, Location, StoryEvent } from '@/types'
import { CharacterMultiSelect } from '@/components/people/CharacterMultiSelect'
import { RichTextEditor } from '@/components/rich/RichTextEditor'
import { FlexibleTimeEditor } from '@/components/time/FlexibleTimeEditor'
import { timeLabel } from '@/utils/time'

import { EVENT_TYPES, EVENT_TYPE_STYLE } from '@/utils/eventTypes'

/** 事件管理页（US-106：创建/编辑事件，含时间戳、参与者、地点、结果，按时间排序） */
export default function EventsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const currentProject = useProjectStore((s) => s.currentProject())
  const { items: events, loaded, loading, refresh } = useProjectEntityList(eventRepo, projectId)
  const { items: characters } = useProjectEntityList(characterRepo, projectId)
  const { items: locations } = useProjectEntityList(locationRepo, projectId)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [editing, setEditing] = useState<StoryEvent | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<StoryEvent | null>(null)

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    return events
      .filter((e) => (typeFilter === 'all' ? true : e.type === typeFilter))
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          compareFlexibleTime(a.time, b.time) ||
          b.updatedAt.localeCompare(a.updatedAt),
      )
  }, [events, query, typeFilter])

  const nameOf = {
    location: (id?: string) => locations.find((l) => l.id === id)?.name,
    character: (id: string) => characters.find((c) => c.id === id),
  }

  async function handleDelete() {
    if (!deleting) return
    await deleteEventCascade(deleting.id)
    setDeleting(null)
    void refresh()
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">事件</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {currentProject?.name} · 共 {events.length} 个事件，按时间排序
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> 新建事件
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索事件…" className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['all', ...EVENT_TYPES] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
                typeFilter === t
                  ? 'bg-violet-700 text-white'
                  : 'border border-stone-200 bg-white text-stone-500 hover:border-violet-300 hover:text-violet-700',
              )}
            >
              {t === 'all' ? '全部' : t}
            </button>
          ))}
        </div>
      </div>

      {loading && !loaded ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-stone-200/60" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="size-6" />}
          title={events.length === 0 ? '还没有事件' : '没有匹配的事件'}
          description="记录剧情的推进节点：战斗、转折、日常，为时间线与大纲提供素材。"
          action={
            events.length === 0 ? (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus className="size-4" /> 新建事件
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="relative space-y-3">
          {sorted.map((e) => (
            <li
              key={e.id}
              className="group rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-28 shrink-0 text-xs font-semibold text-violet-700">
                  <div>{timeLabel(e.time) || '时间未定'}</div>
                  {e.importance > 0 && (
                    <div className="mt-0.5 flex text-amber-400">
                      {Array.from({ length: e.importance }).map((_, i) => (
                        <Star key={i} className="size-2.5 fill-current" />
                      ))}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-serif-sc text-base font-bold text-stone-900">{e.name}</h3>
                    <span
                      className={cn('rounded-full px-2 py-0.5 text-xs', EVENT_TYPE_STYLE[e.type] ?? EVENT_TYPE_STYLE['其他'])}
                    >
                      {e.type}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-400">
                    {nameOf.location(e.locationId) && <span>📍 {nameOf.location(e.locationId)}</span>}
                    {e.participantIds.length > 0 && (
                      <span>
                        参与者：
                        {e.participantIds.map((pid, i) => (
                          <span key={pid}>
                            {i > 0 && '、'}
                            <span className="font-medium text-stone-500">{nameOf.character(pid)?.name ?? '未知'}</span>
                          </span>
                        ))}
                      </span>
                    )}
                    {e.outcome && <span className="truncate text-emerald-700">→ {e.outcome}</span>}
                  </div>
                  {e.description && (
                    <div
                      className="rich-display mt-1.5 line-clamp-2 text-sm leading-relaxed text-stone-500"
                      dangerouslySetInnerHTML={{ __html: e.description }}
                    />
                  )}
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>
                    <Pencil className="size-3.5" /> 编辑
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(e)}>
                    <Trash2 className="size-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <EventFormModal
          projectId={projectId ?? ''}
          characters={characters}
          locations={locations}
          existing={editing ?? undefined}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            void refresh()
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="删除事件"
        description={deleting ? `确定删除事件「${deleting.name}」吗？相关引用将一并清理。` : undefined}
        confirmText="删除"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}

/** 事件编辑弹窗 */
function EventFormModal({
  projectId,
  characters,
  locations,
  existing,
  onClose,
  onSaved,
}: {
  projectId: string
  characters: Character[]
  locations: Location[]
  existing?: StoryEvent
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [type, setType] = useState(existing?.type ?? EVENT_TYPES[0])
  const [time, setTime] = useState<FlexibleTimestamp>(existing?.time ?? { type: 'fuzzy', value: '' })
  const [importance, setImportance] = useState(existing?.importance ?? 3)
  const [locationId, setLocationId] = useState(existing?.locationId ?? '')
  const [participants, setParticipants] = useState<string[]>(existing?.participantIds ?? [])
  const [description, setDescription] = useState(existing?.description ?? '')
  const [outcome, setOutcome] = useState(existing?.outcome ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) {
      setError('请填写事件名称')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: name.trim(),
        type,
        time,
        importance,
        locationId: locationId || undefined,
        participantIds: participants,
        description: description || undefined,
        outcome: outcome.trim() || undefined,
        sortWeight: existing?.sortWeight ?? 0,
      }
      if (existing) {
        await eventRepo.update(existing.id, payload)
      } else {
        const entity = createEntity<StoryEvent>(projectId, {
          ...payload,
          foreshadowingIds: [],
          sortWeight: 0,
        })
        await eventRepo.add(entity)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? '编辑事件' : '新建事件'}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={() => void handleSave()} loading={saving}>
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
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="事件名称" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：青云大比决赛" autoFocus />
          </Field>
          <Field label="重要性">
            <div className="flex h-10 items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setImportance(n)}
                  className={cn('p-1 cursor-pointer', n <= importance ? 'text-amber-400' : 'text-stone-200')}
                  aria-label={`${n} 星`}
                >
                  <Star className="size-5 fill-current" />
                </button>
              ))}
              <span className="ml-2 text-xs text-stone-400">{importance} / 5</span>
            </div>
          </Field>
        </div>

        <Field label="发生时间" hint="支持精确日期、章节时间或模糊时间（如“三年后”）">
          <FlexibleTimeEditor value={time} onChange={setTime} />
        </Field>

        <Field label="事件类型">
          <div className="flex flex-wrap gap-1.5">
            {EVENT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs transition-colors cursor-pointer',
                  type === t ? 'bg-violet-700 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="发生地点">
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">未指定</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="参与者">
            <div className="pt-1">
              <CharacterMultiSelect characters={characters} value={participants} onChange={setParticipants} placeholder="搜索人物…" />
            </div>
          </Field>
        </div>

        <Field label="事件描述">
          <RichTextEditor value={description} onChange={setDescription} placeholder="发生了什么、关键细节……" minHeight="min-h-28" />
        </Field>
        <Field label="结果 / 影响">
          <Textarea
            rows={2}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="事件造成的影响，如：林澈夺得榜首，暴露金丹修为"
          />
        </Field>
      </form>
    </Modal>
  )
}
