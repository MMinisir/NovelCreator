import type { ArcStage, Character } from '@/types/character'
import type { Chapter } from '@/types/chapter'
import type { Comment, Foreshadowing, IdeaFragment } from '@/types/meta'
import type { OutlineNode } from '@/types/outline'
import type { Project } from '@/types/project'
import type { Location, StoryEvent } from '@/types/world'
import { htmlToPlainText } from '@/utils/text'

/**
 * 全局搜索（跨实体）：纯函数计算命中与高亮片段，UI 负责数据加载与跳转。
 * 支持：项目、人物、地点、事件、章节正文、伏笔、灵感碎片、大纲节点、批注。
 */
export type SearchKind =
  | 'project'
  | 'character'
  | 'location'
  | 'event'
  | 'chapter'
  | 'foreshadowing'
  | 'idea'
  | 'outline'
  | 'comment'

export const SEARCH_KIND_LABELS: Record<SearchKind, string> = {
  project: '项目',
  character: '人物',
  location: '地点',
  event: '事件',
  chapter: '章节',
  foreshadowing: '伏笔',
  idea: '灵感',
  outline: '大纲',
  comment: '批注',
}

export interface SearchHit {
  key: string
  kind: SearchKind
  projectId: string
  projectName: string
  title: string
  /** 命中片段（含省略号） */
  snippet: string
  /** 片段内命中区间 [start, end) */
  matches: Array<[number, number]>
  /** 命中的字段名 */
  field: string
  score: number
  url: string
}

export interface SearchDataset {
  project: Project
  characters: Character[]
  locations: Location[]
  events: StoryEvent[]
  chapters: Chapter[]
  foreshadowings: Foreshadowing[]
  outlineNodes: OutlineNode[]
  ideas: IdeaFragment[]
  comments: Comment[]
  arcs?: ArcStage[]
}

const RADIUS = 36

/** 生成片段与片段内全部命中区间 */
function buildSnippet(text: string, needle: string): { snippet: string; matches: Array<[number, number]> } | null {
  const lower = text.toLowerCase()
  const idx = lower.indexOf(needle)
  if (idx < 0) return null
  const start = Math.max(0, idx - RADIUS)
  const end = Math.min(text.length, idx + needle.length + RADIUS)
  const matches: Array<[number, number]> = []
  let from = 0
  for (;;) {
    const p = lower.indexOf(needle, start + from)
    if (p < 0 || p >= end) break
    matches.push([p - start, p - start + needle.length])
    from = p - start + needle.length
  }
  const prefix = start > 0 ? '…' : ''
  return {
    snippet: `${prefix}${text.slice(start, end)}${end < text.length ? '…' : ''}`,
    matches: matches.map(([a, b]) => [a + prefix.length, b + prefix.length] as [number, number]),
  }
}

/** 跳转地址（各模块列表页/详情页） */
export function searchResultUrl(kind: SearchKind, projectId: string, id?: string, extra?: string): string {
  switch (kind) {
    case 'project':
      return '/projects'
    case 'character':
      return `/projects/${projectId}/characters/${id ?? ''}`
    case 'location':
      return `/projects/${projectId}/locations`
    case 'event':
      return `/projects/${projectId}/events`
    case 'chapter':
      return `/projects/${projectId}/writing?chapter=${id ?? ''}`
    case 'foreshadowing':
      return `/projects/${projectId}/foreshadowing`
    case 'idea':
      return `/projects/${projectId}/ideas`
    case 'outline':
      return `/projects/${projectId}/outline`
    case 'comment':
      return `/projects/${projectId}/writing?chapter=${extra ?? ''}`
    default:
      return `/projects/${projectId}`
  }
}

interface Candidate {
  kind: SearchKind
  id: string
  title: string
  field: string
  weight: number
  text: string
  extra?: string
}

function candidatesOf(ds: SearchDataset): Candidate[] {
  const pid = ds.project.id
  const out: Candidate[] = []
  const plain = (s?: string) => htmlToPlainText(s ?? '')
  const push = (
    kind: SearchKind,
    id: string,
    title: string,
    field: string,
    weight: number,
    text: string | undefined,
    extra?: string,
  ) => {
    if (!text) return
    out.push({ kind, id, title, field, weight, text, extra })
  }

  out.push({ kind: 'project', id: pid, title: ds.project.name, field: '项目名', weight: 6, text: ds.project.name })
  push('project', pid, ds.project.name, '一句话简介', 2, ds.project.tagline)

  for (const c of ds.characters) {
    push('character', c.id, c.name, '姓名', 5, c.name)
    push('character', c.id, c.name, '别名', 3, c.aliases.join(' '))
    push('character', c.id, c.name, '性格标签', 2, c.personalityTags.join(' '))
    push('character', c.id, c.name, '核心欲望', 2, c.desire)
    push('character', c.id, c.name, '致命缺陷', 2, c.flaw)
    push('character', c.id, c.name, '背景故事', 1, plain(c.background))
    push('character', c.id, c.name, '当前状态', 2, c.currentState?.state)
  }
  for (const l of ds.locations) {
    push('location', l.id, l.name, '名称', 5, l.name)
    push('location', l.id, l.name, '类型', 2, l.type)
    push('location', l.id, l.name, '描述', 1, plain(l.description))
  }
  for (const e of ds.events) {
    push('event', e.id, e.name, '名称', 5, e.name)
    push('event', e.id, e.name, '类型', 1, e.type)
    push('event', e.id, e.name, '描述', 2, plain(e.description))
    push('event', e.id, e.name, '结果', 2, e.outcome)
  }
  for (const ch of ds.chapters) {
    push('chapter', ch.id, ch.title || '未命名章节', '标题', 5, ch.title)
    push('chapter', ch.id, ch.title || '未命名章节', '正文', 1, plain(ch.content))
  }
  for (const f of ds.foreshadowings) push('foreshadowing', f.id, f.description.slice(0, 30), '描述', 4, f.description)
  for (const it of ds.ideas) {
    push('idea', it.id, it.content.slice(0, 30), '内容', 3, it.content)
    push('idea', it.id, it.content.slice(0, 30), '标签', 2, it.tags.join(' '))
  }
  for (const n of ds.outlineNodes) {
    if (n.type === 'root' || n.type === 'logline') continue
    const title = n.title?.trim() || '未命名节点'
    push('outline', n.id, title, '标题', 5, n.title)
    push('outline', n.id, title, '细纲内容', 2, plain(n.content))
  }
  for (const cm of ds.comments) {
    const title = cm.anchor?.slice(0, 24) || cm.content.slice(0, 24)
    push('comment', cm.id, title, '批注', 3, cm.content, cm.targetId)
  }
  return out
}

/** 在单个项目内搜索 */
export function searchDataset(ds: SearchDataset, query: string, limit = 40): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const best = new Map<string, SearchHit>()
  for (const c of candidatesOf(ds)) {
    const lower = c.text.toLowerCase()
    const idx = lower.indexOf(q)
    if (idx < 0) continue
    const snippet = buildSnippet(c.text, q)
    if (!snippet) continue
    const key = `${c.kind}:${c.id}`
    const prev = best.get(key)
    // 同实体多字段命中时保留权重最高的（权重相同时取更靠前的命中）
    if (prev && prev.score >= c.weight + Math.max(0, 10 - idx)) continue
    best.set(key, {
      key,
      kind: c.kind,
      projectId: ds.project.id,
      projectName: ds.project.name,
      title: c.title,
      snippet: snippet.snippet,
      matches: snippet.matches,
      field: c.field,
      score: c.weight + Math.max(0, 10 - idx),
      url: searchResultUrl(c.kind, ds.project.id, c.id, c.extra),
    })
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}

/** 跨项目搜索（结果按分数归并排序） */
export function searchDatasets(datasets: SearchDataset[], query: string, limit = 60): SearchHit[] {
  const all = datasets.flatMap((ds) => searchDataset(ds, query, limit))
  const seen = new Set<string>()
  const out: SearchHit[] = []
  for (const hit of all.sort((a, b) => b.score - a.score)) {
    const uniq = `${hit.projectId}:${hit.key}`
    if (seen.has(uniq)) continue
    seen.add(uniq)
    out.push(hit)
    if (out.length >= limit) break
  }
  return out
}
