import { db } from '@/db/database'
import { isoNow, uid } from '@/utils/common'
import type { AIRequestKind, AIRequestLog } from '@/types/meta'
import { AI_KIND_LABELS } from './prompts'

/**
 * AI 请求日志（提示预览 + 请求留痕）：
 * 每次请求写入完整 messages 与响应/错误/耗时，供「AI 请求历史」页复查。
 * 存本地 IndexedDB（ai_request_logs），不参与项目导出与合并。
 */

export { AI_KIND_LABELS }

export interface StartLogInput {
  projectId?: string
  kind: AIRequestKind
  label?: string
  messages: AIRequestLog['messages']
  inputSummary?: string
  provider?: string
  model?: string
}

/** 请求开始：写入 pending 记录并返回 id */
export async function startRequestLog(input: StartLogInput): Promise<string> {
  const id = uid()
  const log: AIRequestLog = {
    id,
    projectId: input.projectId,
    kind: input.kind,
    label: input.label ?? AI_KIND_LABELS[input.kind],
    createdAt: isoNow(),
    status: 'pending',
    provider: input.provider,
    model: input.model,
    messages: input.messages,
    inputSummary: input.inputSummary,
  }
  await db.ai_request_logs.add(log)
  return id
}

/** 请求结束：更新状态与结果 */
export async function finishRequestLog(id: string, patch: Partial<AIRequestLog>): Promise<void> {
  try {
    await db.ai_request_logs.update(id, patch)
  } catch {
    /* 日志失败不影响主流程 */
  }
}

/** 最近请求（默认本项目相关 + 全局请求） */
export async function listRequestLogs(projectId?: string, limit = 200): Promise<AIRequestLog[]> {
  const all = await db.ai_request_logs.orderBy('createdAt').reverse().limit(limit).toArray()
  if (!projectId) return all
  // 项目内请求优先展示，同时保留无项目归属的请求
  return all.filter((l) => !l.projectId || l.projectId === projectId)
}

export async function getRequestLog(id: string): Promise<AIRequestLog | undefined> {
  return db.ai_request_logs.get(id)
}

export async function deleteRequestLog(id: string): Promise<void> {
  await db.ai_request_logs.delete(id)
}

/** 清空：传 projectId 只清该项目，否则清空全部 */
export async function clearRequestLogs(projectId?: string): Promise<void> {
  if (!projectId) {
    await db.ai_request_logs.clear()
    return
  }
  const ids = (await db.ai_request_logs.where('projectId').equals(projectId).toArray()).map((l) => l.id)
  if (ids.length) await db.ai_request_logs.bulkDelete(ids)
}

export function summarizeLogs(logs: AIRequestLog[]): { total: number; ok: number; error: number; aborted: number; pending: number } {
  const s = { total: logs.length, ok: 0, error: 0, aborted: 0, pending: 0 }
  for (const l of logs) {
    if (l.status === 'ok') s.ok += 1
    else if (l.status === 'error') s.error += 1
    else if (l.status === 'aborted') s.aborted += 1
    else s.pending += 1
  }
  return s
}
