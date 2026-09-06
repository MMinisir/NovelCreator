/** 通用工具：ID、时间、文件下载 */
import type { BaseEntity } from '@/types'

/** 生成全局唯一 ID（优先使用原生 crypto.randomUUID） */
export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 当前 ISO 时间 */
export function isoNow(): string {
  return new Date().toISOString()
}

/** 触发浏览器下载文件 */
export function downloadTextFile(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 读取 File 为文本 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file, 'utf-8')
  })
}

/** 构造带时间戳与 id 的实体 */
export function createEntity<T extends BaseEntity>(
  projectId: string,
  fields?: Partial<Omit<T, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>>,
): T {
  const now = isoNow()
  return {
    id: uid(),
    projectId,
    createdAt: now,
    updatedAt: now,
    ...(fields ?? {}),
  } as unknown as T
}

/** 字符串去空白，超长截断（用于列表摘要） */
export function truncate(text: string | undefined, max = 60): string {
  if (!text) return ''
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}
