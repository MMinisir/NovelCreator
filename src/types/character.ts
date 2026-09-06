import type { BaseEntity, FlexibleTimestamp, ImportanceLevel } from './base'

/** 人物状态变化类型（设计文档 §2.2.1 状态历史） */
export type CharacterStateKind =
  | 'upgrade' // 升级
  | 'injury' // 受伤
  | 'death' // 死亡
  | 'corruption' // 黑化/堕落
  | 'recovery' // 恢复
  | 'custom' // 自定义

/** 人物状态历史（设计文档 §2.2.1 状态模型） */
export interface CharacterState extends BaseEntity {
  characterId: string
  /** 变化发生的时间（“第10章” / 日期 / 模糊时间） */
  time: FlexibleTimestamp
  /** 状态摘要，如 “晋级金丹” */
  state: string
  kind: CharacterStateKind
  /** 详细描述状态变化及原因 */
  description?: string
  /** 关联触发事件 */
  relatedEventId?: string
}

/** 角色弧光阶段（设计文档 §2.2.1 弧光模型） */
export interface ArcStage extends BaseEntity {
  characterId: string
  /** 阶段名：初始状态/触发事件/成长堕落/高潮转变/最终状态…… */
  stage: string
  description?: string
  /** 阶段覆盖章节范围，如 “第1-5章” */
  chapterRange?: string
}

/** 人物实体（设计文档 §2.2.1） */
export interface Character extends BaseEntity {
  name: string
  /** 别名，用于正文识别与快速关联 */
  aliases: string[]
  importance: ImportanceLevel
  /** 支持模糊描述，如 “外表20岁，实际300岁” */
  gender?: string
  age?: string
  /** 外貌描述（富文本 HTML，TipTap 序列化结果） */
  appearance?: string
  /** 性格标签（MBTI、九型人格或自定义） */
  personalityTags: string[]
  /** 核心欲望：角色最深层的动机 */
  desire?: string
  /** 致命缺陷：角色性格弱点 */
  flaw?: string
  /** 背景故事（富文本） */
  background?: string
  /** 能力/技能列表，可关联世界观设定 */
  abilities: string[]
  /** 备注（富文本） */
  notes?: string
  /** 冗余最新状态，便于卡片直接展示，如 “第10章：晋级金丹” */
  currentState?: { time: FlexibleTimestamp; state: string } | null
  /** 预留自定义扩展字段（设计文档 §7.4） */
  extra?: Record<string, unknown>
}
