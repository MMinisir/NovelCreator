import { useMemo, useState } from 'react'
import { Check, ClipboardPaste, Diff, Eye, Sparkles } from 'lucide-react'
import { Button, Field, Input, Modal, Textarea, cn } from '@/components/ui'
import { useAITask } from '@/hooks/useAITask'
import { loadAIConfig } from '@/services/ai/config'
import { polishText, runCustomPrompt } from '@/services/ai/tasks'
import { buildPolishPrompt, withSystem } from '@/services/ai/prompts'
import PromptPreviewModal from './PromptPreviewModal'
import PasteImportModal from './PasteImportModal'
import { diffLines, diffSummary } from '@/utils/diff'

/** AI 润色选中文本（Sprint 9 US-806）：原文只读展示 + 结果可编辑 + 行差异对比，可一键替换选区 */
export default function PolishModal({
  original,
  context,
  projectId,
  onClose,
  onApply,
}: {
  original: string
  /** 场景上下文（章节名等） */
  context?: string
  /** 所属项目（请求日志归类） */
  projectId?: string
  onClose: () => void
  /** 替换选区；选区已失效时返回 false */
  onApply: (text: string) => boolean
}) {
  const [style, setStyle] = useState('')
  const [text, setText] = useState<string | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const [note, setNote] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const { loading, error, setError, run, cancel } = useAITask<string>()

  async function handleGenerate(custom?: { userText: string; systemText: string }) {
    const result = custom
      ? await run((signal) =>
          runCustomPrompt(
            { projectId, kind: 'polish', inputSummary: context },
            custom.userText,
            custom.systemText,
            loadAIConfig(),
            signal,
          ),
        )
      : await run((signal) => polishText({ text: original, context, style, projectId }, loadAIConfig(), signal))
    if (!result) return
    const trimmed = result.trim()
    setText(trimmed)
    if (!trimmed) setError('AI 返回内容为空，可调整润色方向后重试')
  }

  /** 粘贴在别处润色好的结果直接填充（可继续对比差异并替换选区） */
  function handlePasteImport(text: string): string | null {
    const t = text.trim()
    if (!t) return '内容为空，请粘贴润色后的文本'
    setText(t)
    setError('')
    return null
  }

  function handleApply() {
    if (!text) return
    const ok = onApply(text)
    if (!ok) {
      setNote('原选区已失效（内容可能已变化），请关闭弹窗后重新选中文本再试')
      return
    }
    onClose()
  }

  const diff = useMemo(() => {
    if (!text) return null
    const split = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    return diffLines(split(original), split(text))
  }, [text, original])

  return (
    <Modal
      open
      onClose={onClose}
      title="AI 润色选中文本"
      description="改写后保留原意与视角，可直接对比差异并替换到正文。"
      width="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="ghost" onClick={() => setPasteOpen(true)} title="粘贴在别处润色好的结果直接填充">
            <ClipboardPaste className="size-4" /> 粘贴填充
          </Button>
          <Button variant="ghost" onClick={() => setPreviewOpen(true)} title="查看并编辑将要发送的提示">
            <Eye className="size-4" /> 提示预览
          </Button>
          {loading && (
            <Button variant="ghost" onClick={cancel}>
              停止
            </Button>
          )}
          {text ? (
            <Button variant="primary" onClick={() => void handleGenerate()} loading={loading}>
              <Sparkles className="size-4" /> 重新润色
            </Button>
          ) : (
            <Button variant="primary" loading={loading} onClick={() => void handleGenerate()}>
              <Sparkles className="size-4" /> 开始润色
            </Button>
          )}
          <Button variant="primary" disabled={!text || loading} onClick={handleApply}>
            <Check className="size-4" /> 替换选中
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="原文（选中片段）">
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm leading-relaxed text-stone-600">
            {original}
          </div>
        </Field>

        <Field label="润色方向" hint="可选，如“更口语化”“氛围更凝重”">
          <Input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="保持原意，仅润色表达" />
        </Field>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {note && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{note}</p>}

        {text && (
          <>
            <Field label="润色结果（可编辑后替换）">
              <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} className="min-h-52" />
            </Field>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowDiff((v) => !v)}
                className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-violet-700"
              >
                <Diff className="mr-1 inline size-3.5" />
                与原文对比（+{diff ? diffSummary(diff).added : 0} / -{diff ? diffSummary(diff).removed : 0} 行）
              </button>
            </div>

            {showDiff && diff && (
              <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-xl border border-stone-200 p-2 text-xs leading-relaxed">
                {diff.map((op, i) => (
                  <li
                    key={i}
                    className={cn(
                      'whitespace-pre-wrap rounded px-2 py-0.5',
                      op.type === 'add' && 'bg-emerald-50 text-emerald-800',
                      op.type === 'remove' && 'bg-red-50 text-red-800 line-through',
                      op.type === 'same' && 'text-stone-400',
                    )}
                  >
                    <span className="mr-2 select-none opacity-60">{op.type === 'add' ? '+' : op.type === 'remove' ? '-' : ' '}</span>
                    {op.text}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {previewOpen && (
        <PromptPreviewModal
          title="润色选中文本"
          messages={withSystem(buildPolishPrompt({ text: original, context, style }))}
          onClose={() => setPreviewOpen(false)}
          onGenerate={(userText, systemText) => {
            setPreviewOpen(false)
            void handleGenerate({ userText, systemText })
          }}
        />
      )}
      {pasteOpen && (
        <PasteImportModal
          title="润色选中文本"
          description="把在别处（其它 AI 工具）润色好的结果粘贴进来，可直接对比与原文的差异并替换选区。"
          placeholder="粘贴润色后的完整文本…"
          onImport={(t) => handlePasteImport(t)}
          onClose={() => setPasteOpen(false)}
        />
      )}
    </Modal>
  )
}
