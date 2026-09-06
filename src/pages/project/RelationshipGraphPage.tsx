import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ExternalLink, Focus, Maximize2, RotateCcw, Share2, Tag } from 'lucide-react'
import cytoscape, { type Core, type ElementDefinition, type EventObject } from 'cytoscape'
import { Badge, Button, EmptyState } from '@/components/ui'
import { useProjectEntityList } from '@/hooks/useProjectEntityList'
import { characterRepo, relationshipRepo } from '@/db/repositories'
import { IMPORTANCE_LABELS, IMPORTANCE_LEVELS, type Character, type ImportanceLevel, type Relationship } from '@/types'
import { timeLabel } from '@/components/time/FlexibleTimeEditor'
import { cn } from '@/components/ui'

/** 节点配色：按重要程度（背景、文字、尺寸） */
const NODE_STYLE: Record<ImportanceLevel, { bg: string; color: string; w: number; h: number }> = {
  protagonist: { bg: '#7c3aed', color: '#ffffff', w: 116, h: 68 },
  major: { bg: '#0284c7', color: '#ffffff', w: 104, h: 62 },
  supporting: { bg: '#a8a29e', color: '#ffffff', w: 92, h: 58 },
  minor: { bg: '#e7e5e4', color: '#57534e', w: 84, h: 54 },
}

function edgeColor(strength: number): string {
  if (strength < 0) return '#ef4444'
  if (strength === 0) return '#d6d3d1'
  return '#10b981'
}

type Selection =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | null

/** 关系图页（US-401/402：力导向图渲染、节点点击详情、双击聚焦；US-403 导出扩展点） */
export default function RelationshipGraphPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cyRef = useRef<Core | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [showEdgeLabel, setShowEdgeLabel] = useState(false)
  const [graphKey, setGraphKey] = useState(0)

  const { items: characters, loaded: charsLoaded } = useProjectEntityList(characterRepo, projectId)
  const { items: relationships, loaded: relsLoaded } = useProjectEntityList(relationshipRepo, projectId)

  const charById = useCallback(
    (id: string) => characters.find((c) => c.id === id),
    [characters],
  )

  // 建图（依赖图数据，重挂时重建）
  useEffect(() => {
    if (!containerRef.current || !charsLoaded || !relsLoaded) return
    const cy = cytoscape({
      container: containerRef.current,
      elements: buildElements(characters, relationships),
      wheelSensitivity: 0.3,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(bg)',
            color: 'data(color)',
            width: 'data(w)',
            height: 'data(h)',
            shape: 'round-rectangle',
            label: 'data(name)',
            'font-size': 13,
            'font-weight': 700,
            'text-wrap': 'wrap',
            'text-max-width': 'data(maxw)',
            'text-valign': 'center',
            'text-halign': 'center',
            'border-width': 0,
            'border-color': '#ffffff',
            'transition-property': 'border-width, border-color, background-color',
            'transition-duration': 150,
          },
        },
        {
          selector: 'node:selected',
          style: { 'border-width': 4, 'border-color': '#f59e0b' },
        },
        {
          selector: 'edge',
          style: {
            width: 'data(width)',
            'line-color': 'data(color)',
            'target-endpoint': 'none',
            label: 'data(type)',
            'font-size': 11,
            color: '#78716c',
            'text-rotation': 'autorotate',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.85,
            'text-background-padding': '2px',
          },
        },
        { selector: 'edge.unlabeled', style: { label: '' } },
        {
          selector: 'edge:selected',
          style: {
            width: 5,
            'line-color': '#f59e0b',
            'target-arrow-color': '#f59e0b',
            'source-arrow-color': '#f59e0b',
          },
        },
      ],
      layout: { name: 'cose', animate: false, padding: 40, nodeRepulsion: () => 9000, idealEdgeLength: () => 130 },
    })
    cyRef.current = cy

    cy.on('tap', 'node', (e: EventObject) => {
      const node = e.target
      setSelection({ kind: 'node', id: node.id() })
    })
    cy.on('tap', 'edge', (e: EventObject) => {
      setSelection({ kind: 'edge', id: e.target.id() })
    })
    cy.on('dbltap', 'node', (e: EventObject) => {
      const node = e.target
      cy.animate({ fit: { eles: node, padding: 220 }, duration: 350, easing: 'ease-out' })
    })
    cy.on('tap', (e: EventObject) => {
      if (e.target === cy) setSelection(null)
    })
    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [charsLoaded, relsLoaded, characters, relationships, graphKey])

  // 选中态双向绑定
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.elements().unselect()
    if (selection?.kind === 'node') {
      const n = cy.getElementById(selection.id)
      if (n.length) n.select()
    } else if (selection?.kind === 'edge') {
      const e = cy.getElementById(selection.id)
      if (e.length) e.select()
    }
  }, [selection])

  // 关系标签显隐
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    if (showEdgeLabel) cy.edges().removeClass('unlabeled')
    else cy.edges().addClass('unlabeled')
  }, [showEdgeLabel, graphKey, charsLoaded, relsLoaded])

  const selectedChar = selection?.kind === 'node' ? charById(selection.id) : undefined
  const selectedRel = selection?.kind === 'edge' ? relationships.find((r) => r.id === selection.id) : undefined

  const loading = !charsLoaded || !relsLoaded

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">人物关系图</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {characters.length} 人 · {relationships.length} 条关系
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className={cn(showEdgeLabel && 'bg-violet-50 text-violet-700')}
            onClick={() => setShowEdgeLabel((v) => !v)}
          >
            <Tag className="size-4" /> 关系标签
          </Button>
          <Button variant="ghost" size="sm" onClick={() => cyRef.current?.fit(undefined, 40)}>
            <Maximize2 className="size-4" /> 适应画布
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setGraphKey((k) => k + 1)}>
            <RotateCcw className="size-4" /> 重新布局
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="h-[560px] animate-pulse rounded-2xl bg-stone-200/60" />
      ) : characters.length < 2 ? (
        <EmptyState
          icon={<Share2 className="size-6" />}
          title={characters.length === 0 ? '还没有人物' : '再多一位人物即可生成关系图'}
          description={
            characters.length === 0
              ? '先创建人物，并在人物详情中添加彼此的关系，这里会以力导向图呈现。'
              : '在人物详情中添加「人物关系」，关系会以连线出现在图中。'
          }
          action={
            <Link
              to={characters.length === 0 ? '../characters' : '../characters'}
              className="inline-flex items-center gap-1 text-sm font-medium text-violet-600 hover:text-violet-800"
            >
              去人物页 <ExternalLink className="size-3.5" />
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* 图容器 */}
          <div className="relative overflow-hidden rounded-2xl border border-stone-200 bg-[radial-gradient(circle_at_center,#f5f5f4_0%,#fafaf9_70%,#f5f5f4_100%)] shadow-sm">
            <div key={graphKey} ref={containerRef} className="h-[560px] w-full" />
            <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
              {IMPORTANCE_LEVELS.map((imp) => (
                <span
                  key={imp}
                  className="flex items-center gap-1.5 rounded-full bg-white/85 px-2 py-0.5 text-xs text-stone-600 shadow-sm"
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: NODE_STYLE[imp].bg }}
                  />
                  {IMPORTANCE_LABELS[imp]}
                </span>
              ))}
              <span className="flex items-center gap-1.5 rounded-full bg-white/85 px-2 py-0.5 text-xs text-stone-600 shadow-sm">
                <span className="size-2.5 rounded-full bg-emerald-500" /> 正面
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-white/85 px-2 py-0.5 text-xs text-stone-600 shadow-sm">
                <span className="size-2.5 rounded-full bg-red-500" /> 负面
              </span>
            </div>
            <p className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-stone-400">
              滚轮缩放 · 拖拽平移 · 双击人物聚焦 · 点击查看详情
            </p>
          </div>

          {/* 详情侧栏 */}
          <aside className="min-h-0 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            {selectedChar ? (
              <NodePanel
                character={selectedChar}
                relationships={relationships}
                charById={charById}
                onOpenDetail={(id) => navigate(`/projects/${projectId}/characters/${id}`)}
              />
            ) : selectedRel ? (
              <EdgePanel relationship={selectedRel} source={charById(selectedRel.sourceId)} target={charById(selectedRel.targetId)} />
            ) : (
              <EmptyState
                icon={<Focus className="size-5" />}
                title="选择节点查看详情"
                description="点击图中的人物查看其简介与直接关系；双击人物将画面聚焦到它。"
              />
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

/** 由人物与关系生成 Cytoscape elements */
function buildElements(characters: Character[], relationships: Relationship[]): ElementDefinition[] {
  const nodes: ElementDefinition[] = characters.map((c) => {
    const s = NODE_STYLE[c.importance] ?? NODE_STYLE.supporting
    return {
      data: { id: c.id, name: c.name, importance: c.importance, bg: s.bg, color: s.color, w: s.w, h: s.h, maxw: s.w - 12 },
    }
  })
  const charIds = new Set(characters.map((c) => c.id))
  const edges: ElementDefinition[] = relationships
    .filter((r) => charIds.has(r.sourceId) && charIds.has(r.targetId))
    .map((r) => ({
      data: {
        id: r.id,
        source: r.sourceId,
        target: r.targetId,
        type: r.type,
        color: edgeColor(r.strength),
        width: Math.min(1 + Math.abs(r.strength) / 25, 5),
        strength: r.strength,
      },
    }))
  return [...nodes, ...edges]
}

/** 人物详情面板：简介 + 直接关系列表 */
function NodePanel({
  character,
  relationships,
  charById,
  onOpenDetail,
}: {
  character: Character
  relationships: Relationship[]
  charById: (id: string) => Character | undefined
  onOpenDetail: (id: string) => void
}) {
  const rels = relationships.filter((r) => r.sourceId === character.id || r.targetId === character.id)
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white',
            character.importance === 'protagonist' && 'bg-violet-600',
            character.importance === 'major' && 'bg-sky-500',
            character.importance === 'supporting' && 'bg-stone-400',
            character.importance === 'minor' && 'bg-stone-300 text-stone-600',
          )}
        >
          {character.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-serif-sc text-lg font-bold text-stone-900">{character.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge color="violet">{IMPORTANCE_LABELS[character.importance]}</Badge>
            {character.gender && <Badge color="slate">{character.gender}</Badge>}
            {character.age && <Badge color="slate">{character.age}</Badge>}
          </div>
        </div>
      </div>

      {character.personalityTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {character.personalityTags.map((t) => (
            <span key={t} className="rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-700">
              {t}
            </span>
          ))}
        </div>
      )}

      {character.currentState?.state && (
        <div className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          当前状态：{timeLabel(character.currentState.time)}
          {character.currentState.state && ` · ${character.currentState.state}`}
        </div>
      )}

      <div>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">
          直接关系（{rels.length}）
        </h4>
        {rels.length === 0 ? (
          <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-400">暂无关系。</p>
        ) : (
          <ul className="space-y-1.5">
            {rels.map((r) => {
              const other = charById(r.sourceId === character.id ? r.targetId : r.sourceId)
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-2 rounded-lg border border-stone-100 bg-stone-50/70 px-2.5 py-1.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate text-stone-700">{other?.name ?? '未知人物'}</span>
                  <Badge color="violet">{r.type}</Badge>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      r.strength < 0 ? 'text-red-600' : r.strength === 0 ? 'text-stone-400' : 'text-emerald-600',
                    )}
                  >
                    {r.strength > 0 ? `+${r.strength}` : r.strength}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Button variant="subtle" size="sm" className="w-full" onClick={() => onOpenDetail(character.id)}>
        打开人物详情 <ExternalLink className="size-3.5" />
      </Button>
    </div>
  )
}

/** 关系详情面板 */
function EdgePanel({
  relationship,
  source,
  target,
}: {
  relationship: Relationship
  source?: Character
  target?: Character
}) {
  const rel = relationship
  const word =
    rel.strength <= -80
      ? '深仇大恨'
      : rel.strength <= -40
        ? '强烈敌对'
        : rel.strength < 0
          ? '疏远对立'
          : rel.strength === 0
            ? '中立'
            : rel.strength < 40
              ? '初步好感'
              : rel.strength < 80
                ? '亲近信赖'
                : '生死之交'
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-stone-50 p-3 text-center">
        <p className="text-sm font-medium text-stone-800">
          {source?.name ?? '未知'} <span className="text-stone-400">—</span> {target?.name ?? '未知'}
        </p>
        <div className="mt-2 flex items-center justify-center gap-2">
          <Badge color="violet">{rel.type}</Badge>
          <span className={cn('text-sm font-semibold', rel.strength < 0 ? 'text-red-600' : rel.strength === 0 ? 'text-stone-400' : 'text-emerald-600')}>
            {rel.strength > 0 ? `+${rel.strength}` : rel.strength} · {word}
          </span>
        </div>
      </div>
      {rel.description && <p className="text-sm leading-relaxed text-stone-600">{rel.description}</p>}
      <p className="text-xs text-stone-400">
        {rel.dynamic ? '随剧情动态变化' : '静态关系'} · 最近修改{' '}
        {new Date(rel.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  )
}
