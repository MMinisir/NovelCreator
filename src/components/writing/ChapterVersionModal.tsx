import { useEffect, useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { Badge, Button, ConfirmDialog, Input, Modal, cn } from '@/components/ui'
import { listVersions, restoreVersion, saveManualVersion } from '@/services/chapterVersions'
import { diffLines, diffSummary, htmlToTextLines } from '@/utils/diff'
import { countWords } from '@/utils/text'
import type { Chapter, ChapterVersion } from '@/types/chapter'

type StoredVersion = ChapterVersion & { projectId: string }

/** 版本历史弹窗（Sprint 8 US-504）：自动/手动版本列表 + 与当前正文的差异对比 + 回滚 */
export default function ChapterVersionModal({
  chapter,
  onClose,
  onRestored,
}: {
  chapter: Chapter
  onClose: () => void
  onRestored: (content: string) => void
}) {
  const [versions, setVersions] = useState<StoredVersion[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function reload() {
    const list = await listVersions(chapter.id)
    setVersions(list)
    setSelectedId((id) => id ?? list[0]?.id ?? null)
  }

  useEffect(() => {
    void reload()
  }, [chapter.id])

  const selected = versions.find((v) => v.id === selectedId) ?? null

  const diff = useMemo(() => {
    if (!selected) return null
    return diffLines(htmlToTextLines(selected.content), htmlToTextLines(chapter.content))
  }, [selected, chapter.content])

  async function handleSaveManual() {
    setBusy(true)
    setError('')
    try {
      await saveManualVersion(chapter, label)
      setLabel('')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      const content = await restoreVersion(chapter, selected.id)
      onRestored(content)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      setConfirmId(null)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="版本历史"
      description="停笔后自动保存快照（自动版本至少间隔 2 分钟）；可手动标记里程碑版本并回滚。"
      width="max-w-4xl"
      footer={
        <Button variant="primary" onClick={onClose}>
          完成
        </Button>
      }
    >
      <div className="space-y-4">
        {/* 手动标记 */}
        <div className="flex flex-wrap items-center gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="版本说明，如“初稿完成”" className="max-w-xs" />
          <Button variant="secondary" loading={busy} disabled={!label.trim()} onClick={() => void handleSaveManual()}>
            标记当前为新版本
          </Button>
          <span className="text-xs text-stone-400">共 {versions.length} 个版本</span>
        </div>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
          {/* 版本列表 */}
          <ul className="max-h-80 space-y-1 overflow-y-auto rounded-xl border border-stone-200 p-2">
            {versions.length === 0 && <li className="px-2 py-6 text-center text-sm text-stone-400">暂无历史版本</li>}
            {versions.map((v) => (
              <li key={v.id}>
                <button
                  onClick={() => setSelectedId(v.id)}
                  className={cn(
                    'w-full cursor-pointer rounded-lg px-3 py-2 text-left transition-colors',
                    selectedId === v.id ? 'bg-violet-100' : 'hover:bg-stone-100',
                  )}
                >
                  <span className="block text-sm font-medium text-stone-800">
                    {v.label ?? '自动保存'}
                    {v.label && <Badge color="violet">里程碑</Badge>}
                  </span>
                  <span className="mt-0.5 block text-xs text-stone-400">
                    {new Date(v.savedAt).toLocaleString('zh-CN', { hour12: false })} · {countWords(v.content).toLocaleString()} 字
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* 差异对比 */}
          <div className="rounded-xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2 text-xs text-stone-500">
              <span className="flex items-center gap-1.5">
                <History className="size-3.5" /> 该版本 → 当前正文
              </span>
              {diff && (
                <span>
                  <span className="text-emerald-600">+{diffSummary(diff).added}</span>{' '}
                  <span className="text-red-600">-{diffSummary(diff).removed}</span> 行
                </span>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto p-3 text-sm leading-relaxed">
              {!selected ? (
                <p className="py-8 text-center text-sm text-stone-400">选择左侧版本查看差异</p>
              ) : !diff || diff.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-400">与当前正文无差异</p>
              ) : (
                <ul className="space-y-0.5">
                  {diff.map((op, i) => (
                    <li
                      key={i}
                      className={cn(
                        'whitespace-pre-wrap rounded px-2 py-0.5',
                        op.type === 'add' && 'bg-emerald-50 text-emerald-800',
                        op.type === 'remove' && 'bg-red-50 text-red-800 line-through',
                        op.type === 'same' && 'text-stone-500',
                      )}
                    >
                      <span className="mr-2 select-none text-xs opacity-60">
                        {op.type === 'add' ? '+' : op.type === 'remove' ? '-' : ' '}
                      </span>
                      {op.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {selected && (
          <div className="flex items-center justify-end">
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmId(selected.id)}>
              回滚到此版本
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmId)}
        title="回滚版本"
        description="当前正文会先被保存为一个里程碑版本，再恢复为该版本内容。"
        confirmText="回滚"
        danger
        onCancel={() => setConfirmId(null)}
        onConfirm={() => void handleRestore()}
      />
    </Modal>
  )
}
