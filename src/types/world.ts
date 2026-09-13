import type { BaseEntity, FlexibleTimestamp } from './base'

/** 地点实体（设计文档 §2.2.3） */
export interface Location extends BaseEntity {
  name: string
  /** 类型：城市/建筑/自然/异界/虚拟空间/其他 */
  type: string
  /** 描述（富文本） */
  description?: string
  /** 所属区域（地点层级，如“长安城”包含“皇宫”“集市”） */
  parentLocationId?: string
  /** 常驻或相关人物 */
  relatedCharacterIds: string[]
  /** 发生在此地的事件 */
  relatedEventIds: string[]
  /** 图片（DataURL 或外链） */
  image?: string
}

/** 事件实体（设计文档 §2.2.4） */
export interface StoryEvent extends BaseEntity {
  name: string
  /** 类型：主线/支线/日常/战斗/感情/转折/伏笔/回收…… */
  type: string
  /** 描述（富文本） */
  description?: string
  /** 时间戳：灵活时间 */
  time: FlexibleTimestamp
  /** 参与者 */
  participantIds: string[]
  /** 地点 */
  locationId?: string
  /** 结果：事件造成的影响 */
  outcome?: string
  /** 埋设或回收的伏笔 */
  foreshadowingIds: string[]
  /** 重要性：1-5 星 */
  importance: number
  /**
   * 情节张力 / 跌宕程度：1（平缓）~ 5（高潮），undefined = 未评估。
   * 时间线甘特图据此绘制「情节起伏曲线」。
   */
  tension?: number
  /** 排序权重：用于同时间事件排序 */
  sortWeight: number
}

/** 关系历史节点（设计文档 §2.2.2 关系模型 history） */
export interface RelationshipHistoryItem {
  /** 关系变化发生的时间 */
  time: FlexibleTimestamp
  strength: number
  type: string
  note?: string
}

/** 人物关系实体（设计文档 §2.2.2） */
export interface Relationship extends BaseEntity {
  sourceId: string
  targetId: string
  /** 关系类型：亲情/友情/爱情/敌对/师徒/合作/利用/暗恋/仇恨/其他 */
  type: string
  /** 关系强度：-100 ~ +100，负数为负面关系 */
  strength: number
  description?: string
  /** 是否随剧情动态变化 */
  dynamic: boolean
  /** 关系变化历史 */
  history: RelationshipHistoryItem[]
}
