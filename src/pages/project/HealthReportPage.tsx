import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, ClipboardPaste, Eye, HeartPulse, Lightbulb, RefreshCw, Sparkles } from 'lucide-react'
import { useAITask } from '@/hooks/useAITask'
import { loadAIConfig } from '@/services/ai/config'
import { explainHealthReport, runCustomPrompt } from '@/services/ai/tasks'
import { buildHealthExplainPrompt, withSystem } from '@/services/ai/prompts'
import PromptPreviewModal from '@/components/ai/PromptPreviewModal'
import PasteImportModal from '@/components/ai/PasteImportModal'
import { Badge, Button, cn } from '@/components/ui'
import { useProjectEntityList } from '@/hooks/useProjectEntityList'
import { useProjectStore } from '@/stores/projectStore'
import {
  arcRepo,
  characterRepo,
  chapterRepo,
  eventRepo,
  foreshadowingRepo,
  locationRepo,
  outlineRepo,
  relationshipRepo,
} from '@/db/repositories'
import { runConsistencyChecks } from '@/services/consistency'
import { buildHealthReport, scoreBadgeColor, scoreColor } from '@/services/health'

/** 故事体检报告页（Sprint 10）：五维评分 + 可执行建议 */
export default function HealthReportPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const project = useProjectStore((s) => s.currentProject())
  const { items: characters, refresh: r1 } = useProjectEntityList(characterRepo, projectId)
  const { items: arcs, refresh: r2 } = useProjectEntityList(arcRepo, projectId)
  const { items: foreshadowings, refresh: r3 } = useProjectEntityList(foreshadowingRepo, projectId)
  const { items: events, refresh: r4 } = useProjectEntityList(eventRepo, projectId)
  const { items: chapters, refresh: r5 } = useProjectEntityList(chapterRepo, projectId)
  const { items: locations, refresh: r6 } = useProjectEntityList(locationRepo, projectId)
  const { items: relationships, refresh: r7 } = useProjectEntityList(relationshipRepo, projectId)
  const { items: outlineNodes, refresh: r8 } = useProjectEntityList(outlineRepo, projectId)

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

  const report = useMemo(
    () =>
      buildHealthReport({
        characters,
        arcs,
        foreshadowings,
        events,
        chapters,
        locations,
        issues,
        defaultTargetWords: project?.chapterDefaults.targetWords,
      }),
    [characters, arcs, foreshadowings, events, chapters, locations, issues, project?.chapterDefaults.targetWords],
  )

  const { loading: aiLoading, error: aiError, result: aiText, setResult, setError: setAiError, run, cancel } =
    useAITask<string>()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)

  function refreshAll() {
    void Promise.all([r1(), r2(), r3(), r4(), r5(), r6(), r7(), r8()])
  }

  async function handleAIExplain(custom?: { userText: string; systemText: string }) {
    if (custom) {
      await run((signal) =>
        runCustomPrompt(
          { projectId, kind: 'health', inputSummary: project?.name },
          custom.userText,
          custom.systemText,
          loadAIConfig(),
          signal,
        ),
      )
      return
    }
    await run((signal) =>
      explainHealthReport({ projectName: project?.name ?? '', report, projectId }, loadAIConfig(), signal),
    )
  }

  /** 粘贴在别处生成的解读文字直接展示 */
  function handlePasteImport(text: string): string | null {
    const t = text.trim()
    if (!t) return '内容为空，请粘贴解读文字'
    setResult(t)
    setAiError('')
    return null
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif-sc text-xl font-bold text-stone-900">故事体检报告</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {project?.name} · 伏笔回收 / 人物弧光 / 时间线连贯 / 设定一致性 / 章节进度 五维评分（实时计算）
          </p>
        </div>
        <div className="flex items-center gap-2">
          {aiLoading && (
            <Button variant="ghost" onClick={cancel}>
              停止
            </Button>
          )}
          <Button variant="secondary" onClick={refreshAll}>
            <RefreshCw className="size-4" /> 重新生成
          </Button>
          <Button variant="ghost" onClick={() => setPasteOpen(true)} title="粘贴在别处生成的解读文字直接展示">
            <ClipboardPaste className="size-4" /> 粘贴填充
          </Button>
          <Button variant="ghost" onClick={() => setPreviewOpen(true)} title="查看并编辑将要发送的提示">
            <Eye className="size-4" /> 提示预览
          </Button>
          <Button variant="primary" loading={aiLoading} onClick={() => void handleAIExplain()}>
            <Sparkles className="size-4" /> AI 解读
          </Button>
        </div>
      </div>

      {aiError && <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{aiError}</p>}
      {aiText && (
        <section className="mb-6 rounded-2xl border border-violet-200 bg-violet-50/60 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-violet-800">
            <Sparkles className="size-4" /> AI 解读（基于上方评分，仅供参考）
          </div>
          <div className="mt-2 space-y-2 text-sm leading-relaxed text-stone-700">
            {aiText
              .split(/\r?\n\s*\r?\n|\r?\n/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((p, i) => (
                <p key={i}>{p}</p>
              ))}
          </div>
        </section>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* 总分 */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <HeartPulse className="size-4" /> 综合健康度
          </div>
          <div className="mt-3 flex items-end gap-3">
            <span className="font-serif-sc text-5xl font-bold text-stone-900">{report.total}</span>
            <span className="pb-1 text-sm text-stone-400">/ 100</span>
            <Badge color={scoreBadgeColor(report.total)} className="mb-1.5">{report.level}</Badge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
            <div className={cn('h-full rounded-full transition-all', scoreColor(report.total))} style={{ width: `${report.total}%` }} />
          </div>
          <p className="mt-3 text-xs text-stone-400">
            权重：伏笔 25 / 人物 25 / 时间线 20 / 一致性 20 / 章节 10；一致性维度会纳入规则引擎发现的问题。
          </p>
          <Link
            to="consistency"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-violet-600 hover:text-violet-800"
          >
            查看一致性问题清单 <ArrowRight className="size-3.5" />
          </Link>
        </section>

        {/* 建议 */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
            <Lightbulb className="size-4 text-amber-500" /> 优先改进建议
          </div>
          {report.suggestions.length === 0 ? (
            <p className="mt-3 text-sm text-stone-500">当前没有明显短板，继续保持。</p>
          ) : (
            <ol className="mt-3 space-y-1.5 text-sm text-stone-700">
              {report.suggestions.map((s, i) => (
                <li key={s} className="flex gap-2">
                  <span className="mt-0.5 shrink-0 text-xs text-stone-400">{i + 1}.</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* 维度明细 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {report.dimensions.map((d) => (
          <section key={d.key} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-medium text-stone-900">{d.label}</h2>
              <div className="flex items-center gap-2">
                <Badge color={scoreBadgeColor(d.score)}>{d.score}</Badge>
                <span className="text-xs text-stone-400">权重 {d.weight}</span>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div className={cn('h-full rounded-full transition-all', scoreColor(d.score))} style={{ width: `${d.score}%` }} />
            </div>
            <p className="mt-2 text-xs text-stone-500">{d.summary}</p>
            {d.tips.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-stone-500">
                {d.tips.map((t) => (
                  <li key={t} className="flex gap-1.5">
                    <span className="text-stone-300">·</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {previewOpen && (
        <PromptPreviewModal
          title="体检报告解读"
          messages={withSystem(buildHealthExplainPrompt({ projectName: project?.name ?? '', report }))}
          onClose={() => setPreviewOpen(false)}
          onGenerate={(userText, systemText) => {
            setPreviewOpen(false)
            void handleAIExplain({ userText, systemText })
          }}
        />
      )}
      {pasteOpen && (
        <PasteImportModal
          title="体检报告解读"
          description="把在别处（其它 AI 工具）生成的解读文字粘贴进来直接展示与复制。"
          placeholder="粘贴解读文字（建议一段总体诊断 + 优先处理事项 + 下一步）…"
          onImport={(t) => handlePasteImport(t)}
          onClose={() => setPasteOpen(false)}
        />
      )}
    </div>
  )
}
