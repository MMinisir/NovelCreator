import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BookOpen, ChevronDown, ChevronRight, FileText, Film, FolderTree, ListTree, Plus, StickyNote } from 'lucide-react'
import { Badge, Button, EmptyState, cn } from '@/components/ui'
import { chapterRepo, characterRepo, eventRepo, locationRepo, outlineRepo } from '@/db/repositories'
import { useProjectEntityList } from '@/hooks/useProjectEntityList'
import { STRUCTURAL_TYPES, addOutlineChild, ensureOutlineSeed, listForeshadowings } from '@/services/outline'
import type { Foreshadowing } from '@/types/meta'
import type { OutlineNode, OutlineNodeType } from '@/types/outline'
import { StoryCoreCard, LoglineCard } from '@/components/outline/OutlineSetupCards'
import { OutlineNodeEditor } from '@/components/outline/OutlineNodeEditor'
import SynopsisGeneratorModal from '@/components/ai/SynopsisGeneratorModal'
import { useProjectStore } from '@/stores/projectStore'

const TYPE_ICON: Record<string, typeof FileText> = {
  act: BookOpen,
  chapter: FileText,
  scene: Film,
  free: StickyNote,
}
const TYPE_DOT: Record<string, string> = {
  act: 'bg-violet-200 text-violet-800',
  chapter: 'bg-sky-100 text-sky-800',
  scene: 'bg-amber-100 text-amber-800',
  free: 'bg-stone-100 text-stone-600',
}

/** 大纲页（US-201~204：故事核/五句话梗概 + 多级大纲树 + 节点细纲编辑） */
export default function OutlinePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { items: nodes, loaded, refresh } = useProjectEntityList(outlineRepo, projectId)
  const { items: characters } = useProjectEntityList(characterRepo, projectId)
  const project = useProjectStore((s) => s.currentProject())
  const [synopsisAIOpen, setSynopsisAIOpen] = useState(false) // US-802 AI 生成五句话
  const { items: events } = useProjectEntityList(eventRepo, projectId)
  const { items: locations } = useProjectEntityList(locationRepo, projectId)
  const { items: chapters } = useProjectEntityList(chapterRepo, projectId)
  const [foreshadowings, setForeshadowings] = useState<Foreshadowing[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const seededFor = useRef<string | null>(null)

  useEffect(() => {
    if (projectId && loaded && seededFor.current !== projectId) {
      seededFor.current = projectId
      void ensureOutlineSeed(projectId).then(() => void refresh())
    }
  }, [projectId, loaded, refresh])

  useEffect(() => {
    if (!projectId) return
    void listForeshadowings(projectId).then(setForeshadowings)
  }, [projectId, nodes])

  const { root, storyCore, logline, synopsisItems, childrenOf, treeRoots } = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const childrenOf = new Map<string | null, OutlineNode[]>()
    for (const n of nodes) {
      const list = childrenOf.get(n.parentId) ?? []
      list.push(n)
      childrenOf.set(n.parentId, list)
    }
    for (const list of childrenOf.values()) list.sort((a, b) => a.order - b.order)
    const root = nodes.find((n) => n.type === 'root')
    const storyCore = nodes.find((n) => n.type === 'story_core')
    const logline = nodes.find((n) => n.type === 'logline')
    const synopsisItems = nodes
      .filter((n) => n.type === 'synopsis_item' && n.parentId === logline?.id)
      .sort((a, b) => a.order - b.order)
    const treeRoots = (root ? childrenOf.get(root.id) ?? [] : []).filter((n) => !STRUCTURAL_TYPES.includes(n.type))
    void byId
    return { root, storyCore, logline, synopsisItems, childrenOf, treeRoots }
  }, [nodes])

  // 默认选中：优先章节，其次首个可编辑节点
  useEffect(() => {
    if (!loaded || !root) return
    if (selectedId && nodes.some((n) => n.id === selectedId)) return
    const preferred = nodes.find((n) => n.type === 'chapter') ?? treeRoots[0]
    setSelectedId(preferred?.id ?? null)
  }, [loaded, root, nodes, treeRoots, selectedId])

  const selected = nodes.find((n) => n.id === selectedId)
  const structNodeCount = nodes.filter((n) => n.type === 'act' || n.type === 'chapter' || n.type === 'scene' || n.type === 'free').length

  function toggleCollapse(id: string) {
    setCollapsed((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleAddTop(type: OutlineNodeType) {
    if (!projectId || !root) return
    const created = await addOutlineChild(projectId, root.id, type, type === 'act' ? '新分幕 / 分卷' : '新自由节点')
    await refresh()
    setSelectedId(created.id)
  }

  function jumpToWriting(chapterId: string) {
    navigate(`/projects/${projectId}/writing?chapter=${chapterId}`)
  }

  function renderTree(list: OutlineNode[], depth: number): React.ReactNode {
    return list.map((node) => {
      const kids = childrenOf.get(node.id) ?? []
      const isOpen = !collapsed.has(node.id)
      const Icon = TYPE_ICON[node.type] ?? StickyNote
      const planted = (node.foreshadowingPlantedIds ?? []).length
      const resolved = (node.foreshadowingResolvedIds ?? []).length
      const linked = node.type === 'chapter' && chapters.some((c) => c.outlineNodeId === node.id)
      return (
        <div key={node.id}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setSelectedId(node.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setSelectedId(node.id)
            }}
            style={{ paddingLeft: depth * 18 + 8 }}
            className={cn(
              'group flex cursor-pointer items-center gap-1.5 rounded-lg py-1.5 pr-2 text-sm transition-colors',
              selectedId === node.id ? 'bg-violet-100 text-violet-900' : 'text-stone-700 hover:bg-stone-100',
            )}
          >
            <span className="flex size-4 shrink-0 items-center justify-center">
              {kids.length > 0 ? (
                <button onClick={(e) => { e.stopPropagation(); toggleCollapse(node.id) }} className="cursor-pointer text-stone-400 hover:text-stone-700" aria-label={isOpen ? '折叠' : '展开'}>
                  {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                </button>
              ) : null}
            </span>
            <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', TYPE_DOT[node.type])}>
              <Icon className="size-3.5" />
            </span>
            <span className={cn('min-w-0 flex-1 truncate font-medium', !node.title && 'text-stone-400')}>
              {node.title || '未命名节点'}
            </span>
            {linked && <FileText className="size-3.5 shrink-0 text-emerald-500" aria-label="已有正文草稿" />}
            {planted > 0 && <Badge color="amber">{planted} 埋</Badge>}
            {resolved > 0 && <Badge color="green">{resolved} 收</Badge>}
          </div>
          {isOpen && kids.length > 0 && renderTree(kids, depth + 1)}
        </div>
      )
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">大纲</h1>
          <p className="mt-0.5 text-sm text-stone-500">故事核 → 五句话梗概 → 分幕 / 章节细纲 · 共 {structNodeCount} 个结构节点</p>
        </div>
        <div className="flex items-center gap-2">
          {root && (
            <>
              <Button variant="secondary" onClick={() => void handleAddTop('act')}>
                <Plus className="size-4" /> 添加分幕 / 分卷
              </Button>
              <Button variant="secondary" onClick={() => void handleAddTop('free')}>
                <Plus className="size-4" /> 自由节点
              </Button>
            </>
          )}
        </div>
      </div>

      {!loaded ? (
        <div className="space-y-3">
          <div className="h-56 animate-pulse rounded-2xl bg-stone-200/60" />
          <div className="h-72 animate-pulse rounded-2xl bg-stone-200/60" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          {/* 左列：引导卡 + 结构树 */}
          <div className="min-w-0 space-y-5">
            <StoryCoreCard node={storyCore} onSaved={() => void refresh()} />
            <LoglineCard items={synopsisItems} onGenerateAI={() => setSynopsisAIOpen(true)} />
            {synopsisAIOpen && project && (
              <SynopsisGeneratorModal
                project={project}
                characters={characters}
                onClose={() => setSynopsisAIOpen(false)}
                onApplied={() => {
                  setSynopsisAIOpen(false)
                  void refresh()
                }}
              />
            )}

            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-400">
                  <FolderTree className="size-4" /> 分幕与章节细纲
                </h2>
                <span className="text-xs text-stone-400">US-203 · 拖拽排序规划中（US-205）</span>
              </div>
              {treeRoots.length === 0 ? (
                <EmptyState
                  icon={<ListTree className="size-6" />}
                  title="还没有分幕结构"
                  description="点击右上角「添加分幕 / 分卷」开始搭建：分幕下设章节细纲，章节细纲下设场景。"
                />
              ) : (
                <div className="space-y-0.5">{renderTree(treeRoots, 0)}</div>
              )}
            </div>
          </div>

          {/* 右列：节点详情编辑 */}
          <div className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-5rem)]">
            {selected && selected.type !== 'root' && !STRUCTURAL_TYPES.includes(selected.type) ? (
              <OutlineNodeEditor
                projectId={projectId ?? ''}
                node={selected}
                children={childrenOf.get(selected.id) ?? []}
                characters={characters}
                events={events}
                locations={locations}
                foreshadowings={foreshadowings}
                chapters={chapters}
                onSaved={() => void refresh()}
                onSelectNode={(id) => setSelectedId(id)}
                onDeleted={() => { setSelectedId(null); void refresh() }}
                onJumpToWriting={jumpToWriting}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-8 text-center">
                <BookOpen className="mx-auto size-8 text-stone-300" />
                <p className="mt-3 text-sm text-stone-400">在左侧选择分幕 / 章节 / 场景节点，编辑细纲详情。</p>
                <p className="mt-1 text-xs text-stone-300">章节细纲支持：核心剧情、出场人物、关键事件、伏笔埋设与回收</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
