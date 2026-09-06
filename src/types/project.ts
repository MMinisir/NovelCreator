import type { BaseEntity } from './base'

/** 项目状态（设计文档 §2.1.1：连载中/已完结/构思中） */
export type ProjectStatus = 'idea' | 'writing' | 'paused' | 'finished'

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  idea: '构思中',
  writing: '连载中',
  paused: '暂停',
  finished: '已完结',
}

/** 项目模板（设计文档 §2.1.1 新增） */
export type ProjectTemplate = 'webnovel' | 'literary' | 'script' | 'blank'

export const PROJECT_TEMPLATE_LABELS: Record<ProjectTemplate, string> = {
  webnovel: '网文模板',
  literary: '传统文学模板',
  script: '剧本/互动叙事模板',
  blank: '空白模板',
}

/** 引导模式 / 自由模式（设计文档 §1.1） */
export type ProjectMode = 'guided' | 'free'

/** 世界观设定：力量体系、社会规则等，以自由文本 + 标签存储（设计文档 §2.1.2） */
export interface WorldSetting {
  freeText: string
  tags: string[]
}

/** 时间设定 */
export interface TimeSetting {
  /** 故事起始时间 */
  start?: string
  /** 时间流速：现实时间与故事时间比例 */
  flowRate?: number
  /** 是否允许模糊时间 */
  allowFuzzy: boolean
}

/** 章节预设（设计文档 §2.1.2） */
export interface ChapterDefaults {
  /** 每章目标字数 */
  targetWords: number
  /** 章节命名规则，如 "第X章 {标题}" */
  namingRule: string
}

/** 项目实体（设计文档 §2.1） */
export interface Project extends BaseEntity {
  /** 书名 */
  name: string
  /** 笔名/作者 */
  penName?: string
  /** 类型：玄幻、都市、言情、悬疑…… */
  genre: string
  /** 一句话简介 */
  tagline?: string
  /** 封面（本地 DataURL 或外链） */
  cover?: string
  status: ProjectStatus
  /** 创建时选择的模板 */
  template: ProjectTemplate
  /** 标签分类，如“爽文”“群像” */
  tags: string[]
  worldSetting: WorldSetting
  /** 叙事视角：第一/第三人称/多视角 */
  narration?: string
  timeSetting: TimeSetting
  chapterDefaults: ChapterDefaults
  mode: ProjectMode
  /** 软删除时间戳（回收站语义预留） */
  deletedAt?: string
}

/** 新建项目入参（缺省字段由 store 填充默认值） */
export interface ProjectInput {
  name: string
  genre?: string
  penName?: string
  tagline?: string
  template?: ProjectTemplate
  status?: ProjectStatus
}
