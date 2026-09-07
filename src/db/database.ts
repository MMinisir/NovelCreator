import Dexie, { type EntityTable } from 'dexie'
import type { Character, CharacterState, ArcStage } from '@/types/character'
import type { Chapter, ChapterVersion, Scene } from '@/types/chapter'
import type { Foreshadowing, IdeaFragment, Comment, PromptTemplate, BackupMetadata, BackupSettings } from '@/types/meta'
import type { OutlineNode } from '@/types/outline'
import type { Project } from '@/types/project'
import type { Relationship, Location, StoryEvent } from '@/types/world'

/**
 * IndexedDB Schema（设计文档 §5.2 数据存储设计）
 * 数据库名 novel-tool，版本 1。所有对象以 JSON 序列化存储。
 */
export const DB_NAME = 'novel-tool'

class NovelDatabase extends Dexie {
  projects!: EntityTable<Project, 'id'>
  characters!: EntityTable<Character, 'id'>
  states!: EntityTable<CharacterState, 'id'>
  arcs!: EntityTable<ArcStage, 'id'>
  relationships!: EntityTable<Relationship, 'id'>
  locations!: EntityTable<Location, 'id'>
  events!: EntityTable<StoryEvent, 'id'>
  outline_nodes!: EntityTable<OutlineNode, 'id'>
  chapters!: EntityTable<Chapter, 'id'>
  chapter_versions!: EntityTable<ChapterVersion & { projectId: string }, 'id'>
  scenes!: EntityTable<Scene, 'id'>
  foreshadowings!: EntityTable<Foreshadowing, 'id'>
  idea_fragments!: EntityTable<IdeaFragment, 'id'>
  comments!: EntityTable<Comment, 'id'>
  prompt_templates!: EntityTable<PromptTemplate, 'id'>
  backup_metadata!: EntityTable<BackupMetadata, 'id'>
  backup_settings!: EntityTable<BackupSettings, 'id'>

  constructor() {
    super(DB_NAME)
    this.version(1).stores({
      // keyPath 均为 id；为所有项目内实体建 projectId 索引，便于按项目隔离/导出
      projects: 'id, name, status, updatedAt, deletedAt',
      characters: 'id, projectId, importance, name, updatedAt',
      states: 'id, projectId, characterId',
      arcs: 'id, projectId, characterId',
      relationships: 'id, projectId, sourceId, targetId, type',
      locations: 'id, projectId, type, name',
      events: 'id, projectId, type, time',
      outline_nodes: 'id, projectId, parentId, type',
      chapters: 'id, projectId, outlineNodeId, order, status',
      chapter_versions: 'id, projectId, chapterId',
      scenes: 'id, projectId, chapterId',
      foreshadowings: 'id, projectId, status, priority',
      idea_fragments: 'id, projectId',
      comments: 'id, projectId, targetType, targetId, status',
      prompt_templates: 'id, projectId, category',
      backup_metadata: 'id, exportedAt',
    })
    // Sprint 7 US-702：自动备份设置（单条 id='auto'）
    this.version(2).stores({
      backup_settings: 'id',
    })
    // 数据迁移策略：后续结构变更在此追加 version(n).upgrade(...) 迁移函数
  }
}

export const db = new NovelDatabase()

/** 数据库版本，供导出文件校验 */
export const DB_VERSION = 1
