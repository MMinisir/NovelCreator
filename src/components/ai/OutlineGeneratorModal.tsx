import { useState } from 'react'
import { ClipboardPaste, Eye, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Badge, Button, Field, Input, Modal, Textarea, cn } from '@/components/ui'
import { useAITask } from '@/hooks/useAITask'
import { loadAIConfig } from '@/services/ai/config'
import {
  generateOutlinePlan,
  generateSummary,
  parseOutlinePlan,
  runCustomPrompt,
  type OutlinePlan,
  type OutlinePlanAct,
} from '@/services/ai/tasks'
import { buildOutlinePrompt, withSystem } from '@/services/ai/prompts'
import { customContentById } from '@/services/ai/templates'
import { applyGeneratedOutline } from '@/services/outline'
import PromptPreviewModal from './PromptPreviewModal'
import PasteImportModal from './PasteImportModal'
import PromptTemplatePicker from './PromptTemplatePicker'

/** 输入框文本 → 正整数（空/非法时回退默认值；不设上限，由用户自行决定规模） */
function toPositiveInt(text: string, fallback: number): number {
  const n = Number.parseInt(text, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/**
 * AI 生成大纲（分幕 + 章节细纲）：
 * 与其它 AI 入口一致（AI 生成 / 粘贴填充 / 提示预览 / 自定义模板），
 * 生成结果先进入可编辑预览树，确认后追加写入项目大纲树。
 */
export default function OutlineGeneratorModal({
  projectId,
  defaultPremise,
  defaultGenre,
  synopsisText,
  existingActs,
  projectContext,
  onClose,
  onApplied,
}: {
  projectId: string
  /** 预填的故事核（取项目故事核 / 一句话简介） */
  defaultPremise?: string
  defaultGenre?: string
  /** 已有五句话梗概文本（自动带入提示，保持一致） */
  synopsisText?: string
  /** 已有分幕标题（自动带入提示，避免重复） */
  existingActs?: string
  /** 世界观与人物速览（自动带入提示） */
  projectContext?: string
  onClose: () => void
  onApplied: (result: { acts: number; chapters: number }) => void
}) {
  const [premise, setPremise] = useState(defaultPremise ?? '')
  const [genre, setGenre] = useState(defaultGenre ?? '')
  const [actCountText, setActCountText] = useState('3')
  const [chaptersPerActText, setChaptersPerActText] = useState('5')
  const [style, setStyle] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [tplId, setTplId] = useState('')
  const [applying, setApplying] = useState(false)
  const { loading, error, setError, result: plan, setResult, run, cancel } = useAITask<OutlinePlan>()
  /** 独立摘要任务：用于「AI 生成摘要」填充故事核，与大纲生成互不干扰 */
  const summaryTask = useAITask<string>()

  const totalChapters = plan?.acts.reduce((sum, a) => sum + a.chapters.length, 0) ?? 0

  function updatePlan(updater: (prev: OutlinePlan) => OutlinePlan) {
    setResult((prev) => (prev ? updater(prev) : prev))
  }

  function updateAct(index: number, patch: Partial<Pick<OutlinePlanAct, 'title' | 'summary'>>) {
    updatePlan((prev) => ({ acts: prev.acts.map((a, i) => (i === index ? { ...a, ...patch } : a)) }))
  }

  function removeAct(index: number) {
    updatePlan((prev) => ({ acts: prev.acts.filter((_, i) => i !== index) }))
  }

  function addChapter(actIndex: number) {
    updatePlan((prev) => ({
      acts: prev.acts.map((a, i) => (i === actIndex ? { ...a, chapters: [...a.chapters, { title: '', content: '' }] } : a)),
    }))
  }

  function updateChapter(actIndex: number, chapterIndex: number, patch: { title?: string; content?: string }) {
    updatePlan((prev) => ({
      acts: prev.acts.map((a, i) =>
        i === actIndex
          ? { ...a, chapters: a.chapters.map((c, ci) => (ci === chapterIndex ? { ...c, ...patch } : c)) }
          : a,
      ),
    }))
  }

  function removeChapter(actIndex: number, chapterIndex: number) {
    updatePlan((prev) => ({
      acts: prev.acts.map((a, i) =>
        i === actIndex ? { ...a, chapters: a.chapters.filter((_, ci) => ci !== chapterIndex) } : a,
      ),
    }))
  }

  const actCount = toPositiveInt(actCountText, 3)
  const chaptersPerAct = toPositiveInt(chaptersPerActText, 5)
  const plannedChapters = actCount * chaptersPerAct
  const promptInput = { premise, genre, actCount, chaptersPerAct, style, synopsisText, existingActs, projectContext }

  /** 依据项目世界观 / 人物 / 已有梗概生成「故事核」摘要并填入输入框 */
  async function handleGenerateSummary() {
    const data = await summaryTask.run((signal) =>
      generateSummary(
        {
          focus: '生成用于后续大纲设计的「故事核 / 一句话设定」：主角 + 处境 + 核心冲突，一句话到两句话',
          words: 120,
          material: synopsisText,
          projectContext,
          projectId,
        },
        loadAIConfig(),
        signal,
      ),
    )
    if (data?.trim()) setPremise(data.trim())
  }

  async function handleGenerate(custom?: { userText: string; systemText: string }) {
    if (!custom && !premise.trim()) {
      setError('请先填写「故事核 / 一句话设定」，再点生成')
      return
    }
    const data = custom
      ? await run(async (signal) =>
          parseOutlinePlan(
            await runCustomPrompt(
              { projectId, kind: 'outline', inputSummary: premise.slice(0, 30) },
              custom.userText,
              custom.systemText,
              loadAIConfig(),
              signal,
            ),
          ),
        )
      : await run((signal) =>
          generateOutlinePlan(
            { ...promptInput, projectId },
            loadAIConfig(),
            signal,
            customContentById(tplId),
          ),
        )
    if (!data) return
    if (data.acts.length === 0) {
      setResult(null)
      setError('未能从返回内容中解析出大纲结构（需要 JSON 的 acts 数组），可调整提示后重试')
    }
  }

  /** 粘贴在别处生成的大纲 JSON 直接填充为可编辑预览 */
  function handlePasteImport(raw: string): string | null {
    const planData = parseOutlinePlan(raw)
    if (planData.acts.length === 0) return '未解析出任何分幕（需要 JSON 的 acts 数组），请检查内容格式'
    setResult(planData)
    setError('')
    return null
  }

  async function handleApply() {
    if (!plan || plan.acts.length === 0) return
    setApplying(true)
    try {
      const created = await applyGeneratedOutline(projectId, plan)
      onApplied(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="AI 生成大纲"
      description="按故事核生成「分幕 + 章节细纲」，可在下方逐条修改后再写入大纲树（追加，不影响已有节点）。"
      width="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="ghost" onClick={() => setPasteOpen(true)} title="粘贴在别处生成的大纲 JSON 直接填充">
            <ClipboardPaste className="size-4" /> 粘贴填充
          </Button>
          <Button variant="ghost" onClick={() => setPreviewOpen(true)} title="查看并编辑将要发送的提示">
            <Eye className="size-4" /> 提示预览
          </Button>
          {plan && plan.acts.length > 0 ? (
            <>
              <Button variant="secondary" onClick={() => void handleGenerate()} loading={loading}>
                <Sparkles className="size-4" /> 重新生成
              </Button>
              <Button variant="primary" loading={applying} onClick={() => void handleApply()}>
                写入大纲（{plan.acts.length} 幕 {totalChapters} 章）
              </Button>
            </>
          ) : (
            <>
              {loading && (
                <Button variant="ghost" onClick={cancel}>
                  停止
                </Button>
              )}
              <Button variant="primary" loading={loading} onClick={() => void handleGenerate()}>
                <Sparkles className="size-4" /> 生成
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <PromptTemplatePicker kind="outline" value={tplId} onChange={setTplId} />

        <Field label="故事核 / 一句话设定" required hint="越具体越好：主角 + 处境 + 核心冲突，如“被逐出师门的剑客为查明灭门真相重入江湖”">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {summaryTask.loading && (
                <Button size="sm" variant="ghost" onClick={summaryTask.cancel}>
                  停止
                </Button>
              )}
              <Button
                size="sm"
                variant="subtle"
                loading={summaryTask.loading}
                onClick={() => void handleGenerateSummary()}
                title="依据项目世界观、人物与已有梗概自动生成故事核摘要"
              >
                <Sparkles className="size-3.5" /> AI 生成摘要
              </Button>
            </div>
            <Textarea
              rows={3}
              value={premise}
              onChange={(e) => setPremise(e.target.value)}
              placeholder="一句话说明这本书要讲什么（也可点上方「AI 生成摘要」自动生成）"
              autoFocus
            />
            {summaryTask.error && <p className="text-xs text-red-600">{summaryTask.error}</p>}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Field label="题材 / 类型">
            <Input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="如 玄幻" />
          </Field>
          <Field label="分幕数" hint="可自定义（如 3 / 5 / 10）">
            <Input
              type="number"
              min={1}
              value={actCountText}
              onChange={(e) => setActCountText(e.target.value)}
            />
          </Field>
          <Field label="每幕章节数" hint="可自定义；总数越大越要注意输出长度">
            <Input
              type="number"
              min={1}
              value={chaptersPerActText}
              onChange={(e) => setChaptersPerActText(e.target.value)}
            />
          </Field>
          <Field label="风格 / 结构要求" hint="如 快节奏、单主角、每章一个钩子">
            <Input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="可选" />
          </Field>
        </div>

        <p
          className={cn(
            'rounded-xl px-3 py-2 text-xs',
            plannedChapters > 24 ? 'bg-amber-50 text-amber-700' : 'bg-stone-50 text-stone-500',
          )}
        >
          本次计划：{actCount} 幕 × 每幕 {chaptersPerAct} 章（约 {plannedChapters} 章）。已自动带入：
          {[
            synopsisText ? '五句话梗概' : '',
            existingActs ? '已有分幕' : '',
            projectContext ? '世界观与人物速览' : '',
          ]
            .filter(Boolean)
            .join('、') || '（暂无）'}
          。
          {plannedChapters > 24
            ? '章节较多，请先在顶栏「设置 → AI 服务配置」把最大输出 tokens 调到 4096 以上，否则返回内容可能被截断。'
            : '若返回内容被截断，可在顶栏「设置 → AI 服务配置」调大最大输出 tokens。'}
        </p>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {plan && plan.acts.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-stone-500">
                预览（可编辑标题 / 概要、增删章节）：共 {plan.acts.length} 幕 · {totalChapters} 章
              </span>
              <span className="text-xs text-stone-400">确认无误后点右下角「写入大纲」</span>
            </div>

            {plan.acts.map((act, actIndex) => (
              <div key={actIndex} className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
                <div className="flex items-center gap-2">
                  <Badge color="violet">第 {actIndex + 1} 幕</Badge>
                  <Input
                    value={act.title}
                    onChange={(e) => updateAct(actIndex, { title: e.target.value })}
                    placeholder="分幕 / 分卷标题"
                    className="min-w-0 flex-1 py-1.5 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => removeAct(actIndex)}
                    title="删除这一幕"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <Textarea
                  rows={2}
                  value={act.summary ?? ''}
                  onChange={(e) => updateAct(actIndex, { summary: e.target.value })}
                  placeholder="本幕核心冲突与推进目标"
                  className="mt-2 text-xs"
                />
                <ul className="mt-2 space-y-2">
                  {act.chapters.map((chapter, chapterIndex) => (
                    <li key={chapterIndex} className="flex items-start gap-2">
                      <span className="mt-2 w-12 shrink-0 text-right text-[11px] text-stone-400">
                        第 {chapterIndex + 1} 章
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <Input
                          value={chapter.title}
                          onChange={(e) => updateChapter(actIndex, chapterIndex, { title: e.target.value })}
                          placeholder="章节标题"
                          className="py-1.5 text-xs"
                        />
                        <Textarea
                          rows={2}
                          value={chapter.content ?? ''}
                          onChange={(e) => updateChapter(actIndex, chapterIndex, { content: e.target.value })}
                          placeholder="本章核心剧情"
                          className="text-xs"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-stone-400 hover:bg-red-50 hover:text-red-600"
                        onClick={() => removeChapter(actIndex, chapterIndex)}
                        title="删除该章"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button size="sm" variant="ghost" className="mt-2" onClick={() => addChapter(actIndex)}>
                  <Plus className="size-3.5" /> 加一章
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {previewOpen && (
        <PromptPreviewModal
          title="大纲生成"
          messages={withSystem(buildOutlinePrompt(promptInput, customContentById(tplId)))}
          onClose={() => setPreviewOpen(false)}
          onGenerate={(userText, systemText) => {
            setPreviewOpen(false)
            void handleGenerate({ userText, systemText })
          }}
        />
      )}
      {pasteOpen && (
        <PasteImportModal
          title="大纲生成"
          description="把在别处（其它 AI 工具、文档）生成好的大纲 JSON 粘贴进来，导入后可在预览中编辑再写入大纲树。"
          placeholder={'粘贴 JSON，形如：\n{\n  "acts": [\n    { "title": "第一卷 …", "summary": "…", "chapters": [{ "title": "第1章 …", "content": "…" }] }\n  ]\n}'}
          onImport={(t) => handlePasteImport(t)}
          onClose={() => setPasteOpen(false)}
        />
      )}
    </Modal>
  )
}
