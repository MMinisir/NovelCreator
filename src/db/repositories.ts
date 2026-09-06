/**
 * Repository 数据访问层（执行案 Sprint 1 任务分解）
 * 为各实体提供统一接口，业务层（store/page）不直接接触 Dexie 表。
 */
import { db } from './database'
import type { BaseEntity, EntityStoreName } from '@/types'
import type { ChapterVersion } from '@/types/chapter'
import { isoNow } from '@/utils/common'

/** 项目域通用 Repository */
export class ProjectScopedRepository<T extends BaseEntity> {
  constructor(private readonly storeName: EntityStoreName) {}

  private table() {
    return db.table<T, string>(this.storeName)
  }

  /** 全量列表（调试/迁移用） */
  async list(): Promise<T[]> {
    return this.table().toArray()
  }

  async byId(id: string): Promise<T | undefined> {
    return this.table().get(id)
  }

  /** 按项目查询（所有项目内实体均以 projectId 索引） */
  async byProject(projectId: string): Promise<T[]> {
    return this.table().where('projectId').equals(projectId).toArray()
  }

  async add(entity: T): Promise<T> {
    await this.table().add(entity)
    return entity
  }

  async update(id: string, patch: Partial<Omit<T, 'id'>>): Promise<T> {
    const exist = await this.table().get(id)
    if (!exist) throw new Error(`记录不存在：${this.storeName}#${id}`)
    const merged = { ...exist, ...patch, updatedAt: isoNow() } as T
    await this.table().put(merged)
    return merged
  }

  async remove(id: string): Promise<void> {
    await this.table().delete(id)
  }

  async bulkPut(entities: T[]): Promise<void> {
    if (entities.length) await this.table().bulkPut(entities)
  }

  /** 删除某项目下的全部实体（级联删除用） */
  async removeByProject(projectId: string): Promise<void> {
    await this.table().where('projectId').equals(projectId).delete()
  }
}

/** 项目 Repository（projectId 即自身 id） */
class ProjectRepository extends ProjectScopedRepository<import('@/types/project').Project> {
  constructor() {
    super('projects')
  }

  /** 项目列表按最后修改倒序 */
  async recent(): Promise<import('@/types/project').Project[]> {
    const all = await this.list()
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  /** 级联删除：移除项目及其所有关联实体 */
  async deleteCascade(projectId: string): Promise<void> {
    await db.transaction('rw', db.tables, async () => {
      const stores: EntityStoreName[] = [
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
      ]
      for (const s of stores) {
        await new ProjectScopedRepository(s).removeByProject(projectId)
      }
      await this.remove(projectId)
    })
  }
}

/** 章节版本（不继承 BaseEntity，单独访问） */
class ChapterVersionRepository {
  async listByChapter(chapterId: string): Promise<Array<ChapterVersion & { projectId: string }>> {
    return db.chapter_versions.where('chapterId').equals(chapterId).toArray()
  }

  async add(version: ChapterVersion & { projectId: string }): Promise<void> {
    await db.chapter_versions.add(version)
  }

  async byId(id: string) {
    return db.chapter_versions.get(id)
  }

  async remove(id: string): Promise<void> {
    await db.chapter_versions.delete(id)
  }
}

// —— 各实体 Repository 单例 ——
export const projectRepo = new ProjectRepository()
export const characterRepo = new ProjectScopedRepository<import('@/types/character').Character>('characters')
export const characterStateRepo = new ProjectScopedRepository<import('@/types/character').CharacterState>('states')
export const arcRepo = new ProjectScopedRepository<import('@/types/character').ArcStage>('arcs')
export const relationshipRepo = new ProjectScopedRepository<import('@/types/world').Relationship>('relationships')
export const locationRepo = new ProjectScopedRepository<import('@/types/world').Location>('locations')
export const eventRepo = new ProjectScopedRepository<import('@/types/world').StoryEvent>('events')
export const outlineRepo = new ProjectScopedRepository<import('@/types/outline').OutlineNode>('outline_nodes')
export const chapterRepo = new ProjectScopedRepository<import('@/types/chapter').Chapter>('chapters')
export const chapterVersionRepo = new ChapterVersionRepository()
export const sceneRepo = new ProjectScopedRepository<import('@/types/chapter').Scene>('scenes')
export const foreshadowingRepo = new ProjectScopedRepository<import('@/types/meta').Foreshadowing>('foreshadowings')
export const ideaRepo = new ProjectScopedRepository<import('@/types/meta').IdeaFragment>('idea_fragments')
export const commentRepo = new ProjectScopedRepository<import('@/types/meta').Comment>('comments')
export const promptTemplateRepo = new ProjectScopedRepository<import('@/types/meta').PromptTemplate>('prompt_templates')

/* ---------------- 引用清理 / 级联删除（Sprint 2） ---------------- */

/**
 * 删除人物及其级联数据：状态历史、弧光、涉及该人物的全部关系；
 * 同时从事件参与者、地点关联人物中移除该人物引用。
 */
export async function deleteCharacterCascade(characterId: string): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await db.states.where('characterId').equals(characterId).delete()
    await db.arcs.where('characterId').equals(characterId).delete()
    await db.relationships
      .filter((r) => r.sourceId === characterId || r.targetId === characterId)
      .delete()

    const events = await db.events
      .filter((e) => e.participantIds.includes(characterId))
      .toArray()
    for (const e of events) {
      e.participantIds = e.participantIds.filter((id) => id !== characterId)
      await db.events.put(e)
    }
    const locations = await db.locations
      .filter((l) => l.relatedCharacterIds.includes(characterId))
      .toArray()
    for (const l of locations) {
      l.relatedCharacterIds = l.relatedCharacterIds.filter((id) => id !== characterId)
      await db.locations.put(l)
    }
    await db.characters.delete(characterId)
  })
}

/** 删除地点并清理引用：其子地点父级置空、关联事件 locationId 置空 */
export async function deleteLocationCascade(locationId: string): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    const children = await db.locations.where('parentLocationId').equals(locationId).toArray()
    for (const c of children) {
      c.parentLocationId = undefined
      await db.locations.put(c)
    }
    const events = await db.events.where('locationId').equals(locationId).toArray()
    for (const e of events) {
      e.locationId = undefined
      await db.events.put(e)
    }
    await db.locations.delete(locationId)
  })
}

/** 删除事件并清理引用：地点关联事件列表、人物状态关联事件置空 */
export async function deleteEventCascade(eventId: string): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    const states = await db.states
      .filter((s) => s.relatedEventId === eventId)
      .toArray()
    for (const s of states) {
      s.relatedEventId = undefined
      await db.states.put(s)
    }
    const locations = await db.locations
      .filter((l) => l.relatedEventIds.includes(eventId))
      .toArray()
    for (const l of locations) {
      l.relatedEventIds = l.relatedEventIds.filter((id) => id !== eventId)
      await db.locations.put(l)
    }
    await db.events.delete(eventId)
  })
}

/** 删除人物关系（同时确保 sourceId < targetId 的单一记录约定不变） */
export async function removeRelationshipById(relationshipId: string): Promise<void> {
  await db.relationships.delete(relationshipId)
}

/* ---------------- 大纲 / 章节 级联删除（Sprint 3） ---------------- */

/**
 * 删除大纲节点及其全部后代。
 * 若该节点已生成正文草稿（chapters.outlineNodeId 指向它），草稿保留、关联置空。
 * 由该节点“埋设”的伏笔实体若不再被任何大纲节点引用则一并删除；
 * “回收”仅移出引用（伏笔实体保留其回收记录）。
 */
export async function deleteOutlineNodeCascade(nodeId: string): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    const descendants: string[] = []
    const collect = async (id: string) => {
      const children = await db.outline_nodes.where('parentId').equals(id).toArray()
      for (const c of children) {
        descendants.push(c.id)
        await collect(c.id)
      }
    }
    await collect(nodeId)
    const ids = [nodeId, ...descendants]

    // 关联正文草稿：保留草稿，仅解除大纲关联
    const chapters = await db.chapters
      .filter((c) => (c.outlineNodeId ? ids.includes(c.outlineNodeId) : false))
      .toArray()
    for (const c of chapters) {
      c.outlineNodeId = undefined
      await db.chapters.put(c)
    }

    // 该节点们埋设的伏笔：若不再被其余大纲节点引用则删除；回收关系仅随节点删除
    const plantedIds = new Set<string>()
    for (const id of ids) {
      const node = await db.outline_nodes.get(id)
      if (!node) continue
      for (const pid of node.foreshadowingPlantedIds ?? []) plantedIds.add(pid)
    }
    if (plantedIds.size) {
      const allNodes = await db.outline_nodes.toArray()
      const referenced = new Set<string>()
      for (const n of allNodes) {
        if (ids.includes(n.id)) continue
        for (const pid of [...(n.foreshadowingPlantedIds ?? []), ...(n.foreshadowingResolvedIds ?? [])]) {
          referenced.add(pid)
        }
      }
      for (const pid of plantedIds) {
        if (!referenced.has(pid)) await db.foreshadowings.delete(pid)
      }
    }

    await db.outline_nodes.bulkDelete(ids)
  })
}

/** 删除章节及其版本历史与场景标签（写作区 US-501a/501c 用） */
export async function deleteChapterCascade(chapterId: string): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await db.chapter_versions.where('chapterId').equals(chapterId).delete()
    await db.scenes.where('chapterId').equals(chapterId).delete()
    await db.chapters.delete(chapterId)
  })
}
