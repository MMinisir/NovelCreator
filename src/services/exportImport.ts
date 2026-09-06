/**
 * 项目 JSON 导出 / 导入服务（US-004 / US-005 / US-703）
 * 导出格式：
 * {
 *   format: 'novel-tool',
 *   version: 1,
 *   exportedAt: '...',
 *   app: { name, version },
 *   project: { id, name },
 *   data: { projects: [...], characters: [...], ... }   // 仅包含该项目数据
 * }
 */
import { db, DB_VERSION } from '@/db/database'
import { ENTITY_STORE_NAMES, type EntityStoreName } from '@/types'
import { isoNow, uid } from '@/utils/common'
import type { Project } from '@/types/project'

export const EXPORT_FORMAT = 'novel-tool'
export const EXPORT_VERSION = 1

export interface ExportEnvelope {
  format: string
  version: number
  exportedAt: string
  app: { name: string; version: string }
  project: { id: string; name: string }
  data: Partial<Record<EntityStoreName, unknown[]>>
}

/** 轻量校验和（用于备份元数据，非安全用途） */
function checksum(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  return `h${h.toString(16)}`
}

/** 收集某项目在全部 Store 中的数据（不含跨项目全局模板） */
async function collectProjectData(projectId: string): Promise<Partial<Record<EntityStoreName, unknown[]>>> {
  const data: Partial<Record<EntityStoreName, unknown[]>> = {}
  const project = await db.projects.get(projectId)
  if (!project) throw new Error('项目不存在，无法导出')
  for (const name of ENTITY_STORE_NAMES) {
    if (name === 'projects') {
      data[name] = [project]
    } else {
      // 除 projects 外所有 Store 均建了 projectId 索引
      const rows = await db.table(name).where('projectId').equals(projectId).toArray()
      data[name] = rows
    }
  }
  return data
}

/** 导出项目为 JSON 文本，并记录一条备份元数据 */
export async function exportProjectToJson(projectId: string): Promise<string> {
  const project = (await db.projects.get(projectId)) as Project | undefined
  if (!project) throw new Error('项目不存在，无法导出')
  const data = await collectProjectData(projectId)
  const envelope: ExportEnvelope = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: isoNow(),
    app: { name: 'NovelCreator', version: '0.1.0' },
    project: { id: project.id, name: project.name },
    data,
  }
  const text = JSON.stringify(envelope, null, 2)

  await db.backup_metadata.add({
    id: uid(),
    exportedAt: envelope.exportedAt,
    version: DB_VERSION,
    checksum: checksum(text),
    size: new Blob([text]).size,
    recordCount: ENTITY_STORE_NAMES.reduce((n, k) => n + (data[k]?.length ?? 0), 0),
  })
  return text
}

/** 解析并校验导出 JSON，返回 envelope */
export function parseExport(jsonText: string): ExportEnvelope {
  let obj: unknown
  try {
    obj = JSON.parse(jsonText)
  } catch {
    throw new Error('文件不是有效的 JSON')
  }
  const envelope = obj as ExportEnvelope
  if (!envelope || envelope.format !== EXPORT_FORMAT) {
    throw new Error('不是 NovelCreator 导出的项目文件')
  }
  if (!envelope.data || !envelope.project?.id) {
    throw new Error('导出文件缺少关键数据')
  }
  return envelope
}

/** 将所有行中指向旧 id 的字符串引用映射为新 id（数组与单值均处理） */
function remapReferences(row: Record<string, unknown>, idMap: ReadonlyMap<string, string>): void {
  for (const key of Object.keys(row)) {
    const v = row[key]
    if (Array.isArray(v)) {
      row[key] = v.map((item) => (typeof item === 'string' && idMap.has(item) ? idMap.get(item) : item))
    } else if (typeof v === 'string' && idMap.has(v)) {
      row[key] = idMap.get(v)
    }
  }
}

/**
 * 导入项目。
 * @param jsonText 导出文件文本
 * @param asNewProject true 时作为全新项目导入（重写全部 id 与引用），false 时原样恢复（覆盖同 id 数据）
 */
export async function importProjectFromJson(
  jsonText: string,
  asNewProject = false,
): Promise<{ projectId: string; name: string; storeCounts: Record<string, number> }> {
  const envelope = parseExport(jsonText)
  const source = envelope.data
  const oldProjectId = envelope.project.id
  const counts: Record<string, number> = {}

  // 构造 id 映射（仅 asNewProject 时使用）
  const idMap = new Map<string, string>()
  let newProjectId = oldProjectId
  if (asNewProject) {
    newProjectId = uid()
    idMap.set(oldProjectId, newProjectId)
    for (const rows of Object.values(source)) {
      for (const row of rows as Array<Record<string, unknown>>) {
        if (row && typeof row.id === 'string' && !idMap.has(row.id)) {
          idMap.set(row.id, uid())
        }
      }
    }
  }

  await db.transaction('rw', db.tables, async () => {
    for (const name of ENTITY_STORE_NAMES) {
      const raw = source[name]
      if (!raw?.length) {
        counts[name] = 0
        continue
      }
      const rows = raw.map((r) => ({ ...(r as Record<string, unknown>) }))
      for (const row of rows) {
        if (asNewProject) remapReferences(row, idMap)
        else row.projectId = oldProjectId // 归一化，避免脏数据
      }
      await db.table(name).bulkPut(rows as never[])
      counts[name] = rows.length
    }
  })

  return { projectId: newProjectId, name: envelope.project.name, storeCounts: counts }
}
