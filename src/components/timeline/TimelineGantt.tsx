import { useMemo, useState } from 'react'
import { Info, Pencil } from 'lucide-react'
import { cn } from '@/components/ui'
import { timeLabel } from '@/utils/time'
import { EVENT_TYPES, EVENT_TYPE_STYLE } from '@/utils/eventTypes'
import type { TimelineItem } from '@/utils/timeline'
import type { Character, Location } from '@/types'

/** 列宽 / 行高 / 最大展示列数（事件过多时提示用户用筛选缩小范围） */
const COL_W = 56
const ROW_H = 36
const MAX_COLUMNS = 150

/** 事件类型 → 实心色点（甘特图节点用） */
const EVENT_DOT: Record<string, string> = {
  主线: 'bg-violet-500',
  支线: 'bg-sky-500',
  日常: 'bg-stone-400',
  战斗: 'bg-red-500',
  感情: 'bg-rose-500',
  转折: 'bg-amber-500',
  伏笔: 'bg-orange-500',
  回收: 'bg-emerald-500',
  其他: 'bg-stone-400',
}

type GroupBy = 'character' | 'location'

/**
 * 时间线甘特视图（US-304 扩展）：
 * X 轴 = 当前筛选后的**事件顺序**（模糊/相对时间同样可排布，与列表视图排序一致）；
 * Y 轴 = 泳道（按人物或按地点），色点表示该泳道参与/发生在该事件，横条表示活跃区间；
 * 点击列头或色点查看事件详情（可跳转事件页编辑）。
 */
export default function TimelineGantt({
  columns,
  characters,
  locations,
  charName,
  locName,
  onEdit,
}: {
  /** 事件列（已按时间线顺序排序，来自列表视图的同一份数据） */
  columns: TimelineItem[]
  characters: Character[]
  locations: Location[]
  charName: (id: string) => string
  locName: (id?: string) => string
  /** 点击「编辑事件」回调（由页面打开快速编辑弹窗） */
  onEdit: (eventId: string) => void
}) {
  const [groupBy, setGroupBy] = useState<GroupBy>('character')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const shown = useMemo(() => columns.slice(0, MAX_COLUMNS), [columns])
  const selected = useMemo(() => columns.find((c) => c.key === selectedKey), [columns, selectedKey])

  const lanes = useMemo(() => {
    const idxOf = (pred: (t: TimelineItem) => boolean) =>
      shown.map((t, i) => (pred(t) ? i : -1)).filter((i) => i >= 0)
    if (groupBy === 'character') {
      return characters
        .map((c) => ({ id: c.id, label: c.name, idxs: idxOf((t) => t.participantIds.includes(c.id)) }))
        .filter((l) => l.idxs.length > 0)
    }
    const list = locations
      .map((l) => ({ id: l.id, label: l.name, idxs: idxOf((t) => t.locationId === l.id) }))
      .filter((l) => l.idxs.length > 0)
    const unassigned = idxOf((t) => !t.locationId)
    if (unassigned.length > 0) list.push({ id: '__none__', label: '未指定地点', idxs: unassigned })
    return list
  }, [groupBy, characters, locations, shown])

  const inLane = (t: TimelineItem, laneId: string) =>
    groupBy === 'character'
      ? t.participantIds.includes(laneId)
      : laneId === '__none__'
        ? !t.locationId
        : t.locationId === laneId

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-stone-400">泳道：</span>
        <div className="inline-flex rounded-full border border-stone-200 bg-white p-0.5">
          {(
            [
              { key: 'character', label: '按人物' },
              { key: 'location', label: '按地点' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setGroupBy(opt.key)}
              className={cn(
                'cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors',
                groupBy === opt.key ? 'bg-violet-700 text-white' : 'text-stone-500 hover:text-violet-700',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="ml-auto inline-flex items-center gap-1 text-stone-400">
          <Info className="size-3.5" />
          {shown.length} 列（事件顺序）
          {columns.length > shown.length && ` · 仅显示前 ${MAX_COLUMNS} 个，请用上方筛选缩小范围`}
        </span>
      </div>

      {selected && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs text-stone-600">
          <span className="font-semibold text-stone-800">{selected.name}</span>
          <span>{timeLabel(selected.time) || '时间未定'}</span>
          {selected.eventType && (
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', EVENT_TYPE_STYLE[selected.eventType] ?? EVENT_TYPE_STYLE['其他'])}>
              {selected.eventType}
            </span>
          )}
          {selected.importance ? <span className="text-amber-500">{'★'.repeat(selected.importance)}</span> : null}
          {locName(selected.locationId) && <span>📍 {locName(selected.locationId)}</span>}
          {selected.participantIds.length > 0 && (
            <span className="truncate">参与者：{selected.participantIds.map((id) => charName(id)).join('、')}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => onEdit(selected.id)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-violet-700 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-violet-800"
              title="快速编辑该事件（名称/时间/类型/地点/参与者）"
            >
              <Pencil className="size-3" /> 编辑事件
            </button>
            <button
              type="button"
              onClick={() => setSelectedKey(null)}
              className="cursor-pointer text-stone-400 hover:text-stone-600"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {columns.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-400">
          当前筛选下没有事件，无法生成甘特图。请调整上方筛选条件，或先在「事件」页记录剧情节点。
        </p>
      ) : lanes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-400">
          当前筛选下没有可展示的{groupBy === 'character' ? '人物' : '地点'}泳道：请检查事件是否填写了参与者 / 地点，或切换泳道分组。
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="max-h-[560px] overflow-auto">
            <div className="min-w-max">
              {/* 列头：事件序号 + 时间标签 */}
              <div className="sticky top-0 z-20 flex bg-stone-50/95 backdrop-blur">
                <div className="sticky left-0 z-30 w-36 shrink-0 border-b border-r border-stone-200 bg-stone-50 px-2 py-1.5 text-[11px] font-semibold text-stone-500">
                  {groupBy === 'character' ? '人物' : '地点'}
                </div>
                {shown.map((t, i) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setSelectedKey(t.key)}
                    title={`${i + 1}. ${t.name}`}
                    className={cn(
                      'w-14 shrink-0 cursor-pointer border-b border-l border-stone-100 px-0.5 py-1 text-center transition-colors hover:bg-violet-50',
                      selectedKey === t.key && 'bg-violet-100/70',
                    )}
                  >
                    <div className="text-[10px] text-stone-400">{i + 1}</div>
                    <div className="truncate text-[10px] text-stone-500">{timeLabel(t.time) || '未定'}</div>
                  </button>
                ))}
              </div>

              {/* 泳道行 */}
              {lanes.map((lane) => {
                const first = lane.idxs[0]
                const last = lane.idxs[lane.idxs.length - 1]
                return (
                  <div key={lane.id} className="flex border-b border-stone-100 last:border-b-0">
                    <div
                      className="sticky left-0 z-10 w-36 shrink-0 truncate border-r border-stone-200 bg-white px-2 py-2 text-xs font-medium text-stone-700"
                      title={lane.label}
                    >
                      {lane.label}
                      <span className="ml-1 text-[10px] font-normal text-stone-400">{lane.idxs.length}</span>
                    </div>
                    <div className="relative flex" style={{ width: shown.length * COL_W, height: ROW_H }}>
                      {/* 活跃区间横条 */}
                      <span
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-violet-100"
                        style={{ left: first * COL_W + COL_W / 2, width: (last - first) * COL_W }}
                      />
                      {shown.map((t) => (
                        <div
                          key={t.key}
                          className={cn(
                            'flex h-full w-14 shrink-0 items-center justify-center border-l border-stone-100',
                            selectedKey === t.key && 'bg-violet-50/60',
                          )}
                        >
                          {inLane(t, lane.id) && (
                            <button
                              type="button"
                              onClick={() => setSelectedKey(t.key)}
                              title={`${t.name} · ${timeLabel(t.time) || '时间未定'}`}
                              className={cn(
                                'size-3.5 cursor-pointer rounded-full shadow-sm transition-transform hover:scale-125',
                                EVENT_DOT[t.eventType ?? '其他'] ?? 'bg-violet-500',
                              )}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 图例 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-stone-400">
        <span>事件类型：</span>
        {EVENT_TYPES.map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            <span className={cn('size-2.5 rounded-full', EVENT_DOT[t])} />
            {t}
          </span>
        ))}
        <span className="ml-auto">紫色横条 = 该{groupBy === 'character' ? '人物' : '地点'}的活跃区间（首次→末次出现）</span>
      </div>
    </div>
  )
}
