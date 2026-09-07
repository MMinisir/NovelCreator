import { createAIProvider } from './openaiCompat'
import { buildCharacterContextBrief, buildProjectContextBrief } from './contextBuilder'
import type { AIProviderConfig, ChatMessage } from './types'
import { SYNOPSIS_PARTS } from '@/services/outline'
import type { Character, Location, Project, StoryEvent } from '@/types'

/**
 * AI 任务层（Sprint 7 US-802/803/804）。
 * 只负责「拼提示 → 调 Provider → 解析结果」，UI 层负责可编辑与落库；
 * 所有函数为纯异步调用，失败抛中文错误，便于界面直接展示。
 */

const SYSTEM_PROMPT = `你是资深中文小说创作助手，熟悉类型小说结构与人物塑造。
要求：输出简体中文；内容具体、可执行、避免空话套话；不要输出解释性前言、不要 Markdown 标题符号，除非任务明确要求。`

function requireConfig(config: AIProviderConfig | null): AIProviderConfig {
  if (!config || !config.apiKey?.trim()) {
    throw new Error('尚未配置 AI 服务：请在「项目设置 → AI 服务配置」填写 API Key 并测试连接')
  }
  return config
}

async function runPrompt(
  config: AIProviderConfig | null,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const cfg = requireConfig(config)
  const provider = createAIProvider(cfg)
  return provider.chat({ messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages], signal })
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
}

/** 生成五句话梗概原始文本；返回格式要求「开端：…」五段 */
export async function generateSynopsisText(
  input: SynopsisInput,
  config: AIProviderConfig | null,
  signal?: AbortSignal,
): Promise<string> {
  const lines = [
    `请为下面这部小说创作“五句话梗概”（三幕式结构）。`,
    `输出格式严格要求：`,
    ...SYNOPSIS_PARTS.map((p) => `${p}：一句话`),
    ``,
    `题材/类型：${input.genre || '未指定'}`,
    `核心想法：${input.premise || '（作者未提供，请自行构思一个高概念设定）'}`,
  ]
  if (input.characters?.trim()) lines.push(`主要人物：${input.characters.trim()}`)
  if (input.style?.trim()) lines.push(`风格要求：${input.style.trim()}`)
  if (input.projectContext?.trim()) lines.push(``, `【已有设定参考】`, input.projectContext.trim().slice(0, 3000))
  lines.push(``, `每句控制在 30-60 字，共五句，直接输出。`)
  return runPrompt(config, [{ role: 'user', content: lines.join('\n') }], signal)
}

/**
 * 解析五句话梗概：优先按「开端：…」等分句名匹配；
 * 退化策略：按非空行顺序取前 5 行。始终返回 5 项（缺失为空串）。
 */
export function parseSynopsis(text: string): string[] {
  const out: string[] = new Array(SYNOPSIS_PARTS.length).fill('')
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\-*·\d.、]+/, '').trim())
    .filter(Boolean)
  let matched = 0
  for (const line of lines) {
    const idx = SYNOPSIS_PARTS.findIndex((p) => line.startsWith(`${p}：`) || line.startsWith(`${p}:`))
    if (idx >= 0) {
      out[idx] = line.replace(/^[^：:]+[：:]\s*/, '').trim()
      matched += 1
    }
  }
  if (matched === 0) {
    const plain = lines.slice(0, SYNOPSIS_PARTS.length)
    plain.forEach((l, i) => {
      out[i] = l
    })
  }
  return out
}

/* ---------------- US-803 人物小传 ---------------- */

export interface BioInput {
  /** 补充要求（如“突出悲剧色彩”） */
  extra?: string
  /** 期望字数 */
  words?: number
  projectContext?: string
}

/** 生成人物小传文本（富文本落库前由 UI 转 <p> 包裹） */
export async function generateCharacterBioText(
  character: Character,
  input: BioInput,
  config: AIProviderConfig | null,
  signal?: AbortSignal,
): Promise<string> {
  const words = input.words && input.words > 0 ? input.words : 400
  const lines = [
    `请为下面这个小说人物撰写人物小传（约 ${words} 字，可分段）。`,
    `要求：交代出身与关键经历，点明核心欲望与致命缺陷，语言贴合其身份；只输出小传正文。`,
    ``,
    buildCharacterContextBrief(character),
  ]
  if (input.projectContext?.trim()) lines.push(``, `【项目世界观参考】`, input.projectContext.trim().slice(0, 2000))
  if (input.extra?.trim()) lines.push(``, `补充要求：${input.extra.trim()}`)
  return runPrompt(config, [{ role: 'user', content: lines.join('\n') }], signal)
}

/** 纯文本 → 简单 HTML 段落（与 TipTap 存储一致） */
export function textToHtmlParagraphs(text: string): string {
  return text
    .split(/\r?\n\s*\r?\n|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('')
}

/* ---------------- US-804 人物关系建议 ---------------- */

export interface RelationshipSuggestion {
  sourceId?: string
  targetId?: string
  sourceName: string
  targetName: string
  type: string
  /** -100 ~ 100 */
  strength: number
  reason: string
  /** 采纳时是否跳过（已存在关系或人物缺失） */
  disabled?: boolean
  note?: string
}

function nameToId(characters: Character[], name: string): string | undefined {
  const key = name.trim()
  if (!key) return undefined
  const hit = characters.find((c) => c.name === key || c.aliases.includes(key))
  return hit?.id
}

/** 生成人物关系建议（返回结构化候选，含解析失败兜底） */
export async function generateRelationshipSuggestions(
  characters: Character[],
  input: { focusName?: string; extra?: string; projectContext?: string; max?: number },
  config: AIProviderConfig | null,
  signal?: AbortSignal,
): Promise<RelationshipSuggestion[]> {
  const pool = characters.slice(0, 30)
  const max = input.max && input.max > 0 ? input.max : 5
  const lines = [
    `下面是小说的人物列表，请提出 ${max} 条值得建立/强化的关系建议（不要重复已有常识性关系）。`,
    `只输出 JSON 数组（不要任何额外文字、不要代码块说明），每项格式：`,
    `{"source":"人物A姓名","target":"人物B姓名","type":"关系类型","strength":强度数字,"reason":"一句话理由"}`,
    `关系类型限定为：亲情/友情/爱情/敌对/师徒/合作/利用/暗恋/仇恨/其他 之一；`,
    `strength 取 -100 到 100 的整数（正数为正面关系，负数为负面关系）。`,
    ``,
    `【人物列表】`,
    pool.map((c, i) => `${i + 1}. ${c.name}${c.importance ? `（${c.importance}）` : ''}${c.personalityTags.length ? `，性格：${c.personalityTags.join('、')}` : ''}`).join('\n'),
  ]
  if (input.focusName?.trim()) lines.push(``, `优先围绕人物：${input.focusName.trim()}`)
  if (input.projectContext?.trim()) lines.push(``, `【项目世界观参考】`, input.projectContext.trim().slice(0, 1500))
  if (input.extra?.trim()) lines.push(``, `补充要求：${input.extra.trim()}`)

  const text = await runPrompt(config, [{ role: 'user', content: lines.join('\n') }], signal)
  const parsed = parseRelationshipSuggestions(text, pool)
  if (parsed.length === 0) {
    throw new Error('AI 未返回可解析的关系建议，可调整提示后重试')
  }
  return parsed
}

/** 从 AI 文本解析关系建议（容忍 ```json 包裹与前后说明文字） */
export function parseRelationshipSuggestions(text: string, characters: Character[]): RelationshipSuggestion[] {
  const json =
    text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() ??
    text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
  let arr: unknown
  try {
    arr = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const out: RelationshipSuggestion[] = []
  for (const item of arr as Array<Record<string, unknown>>) {
    const sourceName = String(item.source ?? item.sourceName ?? '').trim()
    const targetName = String(item.target ?? item.targetName ?? '').trim()
    if (!sourceName || !targetName) continue
    const rawStrength = Number(item.strength ?? 0)
    const strength = Number.isFinite(rawStrength) ? Math.max(-100, Math.min(100, Math.round(rawStrength))) : 0
    const sourceId = nameToId(characters, sourceName)
    const targetId = nameToId(characters, targetName)
    out.push({
      sourceId,
      targetId,
      sourceName,
      targetName,
      type: String(item.type ?? '其他').trim() || '其他',
      strength,
      reason: String(item.reason ?? '').trim(),
      disabled: !sourceId || !targetId,
      note: !sourceId || !targetId ? '人物未匹配到（需先创建该人物）' : undefined,
    })
  }
  return out
}

/* ---------------- 上下文快捷构建 ---------------- */

/** 由页面数据构建项目上下文文本（供各生成任务复用） */
export function buildProjectBrief(input: {
  project: Project
  characters: Character[]
  locations: Location[]
  events: StoryEvent[]
}): string {
  return buildProjectContextBrief(input)
}
