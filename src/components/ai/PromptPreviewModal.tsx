import { useState } from 'react'
import { Copy, Eye, Send } from 'lucide-react'
import { Button, Modal } from '@/components/ui'

/**
 * 提示预览（所有 AI 生成入口共用）：
 * 展示即将发送的完整提示（system + user），可就地修改 user 内容后「用此提示生成」。
 * 内容与实际请求一致（来自 services/ai/prompts.ts 的同一构建函数）。
 */
export default function PromptPreviewModal({
  title,
  messages,
  onClose,
  onGenerate,
}: {
  title: string
  /** 完整请求消息（system + user） */
  messages: Array<{ role: string; content: string }>
  onClose: () => void
  /** 使用（可能已编辑的）提示发起请求 */
  onGenerate: (userText: string, systemText: string) => void
}) {
  const systemText = messages.find((m) => m.role === 'system')?.content ?? ''
  const [userText, setUserText] = useState(() => messages.find((m) => m.role === 'user')?.content ?? '')
  const [showSystem, setShowSystem] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copyAll() {
    const text = messages.map((m) => `【${m.role === 'system' ? '系统提示' : '用户提示'}】\n${m.role === 'user' ? userText : m.content}`).join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 忽略剪贴板失败 */
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`提示预览 · ${title}`}
      description="下面就是将要发送给模型的完整提示，可直接修改后生成（修改仅本次生效）。"
      width="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button variant="secondary" onClick={() => void copyAll()}>
            <Copy className="size-4" /> {copied ? '已复制' : '复制提示'}
          </Button>
          <Button variant="primary" disabled={!userText.trim()} onClick={() => onGenerate(userText, systemText)}>
            <Send className="size-4" /> 用此提示生成
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <button
            type="button"
            onClick={() => setShowSystem((v) => !v)}
            className="cursor-pointer text-xs font-medium text-stone-500 hover:text-violet-700"
          >
            <Eye className="mr-1 inline size-3.5" />
            {showSystem ? '隐藏' : '查看'}系统提示（{systemText.length} 字）
          </button>
          {showSystem && (
            <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
              {systemText}
            </pre>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-stone-500">
            <span>用户提示（可编辑）</span>
            <span>{userText.length} 字</span>
          </div>
          <textarea
            value={userText}
            onChange={(e) => setUserText(e.target.value)}
            rows={16}
            className="w-full rounded-xl border border-stone-300 p-3 font-mono text-xs leading-relaxed outline-none transition-colors focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
          />
        </div>
      </div>
    </Modal>
  )
}
