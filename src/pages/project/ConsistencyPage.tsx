import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, ExternalLink, Eye, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { useAITask } from '@/hooks/useAITask'
import { loadAIConfig } from '@/services/ai/config'
import { parseDeepConsistencyIssues, runCustomPrompt, runDeepConsistencyCheck } from '@/services/ai/tasks'
import { buildDeepConsistencyPrompt, withSystem } from '@/services/ai/prompts'
import PromptPreviewModal from '@/components/ai/PromptPreviewModal'
import { Badge, Button, EmptyState, cn } from '@/components/ui'
import { useProjectEntityList } from '@/hooks/useProjectEntityList'
import { useProjectStore } from '@/stores/projectStore'
import {
  characterRepo,
  chapterRepo,
  eventRepo,
  foreshadowingRepo,
  locationRepo,
  outlineRepo,
  relationshipRepo,
} from '@/db/repositories'
import { runConsistencyChecks, summarizeIssues, type ConsistencyIssue, type IssueLevel } from '@/services/consistency'

const LEVEL_BADGE: Record<IssueLevel, 'red' | 'amber' | 'slate'> = {
  error: 'red',
  warn: 'amber',
  info: 'slate',
}
const LEVEL_LABEL: Record<IssueLevel, string> = {
  error: '错误',
  warn: '警告',
  info: '提示',
}
const FILTERS: Array<'all' | IssueLevel> = ['all', 'error', 'warn', 'info']

/** 一致性检查页（Sprint 8 US-805 规则引擎版；LLM 语义检查 Sprint 9 增强） */
export default function ConsistencyPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const project = useProjectStore((s) => s.currentProject())
  const { items: characters, refresh: refreshChars } = useProjectEntityList(characterRepo, projectId)
  const { items: locations, refresh: refreshLocs } = useProjectEntityList(locationRepo, projectId)
  const { items: events, refresh: refreshEvents } = useProjectEntityList(eventRepo, projectId)
  const { items: chapters, refresh: refreshChapters } = useProjectEntityList(chapterRepo, projectId)
  const { items: foreshadowings, refresh: refreshFs } = useProjectEntityList(foreshadowingRepo, projectId)
  const { items: relationships, refresh: refreshRels } = useProjectEntityList(relationshipRepo, projectId)
  const { items: outlineNodes, refresh: refreshOutline } = useProjectEntityList(outlineRepo, projectId)

  const [filter, setFilter] = useState<'all' | IssueLevel>('all')
  const [aiIssues, setAiIssues] = useState<ConsistencyIssue[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const { loading, error: aiError, setError: setAiError, run, cancel } = useAITask<ConsistencyIssue[]>()

  const issues = useMemo(
    () =>
      runConsistencyChecks({
        characters,
        locations,
        events,
        chapters,
        foreshadowings,
        relationships,
        outlineNodes,
        defaultTargetWords: project?.chapterDefaults.targetWords,
      }),
    [characters, locations, events, chapters, foreshadowings, relationships, outlineNodes, project?.chapterDefaults.targetWords],
  )
  const stats = summarizeIssues(issues)
  const merged = useMemo(() => [...aiIssues, ...issues], [aiIssues, issues])
  const filtered = filter === 'all' ? merged : merged.filter((i) => i.level === filter)

  /** AI 语义深度检查（US-805 LLM 增强）：与规则引擎互补，可返回空数组 */
  const deepInput = useMemo(
    () => ({ project, characters, locations, events, chapters, foreshadowings, outlineNodes, existingIssues: issues }),
    [project, characters, locations, events, chapters, foreshadowings, outlineNodes, issues],
  )

  async function handleDeep(custom?: { userText: string; systemText: string }) {
    const data = custom
      ? await run(async (signal) =>
          parseDeepConsistencyIssues(
            await runCustomPrompt(
              { projectId, kind: 'consistency', inputSummary: project?.name },
              custom.userText,
              custom.systemText,
              loadAIConfig(),
              signal,
            ),
          ),
        )
      : await run((signal) => runDeepConsistencyCheck(deepInput, loadAIConfig(), signal))
    if (data) setAiIssues(data)
  }

  function refreshAll() {
    void Promise.all([
      refreshChars(),
      refreshLocs(),
      refreshEvents(),
      refreshChapters(),
      refreshFs(),
      refreshRels(),
      refreshOutline(),
    ])
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">一致性检查</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {project?.name} · 规则引擎 + 可选 AI 语义深度检查（需在项目设置中配置 AI 服务）
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <Button variant="ghost" onClick={cancel}>
              停止
            </Button>
          )}
          <Button variant="ghost" onClick={() => setPreviewOpen(true)} title="查看并编辑将要发送的提示">
            <Eye className="size-4" /> 提示预览
          </Button>
          <Button variant="primary" loading={loading} onClick={() => void handleDeep()}>
            <Sparkles className="size-4" /> AI 深度检查
          </Button>
          <Button variant="secondary" onClick={refreshAll}>
            <RefreshCw className="size-4" /> 重新检查
          </Button>
        </div>
      </div>

      {aiError && <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{aiError}</p>}
      {aiIssues.length > 0 && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-violet-700">
          <Sparkles className="size-3.5" /> AI 语义检查发现 {aiIssues.length} 个潜在问题（列于规则结果上方）
        </p>
      )}

      {/* 统计 */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="错误" value={stats.error} tone="red" />
        <StatCard label="警告" value={stats.warn} tone="amber" />
        <StatCard label="提示" value={stats.info} tone="slate" />
        <StatCard label="合计" value={stats.total} tone="violet" />
      </div>

      {/* 筛选 */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === f
                ? 'bg-violet-700 text-white'
                : 'border border-stone-200 bg-white text-stone-500 hover:border-violet-300 hover:text-violet-700',
            )}
          >
            {f === 'all' ? '全部' : LEVEL_LABEL[f]}
            <span className="ml-1 opacity-70">
              {f === 'all' ? stats.total : stats[f]}
            </span>
          </button>
        ))}
      </div>

      {issues.length === 0 && aiIssues.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="size-6" />}
          title="未发现一致性问题"
          description="当前设定在人物、关系、事件、伏笔与章节维度均通过了规则检查；可点击「AI 深度检查」做语义层面的补充排查。"
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="size-6" />} title="该级别下没有问题" description="切换上方筛选查看其它级别。" />
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              projectId={projectId ?? ''}
              source={issue.id.startsWith('ai:') ? 'ai' : undefined}
            />
          ))}
        </ul>
      )}

      {previewOpen && (
        <PromptPreviewModal
          title="一致性深度检查"
          messages={withSystem(buildDeepConsistencyPrompt(deepInput))}
          onClose={() => setPreviewOpen(false)}
          onGenerate={(userText, systemText) => {
            setPreviewOpen(false)
            void handleDeep({ userText, systemText })
          }}
        />
      )}
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'red' | 'amber' | 'slate' | 'violet' }) {
  const toneClass =
    tone === 'red'
      ? 'border-red-200 bg-red-50 text-red-700'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : tone === 'violet'
          ? 'border-violet-200 bg-violet-50 text-violet-700'
          : 'border-stone-200 bg-stone-50 text-stone-600'
  return (
    <div className={cn('rounded-2xl border px-4 py-3', toneClass)}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-0.5 text-2xl font-bold">{value}</p>
    </div>
  )
}

function IssueRow({ issue, projectId, source }: { issue: ConsistencyIssue; projectId: string; source?: 'ai' }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={LEVEL_BADGE[issue.level]}>{LEVEL_LABEL[issue.level]}</Badge>
          {source === 'ai' && <Badge color="violet">AI 语义</Badge>}
          <Badge color="slate">{issue.category}</Badge>
          <span className="font-medium text-stone-900">{issue.title}</span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{issue.detail}</p>
      </div>
      {issue.link && (
        <Link
          to={`/projects/${projectId}/${issue.link}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-violet-600 hover:bg-violet-50 hover:text-violet-800"
        >
          去处理 <ExternalLink className="size-3.5" />
        </Link>
      )}
    </li>
  )
}
