import type { BaseEntity, Priority } from './base'

/** 伏笔出现/回收位置 */
export interface StoryLocation {
  /** 章节展示名，如 “第3章” */
  chapter?: string
  /** 章节序号（数字，便于超期计算） */
  chapterNo?: number
  sceneId?: string
  /** 原文引用 */
  quote?: string
}

/** 伏笔状态（设计文档 §2.7） */
export type ForeshadowingStatus = 'active' | 'resolved' | 'abandoned'

export const FORESHADOWING_STATUS_LABELS: Record<ForeshadowingStatus, string> = {
  active: '活跃',
  resolved: '已回收',
  abandoned: '已废弃',
}

/** 伏笔实体（设计文档 §2.7.1） */
export interface Foreshadowing extends BaseEntity {
  /** 伏笔描述，如 “主角捡到的神秘戒指” */
  description: string
  /** 埋设位置 */
  plantedAt?: StoryLocation
  /** 预期回收位置 */
  expectedResolveAt?: StoryLocation
  status: ForeshadowingStatus
  /** 实际回收位置 */
  resolvedAt?: StoryLocation
  relatedCharacterIds: string[]
  relatedEventIds: string[]
  priority: Priority
}

/** 灵感碎片类型 */
export type IdeaKind = 'text' | 'voice' | 'photo'

/** 灵感碎片（设计文档 §4.1 新增，可拖入大纲或正文） */
export interface IdeaFragment extends BaseEntity {
  content: string
  /** 标签：人物/情节/对话…… */
  tags: string[]
  kind: IdeaKind
  /** 语音/拍照内容的 DataURL（仅 kind 非 text 时） */
  mediaDataUrl?: string
}

/** 评论/批注（设计文档 §4.1 新增） */
export interface Comment extends BaseEntity {
  /** 目标类型：chapter/character/location/event/outline…… */
  targetType: string
  targetId: string
  /** 定位锚点：段落序号或选中文本 */
  anchor?: string
  content: string
  /** 回复时指向父评论 */
  parentId: string | null
  status: 'open' | 'resolved'
  author?: string
}

/** 提示词模板（设计文档 §2.6.3，projectId 为空表示全局内置） */
export interface PromptTemplate extends BaseEntity {
  name: string
  category: string
  /** 模板文本，支持 {{variable}} 变量 */
  content: string
  variables: string[]
  builtin?: boolean
}

/** 备份元数据（设计文档 §4.1 新增，独立于项目） */
export interface BackupMetadata {
  id: string
  exportedAt: string
  version: number
  checksum: string
  size: number
  /** 备份中包含的记录条数 */
  recordCount: number
}
