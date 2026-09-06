import type { BaseEntity } from './base'

/** 章节状态（设计文档 §2.8.2） */
export type ChapterStatus = 'not_started' | 'draft' | 'done' | 'revised'

export const CHAPTER_STATUS_LABELS: Record<ChapterStatus, string> = {
  not_started: '未开始',
  draft: '草稿',
  done: '已完成',
  revised: '已修改',
}

/** 章节版本（设计文档 §2.8.2 版本历史，自动/手动保存） */
export interface ChapterVersion {
  id: string
  chapterId: string
  content: string
  savedAt: string
  /** 手动标记版本时的说明 */
  label?: string
}

/** 正文章节实体（设计文档 §2.8） */
export interface Chapter extends BaseEntity {
  title: string
  /** 关联大纲章节节点 */
  outlineNodeId?: string
  /** Markdown 正文 */
  content: string
  status: ChapterStatus
  /** 字数（冗余，写入时自动统计） */
  wordCount: number
  /** 章节排序（相对大纲章节） */
  order: number
  /** 覆盖项目级目标字数 */
  targetWords?: number
}

/** 正文场景标签（设计文档 §2.8.1 章内场景标签） */
export interface Scene extends BaseEntity {
  chapterId: string
  /** 关联大纲场景节点 */
  outlineSceneId?: string
  label: string
  locationId?: string
  characterIds: string[]
  /** 关联正文的 markdown 字符区间（预留） */
  contentRange?: { from: number; to: number }
}
