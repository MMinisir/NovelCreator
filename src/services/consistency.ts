import { stripHtml } from '@/services/outline'
import { timeLabel } from '@/utils/time'
import { countWords } from '@/utils/text'
import type { Character, Location, Relationship, StoryEvent } from '@/types'
import type { Chapter } from '@/types/chapter'
import type { Foreshadowing } from '@/types/meta'
import type { OutlineNode } from '@/types/outline'

/**
 * 一致性检查规则引擎（Sprint 8 US-805 简化版，仅本地规则；LLM 语义检查 Sprint 9 接入）。
 * 纯函数：输入项目全量数据，输出结构化问题列表，不写库、不发请求。
 */

export type IssueLevel = 'error' | 'warn' | 'info'

export interface ConsistencyIssue {
  id: string
  level: IssueLevel
  category: '人物' | '关系' | '地点' | '事件' | '伏笔' | '章节' | '大纲'
  title: string
  detail: string
  /** 项目内相对跳转路径（如 `characters/<id>`） */
  link?: string
  targetName?: string
}

export interface ConsistencyInput {
  characters: Character[]
  locations: Location[]
  events: StoryEvent[]
  chapters: Chapter[]
  foreshadowings: Foreshadowing[]
  relationships: Relationship[]
  outlineNodes: OutlineNode[]
  /** 项目默认目标字数（章节未单独设置时使用） */
  defaultTargetWords?: number
}

const LEVEL_ORDER: Record<IssueLevel, number> = { error: 0, warn: 1, info: 2 }

/** 运行全部规则并按级别排序返回 */
export function runConsistencyChecks(input: ConsistencyInput): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const charById = new Map(input.characters.map((c) => [c.id, c]))

  /* ---------- 人物 ---------- */
  if (input.characters.length > 0 && !input.characters.some((c) => c.importance === 'protagonist')) {
    issues.push({
      id: 'character:no-protagonist',
      level: 'warn',
      category: '人物',
      title: '未标记主角',
      detail: '项目中还没有重要程度为「主角」的人物，建议指定一位以支撑视角与主线分析。',
    })
  }
  for (const c of input.characters) {
    if (c.personalityTags.length === 0) {
      issues.push({
        id: `character:no-tags:${c.id}`,
        level: 'info',
        category: '人物',
        title: `「${c.name}」缺少性格标签`,
        detail: '补充性格标签有助于保持人设一致，也便于 AI 生成与一致性检查。',
        link: `characters/${c.id}`,
        targetName: c.name,
      })
    }
    if (!stripHtml(c.desire ?? '') && !stripHtml(c.flaw ?? '')) {
      issues.push({
        id: `character:no-desire:${c.id}`,
        level: 'info',
        category: '人物',
        title: `「${c.name}」缺少欲望 / 缺陷`,
        detail: '核心欲望与致命缺陷是人物弧光的驱动，建议至少填写一项。',
        link: `characters/${c.id}`,
        targetName: c.name,
      })
    }
    if (!c.currentState && c.importance !== 'minor') {
      issues.push({
        id: `character:no-state:${c.id}`,
        level: 'info',
        category: '人物',
        title: `「${c.name}」无当前状态`,
        detail: '在人物详情的「状态历史」中记录一条，即可在时间线中追踪其变化。',
        link: `characters/${c.id}`,
        targetName: c.name,
      })
    }
  }

  /* ---------- 关系 ---------- */
  for (const r of input.relationships) {
    const missing = [r.sourceId, r.targetId].filter((id) => !charById.has(id))
    if (missing.length > 0) {
      issues.push({
        id: `relationship:missing:${r.id}`,
        level: 'error',
        category: '关系',
        title: '关系指向不存在的人物',
        detail: `关系「${r.type || '未命名'}」有 ${missing.length} 端人物已被删除，建议清理该关系。`,
      })
    }
  }
  const relatedIds = new Set<string>()
  for (const r of input.relationships) {
    relatedIds.add(r.sourceId)
    relatedIds.add(r.targetId)
  }
  for (const c of input.characters) {
    if (!relatedIds.has(c.id) && (c.importance === 'protagonist' || c.importance === 'major')) {
      issues.push({
        id: `relationship:isolated:${c.id}`,
        level: 'info',
        category: '关系',
        title: `「${c.name}」尚未建立任何关系`,
        detail: '主要人物通常至少与主角或反派存在关系，可在关系图中补充。',
        link: `characters/${c.id}`,
        targetName: c.name,
      })
    }
  }

  /* ---------- 地点 / 事件 ---------- */
  for (const l of input.locations) {
    if (!stripHtml(l.description ?? '')) {
      issues.push({
        id: `location:no-desc:${l.id}`,
        level: 'info',
        category: '地点',
        title: `地点「${l.name}」没有描述`,
        detail: '补一段环境与氛围描述，写作侧栏参考与 AI 生成都会用到。',
        targetName: l.name,
      })
    }
  }
  for (const e of input.events) {
    if (!timeLabel(e.time)) {
      issues.push({
        id: `event:no-time:${e.id}`,
        level: 'info',
        category: '事件',
        title: `事件「${e.name}」时间未定`,
        detail: '未标注时间的事件不会出现在时间线的确定位置，建议补齐或设为模糊时间。',
        targetName: e.name,
      })
    }
    if ((e.participantIds ?? []).length === 0) {
      issues.push({
        id: `event:no-participant:${e.id}`,
        level: 'info',
        category: '事件',
        title: `事件「${e.name}」没有参与者`,
        detail: '关联参与人物后，角色时间线才会显示该事件。',
        targetName: e.name,
      })
    }
    for (const pid of e.participantIds ?? []) {
      if (!charById.has(pid)) {
        issues.push({
          id: `event:missing-char:${e.id}:${pid}`,
          level: 'error',
          category: '事件',
          title: `事件「${e.name}」引用了不存在的人物`,
          detail: '该事件的参与者已被删除，建议移除该引用。',
          targetName: e.name,
        })
      }
    }
  }

  /* ---------- 伏笔 ---------- */
  const resolvedByOutline = new Set<string>()
  for (const n of input.outlineNodes) {
    for (const id of n.foreshadowingResolvedIds ?? []) resolvedByOutline.add(id)
  }
  for (const f of input.foreshadowings) {
    if (f.status === 'active') {
      if (!f.expectedResolveEventId) {
        issues.push({
          id: `foreshadowing:no-anchor:${f.id}`,
          level: 'warn',
          category: '伏笔',
          title: '活跃伏笔未设置预期回收位置',
          detail: `「${f.description.slice(0, 30)}${f.description.length > 30 ? '…' : ''}」没有锚定预期回收事件，时间线不会显示待回收节点。`,
          link: 'foreshadowing',
          targetName: f.description,
        })
      }
      if (resolvedByOutline.has(f.id)) {
        issues.push({
          id: `foreshadowing:inconsistent:${f.id}`,
          level: 'error',
          category: '伏笔',
          title: '伏笔状态与大纲回收标记不一致',
          detail: `「${f.description.slice(0, 30)}${f.description.length > 30 ? '…' : ''}」已被大纲节点标记为回收，但状态仍是活跃。`,
          link: 'foreshadowing',
          targetName: f.description,
        })
      }
      const ageDays = (Date.now() - new Date(f.createdAt).getTime()) / 86_400_000
      if (ageDays > 30) {
        issues.push({
          id: `foreshadowing:stale:${f.id}`,
          level: 'info',
          category: '伏笔',
          title: '活跃伏笔可能超期',
          detail: `「${f.description.slice(0, 30)}${f.description.length > 30 ? '…' : ''}」已活跃 ${Math.floor(ageDays)} 天仍未回收。`,
          link: 'foreshadowing',
          targetName: f.description,
        })
      }
    }
  }

  /* ---------- 章节 ---------- */
  for (const c of input.chapters) {
    const words = countWords(c.content)
    if (words === 0) {
      issues.push({
        id: `chapter:empty:${c.id}`,
        level: 'info',
        category: '章节',
        title: `章节「${c.title || '未命名'}」还没有正文`,
        detail: '可从大纲细纲一键生成草稿，或在写作区直接开始。',
        targetName: c.title,
      })
    } else if (c.status === 'done') {
      const target = c.targetWords ?? input.defaultTargetWords ?? 0
      if (target > 0 && words < target * 0.5) {
        issues.push({
          id: `chapter:short:${c.id}`,
          level: 'warn',
          category: '章节',
          title: `章节「${c.title || '未命名'}」字数明显低于目标`,
          detail: `当前 ${words.toLocaleString()} 字 / 目标 ${target.toLocaleString()} 字（不足 50%），若已完成可调整目标或补充内容。`,
          targetName: c.title,
        })
      }
    }
  }

  /* ---------- 大纲 ---------- */
  const hasAct = input.outlineNodes.some((n) => n.type === 'act')
  if (input.outlineNodes.length > 0 && !hasAct) {
    issues.push({
      id: 'outline:no-act',
      level: 'info',
      category: '大纲',
      title: '大纲还没有分幕 / 分卷',
      detail: '在故事核与五句话之后搭建分幕结构，有助于控制节奏。',
      link: 'outline',
    })
  }
  const linkedNodeIds = new Set(input.chapters.map((c) => c.outlineNodeId).filter(Boolean) as string[])
  const chapterNodes = input.outlineNodes.filter((n) => n.type === 'chapter')
  for (const n of chapterNodes) {
    if (!linkedNodeIds.has(n.id)) {
      issues.push({
        id: `outline:no-draft:${n.id}`,
        level: 'info',
        category: '大纲',
        title: `细纲「${n.title || '未命名'}」尚未展开为正文`,
        detail: '可在大纲中一键生成草稿，或在写作区新建章节并关联该细纲。',
        link: 'outline',
        targetName: n.title,
      })
    }
  }

  return issues.sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.category.localeCompare(b.category, 'zh-CN'),
  )
}

/** 统计各级别数量 */
export function summarizeIssues(issues: ConsistencyIssue[]): { error: number; warn: number; info: number; total: number } {
  return {
    error: issues.filter((i) => i.level === 'error').length,
    warn: issues.filter((i) => i.level === 'warn').length,
    info: issues.filter((i) => i.level === 'info').length,
    total: issues.length,
  }
}
