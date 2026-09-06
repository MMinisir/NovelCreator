/**
 * 基础类型定义（依据《详细设计文档 v2.0》§4 数据模型细化）
 * 所有实体均以 JSON 序列化存储，便于导出/导入与迁移。
 */

/** 通用实体基类：所有持久化实体必须包含的字段 */
export interface BaseEntity {
  id: string
  projectId: string
  createdAt: string
  updatedAt: string
}

/** 时间表达类型 */
export type TimeKind = 'exact' | 'chapter' | 'fuzzy' | 'relative'

/**
 * 灵活时间戳：统一小说内多种时间表达（设计文档 §2.4.1）。
 * - exact    ：精确时间，value 为 ISO 字符串，如 2024-03-15T14:30
 * - chapter  ：章节时间，value 为章节序号字符串，如 "3"（第3章）
 * - fuzzy    ：模糊时间，value 为描述，如 "春天"、"三年后"
 * - relative ：相对时间，value 为描述，如 "事件A发生前三天"
 * sortOrder 用于时间线排序：精确/章节时间可推导，模糊/相对时间由用户手动调整或 AI 建议后写入。
 */
export interface FlexibleTimestamp {
  type: TimeKind
  /** 根据 type 不同承载 ISO 日期 / 章节号 / 描述文本 */
  value: string
  /** 展示标签，如 "第3章"、"春天"，缺省时由 value 推导 */
  label?: string
  /** 时间线排序权重（模糊/相对时间专用） */
  sortOrder?: number
}

/** 人物重要程度（设计文档 §2.2.1） */
export type ImportanceLevel = 'protagonist' | 'major' | 'supporting' | 'minor'

export const IMPORTANCE_LABELS: Record<ImportanceLevel, string> = {
  protagonist: '主角',
  major: '重要配角',
  supporting: '配角',
  minor: '龙套',
}

export const IMPORTANCE_LEVELS: ImportanceLevel[] = ['protagonist', 'major', 'supporting', 'minor']

/** 优先级 */
export type Priority = 'high' | 'medium' | 'low'

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: '高',
  medium: '中',
  low: '低',
}
