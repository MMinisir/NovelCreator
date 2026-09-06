import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileUp, Info } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { importProjectFromJson, parseExport, type ExportEnvelope } from '@/services/exportImport'
import { readFileAsText } from '@/utils/common'

type ImportMode = 'new' | 'restore'

/** 项目 JSON 导入对话框（US-005 / US-703） */
export function ImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported?: () => void }) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [envelope, setEnvelope] = useState<ExportEnvelope | null>(null)
  const [mode, setMode] = useState<ImportMode>('new')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError('')
    setResult(null)
    try {
      const text = await readFileAsText(file)
      const env = parseExport(text)
      setEnvelope(env)
      setMode('new')
    } catch (err) {
      setEnvelope(null)
      setError(err instanceof Error ? err.message : '文件解析失败')
    }
  }

  async function handleImport() {
    if (!envelope) return
    setBusy(true)
    setError('')
    try {
      const fileText = (fileRef.current?.files?.[0] ? await readFileAsText(fileRef.current.files[0]) : '')
      if (!fileText) throw new Error('未读取到文件内容')
      const res = await importProjectFromJson(fileText, mode === 'new')
      const countText = Object.entries(res.storeCounts)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}:${n}`)
        .join('，')
      setResult(`项目「${res.name}」导入成功。${countText ? `数据分布：${countText}` : ''}`)
      onImported?.()
      if (mode === 'new') {
        navigate(`/projects/${res.projectId}`)
      }
      setTimeout(() => onClose(), 1800)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败')
    } finally {
      setBusy(false)
    }
  }

  function handleClose() {
    if (!busy) {
      setEnvelope(null)
      setResult(null)
      setError('')
      if (fileRef.current) fileRef.current.value = ''
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="导入项目"
      description="从 NovelCreator 导出的 JSON 文件恢复项目数据"
      width="max-w-xl"
      footer={
        envelope && !result ? (
          <>
            <Button variant="ghost" onClick={handleClose}>
              取消
            </Button>
            <Button variant="primary" onClick={handleImport} loading={busy}>
              开始导入
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={handleClose}>
            {result ? '完成' : '关闭'}
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-6 py-8 text-center hover:border-violet-400 hover:bg-violet-50/50 transition-colors">
          <FileUp className="size-6 text-stone-400" />
          <span className="text-sm font-medium text-stone-600">选择 .json 导出文件</span>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {result && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{result}</p>}

        {envelope && !result && (
          <div className="rounded-xl border border-stone-200 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-stone-800">
              <Info className="size-4 text-violet-600" />
              将导入项目「{envelope.project.name}」· 导出于 {new Date(envelope.exportedAt).toLocaleString('zh-CN')}
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-stone-50">
                <input
                  type="radio"
                  className="mt-0.5 accent-violet-600"
                  checked={mode === 'new'}
                  onChange={() => setMode('new')}
                />
                <span>
                  <span className="font-medium text-stone-700">作为新项目导入</span>
                  <span className="block text-xs text-stone-500">复制为全新项目，保留原项目不受影响（推荐用于共享/备份副本）</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-stone-50">
                <input
                  type="radio"
                  className="mt-0.5 accent-violet-600"
                  checked={mode === 'restore'}
                  onChange={() => setMode('restore')}
                />
                <span>
                  <span className="font-medium text-stone-700">原样恢复（覆盖）</span>
                  <span className="block text-xs text-stone-500">以备份中的 id 恢复数据，若同名项目已存在将被覆盖</span>
                </span>
              </label>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
