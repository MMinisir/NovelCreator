/**
 * 大纲系统领域服务（Sprint 3：US-201~204/206）
 * 负责大纲根结构的幂等初始化、节点增删、从章节细纲生成正文草稿、
 * 以及“伏笔埋设/回收”的最小闭环（实体创建与状态流转）。
 */
import { chapterRepo, deleteOutlineNodeCascade, foreshadowingRepo, outlineRepo } from '@/db/repositories'
import type { Chapter } from '@/types/chapter'
import type { Foreshadowing } from '@/types/meta'
import type { OutlineNode, OutlineNodeType } from '@/types/outline'
import { createEntity } from '@/utils/common'

/** 五句话梗概的固定分句（设计文档 §2.3.1 三幕式） */
export const SYNOPSIS_PARTS = ['开端', '发展', '高潮', '转折', '结局'] as const

export const NODE_TYPE_LABELS: Record<OutlineNodeType, string> = {
  root: '大纲',
  story_core: '故事核',
  logline: '五句话梗概',
  synopsis_item: '梗概分句',
  act: '分幕 / 分卷',
  chapter: '章节细纲',
  scene: '场景',
  free: '自由节点',
}

/** 结构引导类型（root 下固定存在，不参与大纲结构树） */
export const STRUCTURAL_TYPES: OutlineNodeType[] = ['story_core', 'logline', 'synopsis_item', 'root']

/**
 * 幂等初始化项目大纲根结构：
 * root → 其下 story_core（故事核）、logline（五句话梗概 → 5 个 synopsis_item）。
 * 已存在时直接返回，不重复创建。
 */
export async function ensureOutlineSeed(projectId: string): Promise<void> {
  const nodes = await outlineRepo.byProject(projectId)
  let root = nodes.find((n) => n.type === 'root')
  if (!root) {
    root = createEntity<OutlineNode>(projectId, {
      parentId: null,
      type: 'root',
      title: '大纲',
      order: 0,
      keyEventIds: [],
      characterIds: [],
      foreshadowingPlantedIds: [],
      foreshadowingResolvedIds: [],
    })
    await outlineRepo.add(root)
    nodes.push(root)
  }

  let storyCore = nodes.find((n) => n.type === 'story_core')
  if (!storyCore) {
    storyCore = await createOutlineChild(projectId, root.id, 'story_core', '故事核', nodes)
  }

  let logline = nodes.find((n) => n.type === 'logline')
  if (!logline) {
    logline = await createOutlineChild(projectId, root.id, 'logline', '五句话梗概', nodes)
  }
  const synopsisItems = nodes.filter((n) => n.type === 'synopsis_item' && n.parentId === logline?.id)
  if (logline) {
    for (let i = 0; i < SYNOPSIS_PARTS.length; i += 1) {
      const label = SYNOPSIS_PARTS[i]
      if (!synopsisItems.some((s) => s.title === label)) {
        const item = createEntity<OutlineNode>(projectId, {
          parentId: logline.id,
          type: 'synopsis_item',
          title: label,
          order: i,
          keyEventIds: [],
          characterIds: [],
          foreshadowingPlantedIds: [],
          foreshadowingResolvedIds: [],
        })
        await outlineRepo.add(item)
      }
    }
  }
}

async function createOutlineChild(
  projectId: string,
  parentId: string,
  type: OutlineNodeType,
  title: string,
  existing: OutlineNode[],
): Promise<OutlineNode> {
  const siblings = existing.filter((n) => n.parentId === parentId)
  const order = siblings.reduce((max, n) => Math.max(max, n.order), -1) + 1
  const node = createEntity<OutlineNode>(projectId, {
    parentId,
    type,
    title,
    order,
    keyEventIds: [],
    characterIds: [],
    foreshadowingPlantedIds: [],
    foreshadowingResolvedIds: [],
  })
  await outlineRepo.add(node)
  existing.push(node)
  return node
}

/** 在指定父节点下新增一个大纲节点（类型由调用方按层级约束校验） */
export async function addOutlineChild(projectId: string, parentId: string, type: OutlineNodeType, title: string): Promise<OutlineNode> {
  const siblings = await outlineRepo.byProject(projectId)
  const node = await createOutlineChild(projectId, parentId, type, title, siblings)
  return node
}

/** 判断某类型下可新增的子类型（Sprint 3 层级约束） */
export function allowedChildTypes(type: OutlineNodeType | undefined): OutlineNodeType[] {
  switch (type) {
    case undefined:
    case 'root':
      return ['act', 'free']
    case 'act':
      return ['chapter', 'free', 'act']
    case 'chapter':
      return ['scene', 'free']
    case 'scene':
      return []
    default:
      return []
  }
}

/** 删除节点（级联，见 repositories.deleteOutlineNodeCascade） */
export async function deleteOutlineNode(nodeId: string): Promise<void> {
  await deleteOutlineNodeCascade(nodeId)
}

/** 按项目加载伏笔 */
export async function listForeshadowings(projectId: string): Promise<Foreshadowing[]> {
  return foreshadowingRepo.byProject(projectId)
}

/** 创建“埋设”伏笔实体（伏笔中心 Sprint 6 提供完整管理，此处最小闭环） */
export async function plantVagueForeshadowing(projectId: string, description: string): Promise<Foreshadowing> {
  const f = createEntity<Foreshadowing>(projectId, {
    description,
    status: 'active',
    priority: 'medium',
    relatedCharacterIds: [],
    relatedEventIds: [],
  })
  await foreshadowingRepo.add(f)
  return f
}

/** 大纲节点编辑保存：联动更新伏笔状态（被回收的置为 resolved） */
export async function saveOutlineNode(
  nodeId: string,
  patch: Partial<Pick<OutlineNode, 'title' | 'content' | 'keyEventIds' | 'characterIds' | 'foreshadowingPlantedIds' | 'foreshadowingResolvedIds' | 'scene'>>,
): Promise<void> {
  await outlineRepo.update(nodeId, patch)
  const resolvedIds = patch.foreshadowingResolvedIds ?? []
  for (const id of resolvedIds) {
    const f = await foreshadowingRepo.byId(id)
    if (f && f.status !== 'resolved') {
      await foreshadowingRepo.update(id, { status: 'resolved' })
    }
  }
}

/**
 * 从章节细纲生成正文草稿（US-206 前瞻，Sprint 3 随大纲交付）：
 * 正文 content 以引用块附带“核心剧情”作为写作提示，关联 outlineNodeId。
 */
export async function createChapterDraftFromOutline(projectId: string, node: OutlineNode): Promise<Chapter> {
  const plain = stripHtml(node.content ?? '')
  const hint = plain
    ? `<blockquote><p>【本章核心剧情】${escapeHtml(plain)}</p></blockquote><p></p>`
    : ''
  const chapter = createEntity<Chapter>(projectId, {
    title: node.title?.trim() || '未命名章节',
    outlineNodeId: node.id,
    content: hint,
    status: 'draft',
    wordCount: 0,
    order: node.order,
  })
  await chapterRepo.add(chapter)
  return chapter
}

/** 简易 HTML → 纯文本（大纲节点核心剧情摘要用） */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
