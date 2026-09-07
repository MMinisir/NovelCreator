import { useMemo } from 'react'
import { Flag, MapPin, ScrollText, Sparkles, Users } from 'lucide-react'
import { Badge } from '@/components/ui'
import { stripHtml } from '@/services/outline'
import { timeLabel } from '@/utils/time'
import { FORESHADOWING_STATUS_LABELS, type Foreshadowing } from '@/types/meta'
import type { Character, Location, StoryEvent } from '@/types'
import type { Chapter } from '@/types/chapter'
import type { OutlineNode } from '@/types/outline'

/**
 * 写作侧边参考面板（Sprint 8 US-501b 分屏 / US-505 关联设定）：
 * 依据章节关联的大纲细纲展示人物（含当前状态）、地点、伏笔与关键事件；
 * 自由章节退化为按正文提及的人物/地点名匹配。
 */
export default function ReferencePanel({
  chapter,
  outlineNodes,
  characters,
  locations,
  events,
  foreshadowings,
}: {
  chapter: Chapter
  outlineNodes: OutlineNode[]
  characters: Character[]
  locations: Location[]
  events: StoryEvent[]
  foreshadowings: Foreshadowing[]
}) {
  const node = useMemo(
    () => outlineNodes.find((n) => n.id === chapter.outlineNodeId),
    [outlineNodes, chapter.outlineNodeId],
  )
  const plain = useMemo(() => stripHtml(chapter.content ?? ''), [chapter.content])
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events])

  const linkedCharIds = node?.characterIds ?? []
  const linkedChars = useMemo(
    () => characters.filter((c) => linkedCharIds.includes(c.id)),
    [characters, linkedCharIds.join(',')], // eslint-disable-line react-hooks/exhaustive-deps
  )
  /** 正文提及但未在细纲中标记的人物（自由章节兜底） */
  const mentionedChars = useMemo(
    () =>
      characters.filter(
        (c) =>
          !linkedCharIds.includes(c.id) &&
          ((c.name && plain.includes(c.name)) || c.aliases.some((a) => a && plain.includes(a))),
      ),
    [characters, plain, linkedCharIds.join(',')], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const linkedLocation = node?.scene?.locationId
    ? locations.find((l) => l.id === node.scene?.locationId)
    : undefined
  const mentionedLocations = useMemo(
    () => locations.filter((l) => l.id !== linkedLocation?.id && l.name && plain.includes(l.name)).slice(0, 5),
    [locations, plain, linkedLocation?.id],
  )

  /** 本章埋设/回收的伏笔 */
  const nodeForeshadowings = useMemo(() => {
    if (!node) return []
    const ids = new Set([...(node.foreshadowingPlantedIds ?? []), ...(node.foreshadowingResolvedIds ?? [])])
    return foreshadowings.filter((f) => ids.has(f.id))
  }, [foreshadowings, node])
  /** 其它活跃待回收伏笔（提醒作者别忘回收） */
  const pendingForeshadowings = useMemo(
    () =>
      foreshadowings
        .filter((f) => f.status === 'active' && !nodeForeshadowings.some((n) => n.id === f.id))
        .slice(0, 5),
    [foreshadowings, nodeForeshadowings],
  )

  const nodeEvents = useMemo(
    () => (node?.keyEventIds ?? []).map((id) => eventById.get(id)).filter((e): e is StoryEvent => Boolean(e)),
    [node, eventById],
  )

  return (
    <aside className="w-full shrink-0 space-y-3 lg:w-72">
      <Section icon={<ScrollText className="size-3.5" />} title="本章细纲">
        {node ? (
          <>
            <p className="text-sm font-medium text-stone-800">{node.title || '未命名细纲'}</p>
            <p className="mt-1 line-clamp-6 text-xs leading-relaxed text-stone-500">
              {stripHtml(node.content ?? '') || '（细纲暂无内容）'}
            </p>
          </>
        ) : (
          <p className="text-xs text-stone-400">自由章节，未关联大纲细纲（可在新建章节时关联）</p>
        )}
      </Section>

      <Section icon={<Users className="size-3.5" />} title={`出场人物（${linkedChars.length + mentionedChars.length}）`}>
        {linkedChars.length === 0 && mentionedChars.length === 0 ? (
          <p className="text-xs text-stone-400">细纲未标记人物，且正文中未识别到人物名</p>
        ) : (
          <ul className="space-y-2">
            {[...linkedChars, ...mentionedChars].map((c) => (
              <li key={c.id} className="rounded-lg bg-stone-50 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-stone-800">{c.name}</span>
                  {!linkedCharIds.includes(c.id) && <Badge color="slate">正文提及</Badge>}
                </div>
                {c.personalityTags.length > 0 && (
                  <p className="mt-0.5 text-[11px] text-stone-500">{c.personalityTags.slice(0, 4).join('、')}</p>
                )}
                {c.currentState && (
                  <p className="mt-0.5 text-[11px] text-violet-700">
                    当前状态：{timeLabel(c.currentState.time) || '时间未定'} · {c.currentState.state}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={<MapPin className="size-3.5" />} title="地点">
        {!linkedLocation && mentionedLocations.length === 0 ? (
          <p className="text-xs text-stone-400">无关联地点</p>
        ) : (
          <ul className="space-y-2">
            {linkedLocation && (
              <li className="rounded-lg bg-stone-50 px-2.5 py-2">
                <p className="text-sm font-medium text-stone-800">{linkedLocation.name}</p>
                {linkedLocation.description && (
                  <p className="mt-0.5 line-clamp-3 text-[11px] text-stone-500">{stripHtml(linkedLocation.description)}</p>
                )}
              </li>
            )}
            {mentionedLocations.map((l) => (
              <li key={l.id} className="rounded-lg bg-stone-50 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-stone-800">{l.name}</span>
                  <Badge color="slate">正文提及</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={<Flag className="size-3.5" />} title="伏笔">
        {nodeForeshadowings.length === 0 && pendingForeshadowings.length === 0 ? (
          <p className="text-xs text-stone-400">暂无相关伏笔</p>
        ) : (
          <ul className="space-y-2">
            {nodeForeshadowings.map((f) => (
              <ForeshadowingItem key={f.id} f={f} eventById={eventById} />
            ))}
            {pendingForeshadowings.length > 0 && (
              <li className="pt-1 text-[11px] text-stone-400">其它待回收：</li>
            )}
            {pendingForeshadowings.map((f) => (
              <ForeshadowingItem key={f.id} f={f} eventById={eventById} />
            ))}
          </ul>
        )}
      </Section>

      {nodeEvents.length > 0 && (
        <Section icon={<Sparkles className="size-3.5" />} title="关键事件">
          <ul className="space-y-1">
            {nodeEvents.map((e) => (
              <li key={e.id} className="text-xs text-stone-600">
                <span className="text-stone-400">{timeLabel(e.time) || '时间未定'}</span> · {e.name}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </aside>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">
        {icon} {title}
      </h3>
      {children}
    </div>
  )
}

function ForeshadowingItem({ f, eventById }: { f: Foreshadowing; eventById: Map<string, StoryEvent> }) {
  const anchor = f.expectedResolveEventId ? eventById.get(f.expectedResolveEventId) : undefined
  return (
    <li className="rounded-lg bg-stone-50 px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs leading-relaxed text-stone-700">{f.description}</span>
        <Badge color={f.status === 'active' ? 'violet' : f.status === 'resolved' ? 'green' : 'slate'}>
          {FORESHADOWING_STATUS_LABELS[f.status]}
        </Badge>
      </div>
      {anchor && <p className="mt-0.5 text-[11px] text-stone-400">预期回收：{anchor.name}</p>}
    </li>
  )
}
