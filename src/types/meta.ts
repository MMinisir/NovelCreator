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

/** 伏笔实体（设计文档 §2.7.1；Sprint 6 US-601 独立管理页开放） */
export interface Foreshadowing extends BaseEntity {
  /** 伏笔描述，如 “主角捡到的神秘戒指” */
  description: string
  /** 埋设位置（大纲/章节级记录，另见大纲节点 foreshadowingPlantedIds 闭环） */
  plantedAt?: StoryLocation
  /** 预期回收位置（文本记录） */
  expectedResolveAt?: StoryLocation
  /** 预期回收事件锚点（US-602 时间线伏笔节点取该事件时间） */
  expectedResolveEventId?: string
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

/**
 * 自动备份设置（Sprint 7 US-702）：单条记录（id='auto'）。
 * handle 为 File System Access API 的目录句柄，IndexedDB 可结构化克隆持久化；
 * 重新打开页面后需 queryPermission/requestPermission 恢复写权限。
 */
export interface BackupSettings {
  id: string
  enabled: boolean
  /** 备份目录名（仅用于展示） */
  dirName?: string
  /** 目录句柄（FileSystemDirectoryHandle，类型由使用方断言） */
  handle?: unknown
  /** 自动备份间隔（分钟） */
  intervalMinutes: number
  /** 是否使用口令加密备份文件 */
  encrypted: boolean
  lastBackupAt?: string
  /** 最近一次备份结果文案 */
  lastResult?: string
  updatedAt: string
}
