export * from './base'
export * from './project'
export * from './character'
export * from './world'
export * from './outline'
export * from './chapter'
export * from './meta'

/** 所有实体类 Store 名称（导出/导入时按序遍历） */
export const ENTITY_STORE_NAMES = [
  'projects',
  'characters',
  'states',
  'arcs',
  'relationships',
  'locations',
  'events',
  'outline_nodes',
  'chapters',
  'chapter_versions',
  'scenes',
  'foreshadowings',
  'idea_fragments',
  'comments',
  'prompt_templates',
] as const

export type EntityStoreName = (typeof ENTITY_STORE_NAMES)[number]
