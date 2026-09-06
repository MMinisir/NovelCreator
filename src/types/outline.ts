import type { BaseEntity } from './base'

/**
 * 大纲节点类型（设计文档 §2.3 多级大纲结构 + §2.3.1 自由节点）
 * 大纲以通用树结构存储：story_core / 五句话梗概 / 分幕 / 章节细纲 / 场景 / 自由节点。
 */
export type OutlineNodeType =
  /** 大纲根容器（每项目一个） */
  | 'root'
  /** 故事核：核心冲突/核心问题 */
  | 'story_core'
  /** 五句话梗概容器 */
  | 'logline'
  /** 五句话梗概中的一句（开端/发展/高潮/转折/结局） */
  | 'synopsis_item'
  /** 分幕/分卷 */
  | 'act'
  /** 章节细纲 */
  | 'chapter'
  /** 场景清单 */
  | 'scene'
  /** 自由节点：灵感碎片、备注、待办（不强制符合结构） */
  | 'free'

/** 场景数据（设计文档 §2.3.1 场景清单） */
export interface OutlineSceneData {
  /** 场景目标 */
  goal?: string
  /** 地点 */
  locationId?: string
  /** 出场人物 */
  characterIds: string[]
  /** 冲突 */
  conflict?: string
  /** 结果 */
  outcome?: string
}

/** 大纲节点实体（设计文档 §5.2 outline_nodes，parentId + order 索引） */
export interface OutlineNode extends BaseEntity {
  parentId: string | null
  type: OutlineNodeType
  title?: string
  /** 概要/核心剧情（富文本或纯文本） */
  content?: string
  /** 同级排序 */
  order: number
  /** 关键事件引用 */
  keyEventIds: string[]
  /** 出场人物 */
  characterIds: string[]
  /** 埋设伏笔 */
  foreshadowingPlantedIds: string[]
  /** 回收伏笔 */
  foreshadowingResolvedIds: string[]
  /** 场景类型节点专用 */
  scene?: OutlineSceneData
}
