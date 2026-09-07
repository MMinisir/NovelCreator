import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Activity, ChevronDown, ChevronRight, Copy, Trash2 } from 'lucide-react'
import { Badge, Button, ConfirmDialog, EmptyState, cn } from '@/components/ui'
import { AI_KIND_LABELS, clearRequestLogs, deleteRequestLog, listRequestLogs, summarizeLogs } from '@/services/ai/log'
import type { AIRequestLog } from '@/types'

const STATUS_BADGE: Record<AIRequestLog['status'], 'green' | 'red' | 'amber' | 'slate'> = {
  ok: 'green',
  error: 'red',
  aborted: 'amber',
  pending: 'slate',
}
const STATUS_LABEL: Record<AIRequestLog['status'], string> = {
  ok: '成功',
  error: '失败',
  aborted: '已取消',
  pending: '进行中',
}

/**
 * AI 请求历史页：
 * 展示每次 AI 调用的完整提示、响应/错误与耗时（本机 IndexedDB 存储，不随项目导出）。
 */
export default function AIHistoryPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [logs, setLogs] = useState<AIRequestLog[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setLogs(await listRequestLogs(projectId))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(() => summarizeLogs(logs), [logs])

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      /* 忽略 */
    }
  }

  async function handleDelete(id: string) {
    await deleteRequestLog(id)
    if (expanded === id) setExpanded(null)
    await load()
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">AI 请求历史</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            每次 AI 调用的完整提示与响应留痕（保存在本机浏览器数据库，不随项目导出）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => void load()} loading={loading}>
            刷新
          </Button>
          <Button variant="secondary" disabled={logs.length === 0} onClick={() => setClearOpen(true)}>
            <Trash2 className="size-4" /> 清空本项目
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <Badge color="slate">共 {stats.total} 次</Badge>
        <Badge color="green">成功 {stats.ok}</Badge>
        <Badge color="red">失败 {stats.error}</Badge>
        <Badge color="amber">取消 {stats.aborted}</Badge>
        {stats.pending > 0 && <Badge color="slate">进行中 {stats.pending}</Badge>}
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon={<Activity className="size-6" />}
          title="还没有 AI 请求记录"
          description="在任何 AI 功能（梗概、小传、关系建议、润色、一致性检查、体检解读、角色卡）中发起一次生成，这里就会出现完整提示与响应。"
        />
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => {
            const open = expanded === log.id
            return (
              <li key={log.id} className="rounded-2xl border border-stone-200 bg-white shadow-sm">
                <button
                  onClick={() => setExpanded(open ? null : log.id)}
                  className="flex w-full cursor-pointer items-start gap-2 px-4 py-3 text-left"
                >
                  <span className="mt-0.5 text-stone-400">
                    {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color="violet">{AI_KIND_LABELS[log.kind]}</Badge>
                      <Badge color={STATUS_BADGE[log.status]}>{STATUS_LABEL[log.status]}</Badge>
                      <span className="text-sm font-medium text-stone-900">{log.label}</span>
                      {log.model && <span className="text-xs text-stone-400">{log.model}</span>}
                      {log.durationMs !== undefined && (
                        <span className="text-xs text-stone-400">{(log.durationMs / 1000).toFixed(1)}s</span>
                      )}
                      <span className="text-xs text-stone-400">{new Date(log.createdAt).toLocaleString('zh-CN', { hour12: false })}</span>
                    </div>
                    {log.inputSummary && (
                      <p className="mt-1 truncate text-xs text-stone-500">输入：{log.inputSummary}</p>
                    )}
                    {log.error && <p className="mt-1 truncate text-xs text-red-600">错误：{log.error}</p>}
                  </div>
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDelete(log.id)
                    }}
                    className="cursor-pointer rounded p-1 text-stone-300 transition-colors hover:bg-red-50 hover:text-red-600"
                    aria-label="删除这条记录"
                  >
                    <Trash2 className="size-3.5" />
                  </span>
                </button>

                {open && (
                  <div className="space-y-3 border-t border-stone-100 px-4 py-3">
                    {log.messages.map((m, i) => (
                      <div key={i}>
                        <div className="mb-1 flex items-center justify-between text-xs text-stone-500">
                          <span>{m.role === 'system' ? '系统提示' : '用户提示'}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              void copy(m.content, `${log.id}-m${i}`)
                            }}
                            className="cursor-pointer text-stone-400 hover:text-violet-700"
                          >
                            <Copy className="size-3.5" />
                            {copied === `${log.id}-m${i}` && <span className="ml-1">已复制</span>}
                          </button>
                        </div>
                        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-xs leading-relaxed text-stone-700">
                          {m.content}
                        </pre>
                      </div>
                    ))}

                    {log.response && (
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs text-stone-500">
                          <span>响应（{log.response.length} 字）</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              void copy(log.response ?? '', `${log.id}-r`)
                            }}
                            className="cursor-pointer text-stone-400 hover:text-violet-700"
                          >
                            <Copy className="size-3.5" />
                            {copied === `${log.id}-r` && <span className="ml-1">已复制</span>}
                          </button>
                        </div>
                        <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-emerald-50/50 p-3 text-xs leading-relaxed text-stone-700">
                          {log.response}
                        </pre>
                      </div>
                    )}

                    {log.error && (
                      <p className={cn('rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700')}>{log.error}</p>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={clearOpen}
        title="清空 AI 请求历史"
        description="将删除当前项目的全部 AI 请求记录（不可恢复）。其它项目的记录不受影响。"
        confirmText="清空"
        danger
        onCancel={() => setClearOpen(false)}
        onConfirm={() => {
          void (async () => {
            await clearRequestLogs(projectId)
            setClearOpen(false)
            await load()
          })()
        }}
      />
    </div>
  )
}
