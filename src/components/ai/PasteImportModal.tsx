import { useState } from 'react'
import { Clipboard, ClipboardPaste } from 'lucide-react'
import { Button, Modal, Textarea } from '@/components/ui'

/**
 * 粘贴导入（AI 写回入口，所有 AI 生成处共用）：
 * 把你「在别处生成的内容」（其它 AI 工具、文档、历史记录等）直接粘贴进来，
 * 复用各任务的解析管线填充为可编辑结果，与内置 AI 生成并行。
 * 与内置 AI 的区别：不消耗 API 请求、不写请求日志。
 */
export default function PasteImportModal({
  title,
  description,
  placeholder,
  example,
  onImport,
  onClose,
}: {
  title: string
  description?: string
  placeholder?: string
  /** 格式示例：提供时显示「填入示例」按钮，便于试解析效果 */
  example?: string
  /** 解析并填充；返回 null 表示成功（自动关闭），返回错误文案则留在弹窗中展示 */
  onImport: (text: string) => Promise<string | null> | string | null
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function readClipboard() {
    try {
      if (!navigator.clipboard?.readText) throw new Error('当前环境不支持读取剪贴板，请手动 Ctrl+V 粘贴')
      const t = await navigator.clipboard.readText()
      if (!t?.trim()) {
        setError('剪贴板为空')
        return
      }
      setText((prev) => (prev.trim() ? `${prev.trim()}\n${t.trim()}` : t.trim()))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取剪贴板失败，请手动粘贴')
    }
  }

  async function handleImport() {
    const t = text.trim()
    if (!t) {
      setError('请先粘贴内容（或点击「填入示例」体验格式）')
      return
    }
    setBusy(true)
    try {
      const err = await onImport(t)
      if (err) setError(err)
      else onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '内容解析失败，请检查格式后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`粘贴填充 · ${title}`}
      description={
        description ??
        '把在别处生成的内容粘贴进来直接填充为可编辑结果（不走内置 AI，不产生 API 请求）。'
      }
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="secondary" onClick={() => void readClipboard()}>
            <Clipboard className="size-4" /> 读取剪贴板
          </Button>
          <Button variant="primary" loading={busy} disabled={!text.trim()} onClick={() => void handleImport()}>
            <ClipboardPaste className="size-4" /> 导入并填充
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {example && (
          <button
            type="button"
            onClick={() => {
              setText(example)
              setError('')
            }}
            className="cursor-pointer rounded-lg bg-stone-50 px-2 py-1 text-xs text-stone-500 transition-colors hover:bg-violet-50 hover:text-violet-700"
          >
            填入示例，看看导入效果
          </button>
        )}
        <Textarea
          rows={12}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError('')
          }}
          placeholder={placeholder ?? '粘贴内容…'}
          className="min-h-56"
          autoFocus
        />
        <p className="text-right text-xs text-stone-400">{text.length} 字 · Ctrl/Cmd + Enter 导入</p>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  )
}
