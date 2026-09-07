import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, HeartPulse, Lightbulb, RefreshCw } from 'lucide-react'
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

  function refreshAll() {
    void Promise.all([r1(), r2(), r3(), r4(), r5(), r6(), r7(), r8()])
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
        <Button variant="secondary" onClick={refreshAll}>
          <RefreshCw className="size-4" /> 重新生成
        </Button>
      </div>

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
    </div>
  )
}
