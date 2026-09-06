import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { List, type ListImperativeAPI, type RowComponentProps } from 'react-window'
import { ArrowDown, ArrowUp, CalendarClock, Clock, Info } from 'lucide-react'
import { Badge, Button, EmptyState, Select, cn } from '@/components/ui'
import { useProjectStore } from '@/stores/projectStore'
import { useProjectEntityList } from '@/hooks/useProjectEntityList'
import { characterRepo, characterStateRepo, eventRepo, locationRepo } from '@/db/repositories'
import { timeLabel } from '@/utils/time'
import { EVENT_TYPES, EVENT_TYPE_STYLE } from '@/utils/eventTypes'
import {
  buildTimelineItems,
  canSwapAdjacent,
  compareTimelineItems,
  manualKindOf,
  needsManualNormalize,
  normalizeManualSegment,
  type ManualWrite,
  type TimelineItem,
} from '@/utils/timeline'
import type { CharacterStateKind, StoryEvent } from '@/types'

/** 状态变化徽标配色（与人物详情状态历史一致） */
const STATE_KIND_STYLE: Record<CharacterStateKind, string> = {
  upgrade: 'bg-violet-100 text-violet-700',
  injury: 'bg-red-100 text-red-700',
  death: 'bg-stone-200 text-stone-600',
  corruption: 'bg-amber-100 text-amber-700',
  recovery: 'bg-emerald-100 text-emerald-700',
  custom: 'bg-sky-100 text-sky-700',
}
const STATE_KIND_LABEL: Record<CharacterStateKind, string> = {
  upgrade: '升级',
  injury: '受伤',
  death: '死亡',
  corruption: '黑化',
  recovery: '恢复',
  custom: '变化',
}

const ITEM_HEIGHT = 92

interface TimelineRowData {
  rows: TimelineItem[]
  charName: (id: string) => string
  locName: (id?: string) => string
  onMove: (index: number, dir: -1 | 1) => void
  busy: boolean
}

/** 时间线页（Sprint 5：US-301 全局虚拟时间线 / US-302 筛选 / US-303 模糊排序 / US-304 角色时间线） */
export default function TimelinePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const currentProject = useProjectStore((s) => s.currentProject())
  const { items: events, loaded, loading, setItems, refresh } = useProjectEntityList(eventRepo, projectId)
  const { items: characters } = useProjectEntityList(characterRepo, projectId)
  const { items: locations } = useProjectEntityList(locationRepo, projectId)
  const { items: allStates } = useProjectEntityList(characterStateRepo, projectId)

  const [person, setPerson] = useState<string>('all') // all = 全局时间线；选中 = 角色时间线
  const [locationId, setLocationId] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<ListImperativeAPI | null>(null)

  const charById = useMemo(() => {
    const map = new Map(characters.map((c) => [c.id, c]))
    return { byId: (id: string) => map.get(id) }
  }, [characters])

  /** 角色时间线需合并该人物的状态变化 */
  const statesForPerson = useMemo(() => {
    if (person === 'all') return []
    return allStates.filter((s) => s.characterId === person)
  }, [allStates, person])

  const baseRows = useMemo(
    () =>
      buildTimelineItems({
        events,
        states: statesForPerson,
        charById: (id) => charById.byId(id),
      }),
    [events, statesForPerson, charById],
  )

  /** 筛选（US-302）：人物参与 / 地点 / 类型；状态行不受地点类型筛选影响 */
  const rows = useMemo(() => {
    return baseRows.filter((r) => {
      if (r.kind === 'state') return true
      if (person !== 'all' && !r.participantIds.includes(person)) return false
      if (locationId !== 'all' && r.locationId !== locationId) return false
      if (typeFilter !== 'all' && r.eventType !== typeFilter) return false
      return true
    })
  }, [baseRows, person, locationId, typeFilter])

  const selectedChar = person !== 'all' ? charById.byId(person) : null
  const manualCount = rows.filter((r) => r.kind === 'event' && manualKindOf(r.time)).length

  useEffect(() => {
    if (rows.length > 0) listRef.current?.scrollToRow({ index: 0, align: 'start' })
  }, [rows, person, locationId, typeFilter])

  async function applyWrites(writes: ManualWrite[]) {
    if (!writes.length) return
    await Promise.all(writes.map((w) => eventRepo.update(w.id, { time: w.time })))
    const map = new Map(writes.map((w) => [w.id, w.time]))
    setItems((prev: StoryEvent[]) => prev.map((e) => (map.has(e.id) ? { ...e, time: map.get(e.id)! } : e)))
  }

  /** US-303：模糊/相对事件在同类段内上移/下移一格 */
  async function handleMove(index: number, dir: -1 | 1) {
    const a = rows[index]
    const b = rows[index + dir]
    if (!a || !b || busy) return
    const mk = manualKindOf(a.time)
    if (!mk || mk !== manualKindOf(b.time)) return

    setBusy(true)
    try {
      // 全量同段事件（排序后为期望顺序）—— 首次移动前先归一序号
      const segment: ManualWrite[] = events
        .filter((e) => manualKindOf(e.time) === mk)
        .sort((x, y) => compareTimelineItems({ time: x.time, updatedAt: x.updatedAt }, { time: y.time, updatedAt: y.updatedAt }))
        .map((e) => ({ id: e.id, time: e.time }))
      const writes: ManualWrite[] = []
      if (needsManualNormalize(segment)) writes.push(...normalizeManualSegment(segment))

      // 交换相邻两条的 sortOrder（归一后段内顺序即展示顺序）
      const ia = segment.findIndex((s) => s.id === a.id)
      const ib = segment.findIndex((s) => s.id === b.id)
      if (ia >= 0 && ib >= 0) {
        writes.push({ id: a.id, time: { ...a.time, sortOrder: ib } }, { id: b.id, time: { ...b.time, sortOrder: ia } })
      }
      await applyWrites(writes)
    } finally {
      setBusy(false)
    }
  }

  const charName = (id: string) => charById.byId(id)?.name ?? '未知'
  const locName = (id?: string) => (id ? (locations.find((l) => l.id === id)?.name ?? '') : '')
  const rowKey = useCallback((i: number) => rows[i]?.key ?? i, [rows])

  const itemData: TimelineRowData = useMemo(
    () => ({ rows, charName, locName, onMove: handleMove, busy }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, locations, characters, busy],
  )

  return (
    <div className="flex flex-col">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">
            {selectedChar ? `时间线 · ${selectedChar.name}` : '全局时间线'}
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {currentProject?.name} · 共 {events.length} 个事件
            {rows.length !== baseRows.length && `（当前视图 ${rows.length} 条）`}
            {selectedChar && ` · 含 ${statesForPerson.length} 次状态变化`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="../events" className="text-sm font-medium text-violet-600 hover:text-violet-800">
            去事件页管理 <span aria-hidden>→</span>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            <Clock className="size-4" /> 刷新
          </Button>
        </div>
      </div>

      {/* 筛选工具条（US-302 + US-304 模式切换） */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="w-44">
          <Select
            value={person}
            onChange={(e) => {
              setPerson(e.target.value)
              setLocationId('all')
              setTypeFilter('all')
            }}
          >
            <option value="all">全局（全部事件）</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} 的时间线
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="all">全部地点</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['all', ...EVENT_TYPES] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                'cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                typeFilter === t
                  ? 'bg-violet-700 text-white'
                  : 'border border-stone-200 bg-white text-stone-500 hover:border-violet-300 hover:text-violet-700',
              )}
            >
              {t === 'all' ? '全部类型' : t}
            </button>
          ))}
        </div>
      </div>

      {loading && !loaded ? (
        <div className="h-[560px] animate-pulse rounded-2xl bg-stone-200/60" />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="size-6" />}
          title="还没有事件"
          description="先在「事件」页记录剧情推进节点，这里会按时间顺序呈现完整时间线。"
          action={
            <Link to="../events" className="text-sm font-medium text-violet-600 hover:text-violet-800">
              去创建事件
            </Link>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="size-6" />}
          title="没有匹配的事件"
          description="调整筛选条件，或切换回全局视图。"
        />
      ) : (
        <>
          <div className="mb-2 flex items-center gap-1.5 text-xs text-stone-400">
            <Info className="size-3.5" />
            {selectedChar
              ? '角色时间线：合并该人物的参与事件与状态变化。'
              : '按时间排序 · 支持 2000+ 事件流畅滚动。模糊/相对时间的事件可手动调整顺序。'}
            {manualCount > 0 && ` · 可排序的模糊/相对事件 ${manualCount} 条`}
          </div>
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white/60 shadow-sm">
            <List
              listRef={listRef}
              rowCount={rows.length}
              rowHeight={ITEM_HEIGHT}
              rowProps={itemData}
              rowKey={rowKey}
              overscanCount={6}
              style={{ height: 560 }}
              className="w-full"
              rowComponent={TimelineRow}
            />
          </div>
        </>
      )}
    </div>
  )
}

function TimelineRow({
  index,
  style,
  rows,
  charName,
  locName,
  onMove,
  busy,
}: RowComponentProps<TimelineRowData>) {
  const row = rows[index]
  const prev = rows[index - 1]
  const next = rows[index + 1]
  const isEvent = row.kind === 'event'
  const canUp = isEvent && canSwapAdjacent(row.time, prev?.time) && !busy
  const canDown = isEvent && canSwapAdjacent(row.time, next?.time) && !busy
  const dotColor = isEvent ? 'bg-violet-500' : 'border-2 border-amber-500 bg-white'

  return (
    <div style={style} className="relative w-full pr-1">
      {/* 时间线轴线与节点 */}
      <span aria-hidden className="absolute bottom-0 left-4 top-0 w-px bg-stone-200" />
      <span aria-hidden className={cn('absolute left-4 top-[38px] size-2.5 -translate-x-1/2 rounded-full', dotColor)} />
      <div className="ml-10 flex h-[80px] items-stretch gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
        {/* 时间标签 */}
        <div className="w-28 shrink-0 pt-0.5">
          <div className={cn('text-xs font-semibold', isEvent ? 'text-violet-700' : 'text-amber-700')}>
            {timeLabel(row.time) || '时间未定'}
          </div>
          {row.importance && row.importance > 0 && (
            <div className="mt-1 text-[10px] text-stone-300">{"★".repeat(row.importance)}</div>
          )}
        </div>
        {/* 主体 */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {!isEvent && (
              <>
                <Badge color="amber">{row.charName}</Badge>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATE_KIND_STYLE[row.stateKind ?? 'custom'])}>
                  {STATE_KIND_LABEL[row.stateKind ?? 'custom']}
                </span>
              </>
            )}
            <h3 className="truncate font-serif-sc text-sm font-bold text-stone-900">{row.name}</h3>
            {isEvent && row.eventType && (
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', EVENT_TYPE_STYLE[row.eventType] ?? EVENT_TYPE_STYLE['其他'])}>
                {row.eventType}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-400">
            {isEvent && locName(row.locationId) && <span>📍 {locName(row.locationId)}</span>}
            {isEvent && row.participantIds.length > 0 && (
              <span className="truncate">
                参与者：
                {row.participantIds.slice(0, 4).map((pid, i) => (
                  <span key={pid}>
                    {i > 0 && '、'}
                    <span className="font-medium text-stone-500">{charName(pid)}</span>
                  </span>
                ))}
                {row.participantIds.length > 4 && ` 等 ${row.participantIds.length} 人`}
              </span>
            )}
          </div>
        </div>
        {/* 手动排序（US-303） */}
        {isEvent && manualKindOf(row.time) && (
          <div className="flex shrink-0 flex-col items-center justify-center gap-0.5">
            <button
              type="button"
              disabled={!canUp}
              onClick={() => onMove(index, -1)}
              className="cursor-pointer rounded p-0.5 text-stone-400 transition-colors hover:bg-violet-50 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent"
              aria-label="在模糊事件中上移一位"
            >
              <ArrowUp className="size-4" />
            </button>
            <button
              type="button"
              disabled={!canDown}
              onClick={() => onMove(index, 1)}
              className="cursor-pointer rounded p-0.5 text-stone-400 transition-colors hover:bg-violet-50 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent"
              aria-label="在模糊事件中下移一位"
            >
              <ArrowDown className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
