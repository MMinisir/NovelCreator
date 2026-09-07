import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Search } from 'lucide-react'
import { Badge, Modal, cn } from '@/components/ui'
import { useProjectStore } from '@/stores/projectStore'
import {
  characterRepo,
  chapterRepo,
  commentRepo,
  eventRepo,
  foreshadowingRepo,
  ideaRepo,
  locationRepo,
  outlineRepo,
} from '@/db/repositories'
import { SEARCH_KIND_LABELS, searchDatasets, type SearchDataset, type SearchHit, type SearchKind } from '@/services/search'
import type { Project } from '@/types/project'

const KIND_COLOR: Record<SearchKind, 'violet' | 'sky' | 'amber' | 'green' | 'slate'> = {
  project: 'slate',
  character: 'violet',
  location: 'sky',
  event: 'amber',
  chapter: 'green',
  foreshadowing: 'amber',
  idea: 'violet',
  outline: 'sky',
  comment: 'slate',
}

/** 加载单个项目的可搜索数据（打开面板时按需加载，不常驻内存） */
async function loadDataset(project: Project): Promise<SearchDataset> {
  const [characters, locations, events, chapters, foreshadowings, outlineNodes, ideas, comments] = await Promise.all([
    characterRepo.byProject(project.id),
    locationRepo.byProject(project.id),
    eventRepo.byProject(project.id),
    chapterRepo.byProject(project.id),
    foreshadowingRepo.byProject(project.id),
    outlineRepo.byProject(project.id),
    ideaRepo.byProject(project.id),
    commentRepo.byProject(project.id),
  ])
  return { project, characters, locations, events, chapters, foreshadowings, outlineNodes, ideas, comments }
}

/** 全局搜索面板：Cmd/Ctrl+K 或从顶栏搜索框打开 */
export default function GlobalSearchModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const projects = useProjectStore((s) => s.projects)
  const current = useProjectStore((s) => s.currentProject())
  const [scope, setScope] = useState<'current' | 'all'>(current ? 'current' : 'all')
  const [query, setQuery] = useState('')
  const [datasets, setDatasets] = useState<Record<string, SearchDataset>>({})
  const datasetsRef = useRef<Record<string, SearchDataset>>({})
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function run() {
      const targets = scope === 'all' ? projects : current ? [current] : []
      const need = targets.filter((p) => !datasetsRef.current[p.id])
      if (need.length === 0) {
        setLoading(false)
        return
      }
      setLoading(true)
      const loaded = await Promise.all(need.map(loadDataset))
      if (cancelled) return
      for (const d of loaded) datasetsRef.current[d.project.id] = d
      setDatasets({ ...datasetsRef.current })
      setLoading(false)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [scope, projects, current])

  const results = useMemo<SearchHit[]>(() => {
    const list =
      scope === 'all'
        ? Object.values(datasets)
        : current && datasets[current.id]
          ? [datasets[current.id]]
          : []
    if (!query.trim()) return []
    return searchDatasets(list, query, 60)
  }, [query, scope, datasets, current])

  useEffect(() => {
    setActive(0)
  }, [query, scope])

  // 键盘移动时保持选中项可见
  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function open(hit: SearchHit) {
    navigate(hit.url)
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(results.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = results[active]
      if (hit) open(hit)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="全局搜索"
      description="搜索人物、地点、事件、章节正文、伏笔、大纲、灵感与批注"
      width="max-w-2xl"
      footer={
        <div className="flex w-full items-center justify-between text-xs text-stone-400">
          <span>↑↓ 选择 · Enter 打开 · Esc 关闭</span>
          <span>{results.length} 条结果</span>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入关键词，如人物名、地点、伏笔描述、正文片段…"
            className="w-full rounded-xl border border-stone-300 py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
          />
          {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-stone-400" />}
        </div>

        {current && (
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setScope('current')}
              className={cn(
                'cursor-pointer rounded-full px-3 py-1 font-medium transition-colors',
                scope === 'current' ? 'bg-violet-700 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
              )}
            >
              当前项目：{current.name}
            </button>
            <button
              type="button"
              onClick={() => setScope('all')}
              className={cn(
                'cursor-pointer rounded-full px-3 py-1 font-medium transition-colors',
                scope === 'all' ? 'bg-violet-700 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
              )}
            >
              全部项目（{projects.length}）
            </button>
          </div>
        )}

        {!query.trim() ? (
          <p className="py-8 text-center text-sm text-stone-400">
            {loading ? '正在加载数据…' : '输入关键词开始搜索（至少 1 个字符）'}
          </p>
        ) : results.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-400">没有找到匹配「{query.trim()}」的内容</p>
        ) : (
          <ul ref={listRef} className="max-h-[52vh] space-y-1 overflow-y-auto pr-1">
            {results.map((hit, i) => (
              <li key={`${hit.projectId}:${hit.key}`}>
                <button
                  type="button"
                  onClick={() => open(hit)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'w-full cursor-pointer rounded-xl border px-3 py-2 text-left transition-colors',
                    i === active ? 'border-violet-300 bg-violet-50' : 'border-transparent hover:bg-stone-50',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color={KIND_COLOR[hit.kind]}>{SEARCH_KIND_LABELS[hit.kind]}</Badge>
                    <span className="truncate text-sm font-medium text-stone-900">{hit.title}</span>
                    <span className="text-xs text-stone-400">命中：{hit.field}</span>
                    {scope === 'all' && <span className="text-xs text-stone-400">· {hit.projectName}</span>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-stone-500">
                    <Highlight text={hit.snippet} matches={hit.matches} />
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

/** 命中词高亮 */
function Highlight({ text, matches }: { text: string; matches: Array<[number, number]> }) {
  if (matches.length === 0) return <>{text}</>
  const nodes: React.ReactNode[] = []
  let cursor = 0
  matches.forEach(([s, e], i) => {
    if (s > cursor) nodes.push(text.slice(cursor, s))
    nodes.push(
      <mark key={i} className="rounded bg-amber-200/80 px-0.5 text-stone-900">
        {text.slice(s, e)}
      </mark>,
    )
    cursor = e
  })
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return <>{nodes}</>
}
