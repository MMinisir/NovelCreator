import { useMemo, useState } from 'react'
import { ClipboardPaste, Eye, Sparkles } from 'lucide-react'
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { useAITask } from '@/hooks/useAITask'
import { loadAIConfig } from '@/services/ai/config'
import { generateChapterContent, runCustomPrompt, textToHtmlParagraphs } from '@/services/ai/tasks'
import { buildChapterContentPrompt, withSystem } from '@/services/ai/prompts'
import { customContentById } from '@/services/ai/templates'
import { characterOneLine } from '@/services/ai/contextBuilder'
import { countWords, htmlToPlainText } from '@/utils/text'
import PromptPreviewModal from './PromptPreviewModal'
import PasteImportModal from './PasteImportModal'
import PromptTemplatePicker from './PromptTemplatePicker'
import type { Character } from '@/types'
import type { Chapter } from '@/types/chapter'
import type { OutlineNode } from '@/types/outline'

/** 生成结果写入正文的方式 */
export type ChapterContentApplyMode = 'append' | 'replace'

/**
 * 章节正文生成器（与其它 AI 生成入口一致：AI 生成 / 粘贴填充 / 提示预览 / 自定义模板）。
 * 自动带入：本章大纲细纲、出场人物一句话简介、上一章结尾、项目世界观速览。
 * 生成结果为纯文本，写入正文时转为 TipTap 段落 HTML（追加或替换）。
 */
export default function ChapterContentModal({
  chapter,
  chapters,
  characters,
  outlineNode,
  projectContext,
  defaultWords,
  onClose,
  onApplied,
}: {
  chapter: Chapter
  /** 项目全部章节（用于取上一章结尾） */
  chapters: Chapter[]
  /** 项目人物（用于组装出场人物简介） */
  characters: Character[]
  /** 本章关联的大纲章节节点（可选） */
  outlineNode?: OutlineNode
  /** 项目世界观与人物的速览文本（可选） */
  projectContext?: string
  /** 默认目标字数（章节覆盖值或项目默认） */
  defaultWords?: number
  onClose: () => void
  onApplied: (html: string, mode: ChapterContentApplyMode) => void
}) {
  const [brief, setBrief] = useState('')
  const [words, setWords] = useState(defaultWords && defaultWords > 0 ? defaultWords : 1200)
  const [style, setStyle] = useState('')
  const [text, setText] = useState<string | null>(null)
  const [mode, setMode] = useState<ChapterContentApplyMode>('append')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [tplId, setTplId] = useState('')
  const { loading, error, setError, run, cancel } = useAITask<string>()

  /** 本章细纲：标题 + 概要 + 场景要素 */
  const outlineBrief = useMemo(() => {
    if (!outlineNode) return ''
    const parts: string[] = []
    if (outlineNode.title) parts.push(outlineNode.title)
    if (outlineNode.content) parts.push(htmlToPlainText(outlineNode.content).replace(/\s+/g, ' ').trim())
    const scene = outlineNode.scene
    if (scene) {
      const detail: string[] = []
      if (scene.goal) detail.push(`场景目标：${scene.goal}`)
      if (scene.conflict) detail.push(`冲突：${scene.conflict}`)
      if (scene.outcome) detail.push(`结果：${scene.outcome}`)
      if (detail.length) parts.push(detail.join('；'))
    }
    return parts.filter(Boolean).join('\n')
  }, [outlineNode])

  /** 出场人物：优先大纲节点指定的人物，未指定时取项目主要人物前 8 位 */
  const charactersBrief = useMemo(() => {
    const ids = outlineNode?.characterIds ?? []
    const picked = ids.length
      ? ids.map((id) => characters.find((c) => c.id === id)).filter((c): c is Character => Boolean(c))
      : characters.slice(0, 8)
    return picked.map((c) => characterOneLine(c)).join('\n')
  }, [outlineNode, characters])

  /** 上一章结尾（纯文本尾部 500 字，用于自然承接） */
  const previousExcerpt = useMemo(() => {
    const prev = chapters
      .filter((c) => c.order < chapter.order && c.content.trim())
      .sort((a, b) => b.order - a.order)[0]
    if (!prev) return ''
    return htmlToPlainText(prev.content).replace(/\s+/g, ' ').trim().slice(-500)
  }, [chapters, chapter.order])

  const contextHints = [
    outlineBrief && '本章细纲',
    charactersBrief && '出场人物',
    previousExcerpt && '上一章结尾',
    projectContext && '世界观速览',
  ].filter(Boolean) as string[]

  const hasExistingContent = Boolean(chapter.content.trim())

  async function handleGenerate(custom?: { userText: string; systemText: string }) {
    if (!custom && !brief.trim()) {
      setError('请先填写「本章要写什么」，再点生成')
      return
    }
    const result = custom
      ? await run((signal) =>
          runCustomPrompt(
            {
              projectId: chapter.projectId,
              kind: 'chapterContent',
              inputSummary: chapter.title || brief.slice(0, 30),
            },
            custom.userText,
            custom.systemText,
            loadAIConfig(),
            signal,
          ),
        )
      : await run((signal) =>
          generateChapterContent(
            {
              brief,
              chapterTitle: chapter.title,
              words,
              style,
              outlineBrief,
              charactersBrief,
              previousExcerpt,
              projectContext,
              projectId: chapter.projectId,
            },
            loadAIConfig(),
            signal,
            customContentById(tplId),
          ),
        )
    if (!result) return
    setText(result.trim())
    if (!result.trim()) setError('AI 返回内容为空，可补充本章要求后重试')
  }

  /** 粘贴在别处（其它 AI 工具/文档）写好的正文直接填充 */
  function handlePasteImport(raw: string): string | null {
    const t = raw.trim()
    if (!t) return '内容为空，请粘贴章节正文'
    setText(t)
    setError('')
    return null
  }

  const promptInput = {
    brief,
    chapterTitle: chapter.title,
    words,
    style,
    outlineBrief,
    charactersBrief,
    previousExcerpt,
    projectContext,
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`AI 生成章节正文 · ${chapter.title || '未命名章节'}`}
      description="结合本章细纲、出场人物与上一章结尾生成正文，可编辑后追加或替换正文。"
      width="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="ghost" onClick={() => setPasteOpen(true)} title="粘贴在别处生成的正文直接填充">
            <ClipboardPaste className="size-4" /> 粘贴填充
          </Button>
          <Button variant="ghost" onClick={() => setPreviewOpen(true)} title="查看并编辑将要发送的提示">
            <Eye className="size-4" /> 提示预览
          </Button>
          {text ? (
            <>
              <Button variant="secondary" onClick={() => void handleGenerate()} loading={loading}>
                <Sparkles className="size-4" /> 重新生成
              </Button>
              <Button variant="primary" onClick={() => onApplied(textToHtmlParagraphs(text), mode)}>
                {mode === 'replace' ? '替换正文' : '追加到正文'}
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
        <PromptTemplatePicker kind="chapterContent" value={tplId} onChange={setTplId} />

        <Field label="本章要写什么" required hint="用几句话说明剧情推进、关键场面或必须出现的信息">
          <Textarea
            rows={3}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="如：林澈初入青云宗，因资质被嘲，深夜在后山遇见受伤的神秘师姐，接过一枚来历不明的玉简。"
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="目标字数">
            <Input
              type="number"
              min={300}
              step={100}
              value={words}
              onChange={(e) => setWords(Number(e.target.value) || 1200)}
            />
          </Field>
          <Field label="风格 / 视角要求" hint="如“第三人称限知、冷峻克制、多对话”">
            <Input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="可选" />
          </Field>
        </div>

        <p className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-500">
          已自动带入：{contextHints.length ? contextHints.join('、') : '（暂无，可在大纲中补充本章细纲与出场人物）'}
          {previousExcerpt ? ` · 上一章结尾 ${previousExcerpt.length} 字` : ''}
        </p>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {text && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="写入方式" hint={hasExistingContent ? '本章已有正文，默认追加，避免误覆盖' : '本章暂无正文'}>
                <Select value={mode} onChange={(e) => setMode(e.target.value as ChapterContentApplyMode)}>
                  <option value="append">追加到正文末尾</option>
                  <option value="replace">替换整章正文</option>
                </Select>
              </Field>
              <p className="pb-2 text-right text-xs text-stone-400">
                生成结果 {countWords(textToHtmlParagraphs(text)).toLocaleString()} 字
              </p>
            </div>
            {mode === 'replace' && hasExistingContent && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                注意：替换会覆盖本章现有正文（可在章节「版本历史」中找回旧内容）。
              </p>
            )}
            <Field label="生成结果（可编辑，空行分段）">
              <Textarea rows={16} value={text} onChange={(e) => setText(e.target.value)} className="min-h-80" />
            </Field>
          </>
        )}
      </div>

      {previewOpen && (
        <PromptPreviewModal
          title="章节正文"
          messages={withSystem(buildChapterContentPrompt(promptInput, customContentById(tplId)))}
          onClose={() => setPreviewOpen(false)}
          onGenerate={(userText, systemText) => {
            setPreviewOpen(false)
            void handleGenerate({ userText, systemText })
          }}
        />
      )}
      {pasteOpen && (
        <PasteImportModal
          title="章节正文"
          description="把在别处（其它 AI 工具、文档）写好的章节正文粘贴进来，导入后仍可编辑并追加／替换到正文。"
          placeholder="粘贴章节正文（空行分段，导入后自动转段落）…"
          onImport={(t) => handlePasteImport(t)}
          onClose={() => setPasteOpen(false)}
        />
      )}
    </Modal>
  )
}
