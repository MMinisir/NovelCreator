import { buildCharacterContextBrief } from './contextBuilder'
import type { ChatMessage } from './types'
import { SYNOPSIS_PARTS } from '@/services/outline'
import type { ConsistencyIssue } from '@/services/consistency'
import type { HealthReport } from '@/services/health'
import type { Character, Location, Project, StoryEvent, AIRequestKind } from '@/types'
import {
  DEFAULT_PROMPT_CONTENT,
  renderByKind,
  renderCustom,
  getEffectiveSystemPrompt,
} from './templates'

/**
 * 提示构建层（与 tasks.ts 的「执行」分离；内容与「提示预览」完全一致）：
 * 所有提示文本已模板化并注册在 templates.ts —— 默认输出与历史逻辑等价，
 * 若用户在「提示词管理」页覆盖或选用自定义模板，渲染自动走覆盖/自定义内容。
 * 统一入口：buildXxxPrompt(input, template?)，template 为可选自定义模板全文。
 */

/** 系统提示默认文案（用于展示与导出转发；实际生效取覆盖/默认，见 getEffectiveSystemPrompt） */
export const SYSTEM_PROMPT = DEFAULT_PROMPT_CONTENT.system

export { getEffectiveSystemPrompt }

export const AI_KIND_LABELS: Record<AIRequestKind, string> = {
  synopsis: '五句话梗概',
  characterBio: '人物小传',
  relationship: '关系建议',
  polish: '润色选中文本',
  consistency: '一致性深度检查',
  health: '体检报告解读',
  characterCard: '一句话角色卡',
  custom: '自定义提示',
}

/** 组装最终请求消息（system + user；system 取「提示词管理」生效配置） */
export function withSystem(userText: string): ChatMessage[] {
  return [
    { role: 'system', content: getEffectiveSystemPrompt() },
    { role: 'user', content: userText },
  ]
}

/* ---------------- US-802 五句话梗概 ---------------- */

export interface SynopsisInput {
  /** 题材/类型，如“都市异能” */
  genre: string
  /** 一句话想法/卖点 */
  premise: string
  /** 主要人物（可选，逗号分隔的姓名） */
  characters?: string
  /** 风格或额外要求 */
  style?: string
  /** 项目已有上下文（世界观/人物/事件速览） */
  projectContext?: string
  projectId?: string
}

export function buildSynopsisPrompt(input: SynopsisInput, template?: string): string {
  const vars: Record<string, string> = {
    genre: input.genre?.trim() || '未指定',
    premise: input.premise?.trim() || '（作者未提供，请自行构思一个高概念设定）',
    characters: input.characters?.trim() ?? '',
    style: input.style?.trim() ?? '',
    projectContext: input.projectContext?.trim().slice(0, 3000) ?? '',
    partsLine: SYNOPSIS_PARTS.map((p) => `${p}：一句话`).join('\n'),
  }
  return template ? renderCustom(template, vars) : renderByKind('synopsis', vars)
}

/* ---------------- US-803 人物小传 ---------------- */

export interface BioInput {
  /** 补充要求（如“突出悲剧色彩”） */
  extra?: string
  /** 期望字数 */
  words?: number
  projectContext?: string
}

export function buildBioPrompt(character: Character, input: BioInput, template?: string): string {
  const words = input.words && input.words > 0 ? input.words : 400
  const vars: Record<string, string> = {
    words: String(words),
    characterBrief: buildCharacterContextBrief(character),
    projectContext: input.projectContext?.trim().slice(0, 2000) ?? '',
    extra: input.extra?.trim() ?? '',
  }
  return template ? renderCustom(template, vars) : renderByKind('characterBio', vars)
}

/* ---------------- US-804 人物关系建议 ---------------- */

export interface RelationshipInput {
  focusName?: string
  extra?: string
  projectContext?: string
  max?: number
  projectId?: string
}

export function buildRelationshipPrompt(characters: Character[], input: RelationshipInput, template?: string): string {
  const pool = characters.slice(0, 30)
  const max = input.max && input.max > 0 ? input.max : 5
  const vars: Record<string, string> = {
    max: String(max),
    pool: pool
      .map(
        (c, i) =>
          `${i + 1}. ${c.name}${c.importance ? `（${c.importance}）` : ''}${
            c.personalityTags.length ? `，性格：${c.personalityTags.join('、')}` : ''
          }`,
      )
      .join('\n'),
    focusName: input.focusName?.trim() ?? '',
    projectContext: input.projectContext?.trim().slice(0, 1500) ?? '',
    extra: input.extra?.trim() ?? '',
  }
  return template ? renderCustom(template, vars) : renderByKind('relationship', vars)
}

/* ---------------- US-806 润色选中文本 ---------------- */

export interface PolishInput {
  /** 选中原文 */
  text: string
  /** 场景上下文（如章节名） */
  context?: string
  /** 润色方向要求（如“更口语化”“氛围更凝重”） */
  style?: string
  projectId?: string
}

export function buildPolishPrompt(input: PolishInput, template?: string): string {
  const vars: Record<string, string> = {
    text: input.text.trim().slice(0, 3000),
    context: input.context?.trim() ?? '',
    style: input.style?.trim() ?? '',
  }
  return template ? renderCustom(template, vars) : renderByKind('polish', vars)
}

/* ---------------- US-805 一致性深度检查 ---------------- */

export interface DeepCheckInput {
  project?: Project | null
  characters: Character[]
  locations: Location[]
  events: StoryEvent[]
  chapters: Array<{ id: string; title: string; order: number; content: string; wordCount: number }>
  foreshadowings: Array<{ id: string; description: string; status: string; createdAt: string }>
  outlineNodes: Array<{ id: string; title?: string; type: string }>
  /** 规则引擎已发现的问题（让 AI 聚焦语义层、避免重复） */
  existingIssues: ConsistencyIssue[]
}

export function buildDeepConsistencyPrompt(input: DeepCheckInput, template?: string): string {
  const projectName = input.project?.name ?? '未命名项目'
  const charLines = input.characters
    .slice(0, 40)
    .map(
      (c, i) =>
        `${i + 1}. ${c.name}${c.importance ? `（重要度：${c.importance}）` : ''}${
          c.aliases.length ? `，别名：${c.aliases.join('/')}` : ''
        }${c.personalityTags.length ? `，性格：${c.personalityTags.join('、')}` : ''}${
          c.currentState?.state ? `，当前状态：${c.currentState.state}` : ''
        }`,
    )
    .join('\n')
  const chapterLines = [...input.chapters]
    .sort((a, b) => a.order - b.order)
    .slice(0, 8)
    .map((c) => `【${c.title || `第 ${c.order + 1} 章 未命名`}】${c.content.slice(0, 500)}`)
    .join('\n')
  const fsLines = input.foreshadowings.map((f) => `- ${f.description.slice(0, 60)}（状态：${f.status}）`).join('\n')
  const vars: Record<string, string> = {
    projectName,
    charactersText: charLines || '（无人物）',
    chaptersText: chapterLines || '（无正文）',
    foreshadowingsText: fsLines || '（无伏笔）',
    locationCount: String(input.locations.length),
    eventCount: String(input.events.length),
    outlineCount: String(input.outlineNodes.length),
    existingIssuesText: input.existingIssues.map((i) => `- [${i.level}] ${i.title}`).join('\n') || '（无）',
  }
  return template ? renderCustom(template, vars) : renderByKind('consistency', vars)
}

/* ---------------- 一句话生成角色卡 ---------------- */

export interface CharacterCardInput {
  prompt: string
  genre?: string
  worldContext?: string
  existingNames?: string[]
  extra?: string
  projectId?: string
}

export function buildCharacterCardPrompt(input: CharacterCardInput, template?: string): string {
  const vars: Record<string, string> = {
    prompt: input.prompt.trim(),
    genre: input.genre?.trim() ?? '',
    worldContext: input.worldContext?.trim().slice(0, 1500) ?? '',
    existingNames: input.existingNames?.length ? input.existingNames.join('、') : '',
    extra: input.extra?.trim() ?? '',
  }
  return template ? renderCustom(template, vars) : renderByKind('characterCard', vars)
}

/* ---------------- 体检报告 AI 解读 ---------------- */

export function buildHealthExplainPrompt(
  input: { projectName: string; report: HealthReport },
  template?: string,
): string {
  const { report } = input
  const vars: Record<string, string> = {
    projectName: input.projectName || '未命名作品',
    total: String(report.total),
    level: report.level,
    dimensionLines: report.dimensions.map((d) => `- ${d.label}：${d.score} 分（权重 ${d.weight}）· ${d.summary}`).join('\n'),
    suggestionLines: report.suggestions.length ? report.suggestions.map((s) => `- ${s}`).join('\n') : '（暂无）',
  }
  return template ? renderCustom(template, vars) : renderByKind('health', vars)
}
