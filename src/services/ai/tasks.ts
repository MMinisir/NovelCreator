import { createAIProvider } from './openaiCompat'
import { buildCharacterContextBrief, buildProjectContextBrief } from './contextBuilder'
import type { AIProviderConfig, ChatMessage } from './types'
import { SYNOPSIS_PARTS } from '@/services/outline'
import type { ConsistencyIssue, IssueLevel } from '@/services/consistency'
import type { HealthReport } from '@/services/health'
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

/* ---------------- US-806 润色选中文本 ---------------- */

export interface PolishInput {
  /** 选中原文 */
  text: string
  /** 场景上下文（如章节名） */
  context?: string
  /** 润色方向要求（如“更口语化”“氛围更凝重”） */
  style?: string
}

/** 润色小说片段：只输出润色后正文 */
export async function polishText(
  input: PolishInput,
  config: AIProviderConfig | null,
  signal?: AbortSignal,
): Promise<string> {
  const lines = [
    `请润色下面的小说片段。`,
    `要求：保持原意、人物口吻、叙事视角与段落结构；表达更生动流畅、用词更精炼，避免重复与空话；不新增情节、不改变人称与时间线。`,
    `直接输出润色后的正文，不要输出任何解释或前后缀文字。`,
    ``,
    `【待润色片段】`,
    input.text.trim().slice(0, 3000),
  ]
  if (input.context?.trim()) lines.push(``, `【所在章节】${input.context.trim()}`)
  if (input.style?.trim()) lines.push(``, `【润色方向】${input.style.trim()}`)
  return runPrompt(config, [{ role: 'user', content: lines.join('\n') }], signal)
}

/* ---------------- US-805 一致性检查（LLM 语义增强） ---------------- */

const AI_LEVELS: IssueLevel[] = ['error', 'warn', 'info']
const AI_CATEGORIES = ['人物', '关系', '地点', '事件', '伏笔', '章节', '大纲', '综合'] as const

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

/** 深度一致性检查：LLM 语义推断（如“人物A在后续章节已死却再次出场”），与规则引擎互补 */
export async function runDeepConsistencyCheck(
  input: DeepCheckInput,
  config: AIProviderConfig | null,
  signal?: AbortSignal,
): Promise<ConsistencyIssue[]> {
  const projectName = input.project?.name ?? '未命名项目'
  const charLines = input.characters
    .slice(0, 40)
    .map(
      (c, i) =>
        `${i + 1}. ${c.name}${c.importance ? `（重要度：${c.importance}）` : ''}${c.aliases.length ? `，别名：${c.aliases.join('/')}` : ''}${
          c.personalityTags.length ? `，性格：${c.personalityTags.join('、')}` : ''
        }${c.currentState?.state ? `，当前状态：${c.currentState.state}` : ''}`,
    )
    .join('\n')
  const chapterLines = [...input.chapters]
    .sort((a, b) => a.order - b.order)
    .slice(0, 8)
    .map((c) => `【${c.title || `第 ${c.order + 1} 章 未命名`}】${c.content.slice(0, 500)}`)
    .join('\n')
  const fsLines = input.foreshadowings.map((f) => `- ${f.description.slice(0, 60)}（状态：${f.status}）`).join('\n')

  const lines = [
    `你是资深中文小说审稿编辑。请对《${projectName}》进行语义一致性检查（基于设定数据与正文片段做推断），`,
    `找出需要作者留意的深层次矛盾或遗漏：如“人物已死/重伤却仍在后续出场”“时间线前后矛盾”“行为与人设不符”“地点空间矛盾”“伏笔埋设与回收矛盾”“章节间叙述断裂”等。`,
    `只输出 JSON 数组（不要代码块、不要任何解释文字），每项格式：`,
    `{"level":"error|warn|info","category":"人物|关系|地点|事件|伏笔|章节|大纲|综合","title":"一句话标题","detail":"说明矛盾所在与建议（80 字内）"}`,
    `要求：不要重复规则引擎已列出的问题；若没有额外发现，返回空数组 []。`,
    ``,
    `【人物】`,
    charLines || '（无人物）',
    ``,
    `【章节正文片段】`,
    chapterLines || '（无正文）',
    ``,
    `【伏笔】`,
    fsLines || '（无伏笔）',
    ``,
    `【设定规模】地点 ${input.locations.length} 个，事件 ${input.events.length} 个，细纲节点 ${input.outlineNodes.length} 个。`,
    ``,
    `【规则引擎已发现（勿重复）】`,
    input.existingIssues.map((i) => `- [${i.level}] ${i.title}`).join('\n') || '（无）',
  ]
  const text = await runPrompt(config, [{ role: 'user', content: lines.join('\n') }], signal)
  return parseDeepConsistencyIssues(text)
}

/** 解析 AI 深度检查输出（容忍 ```json 包裹），非法项丢弃 */
export function parseDeepConsistencyIssues(text: string): ConsistencyIssue[] {
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
  const out: ConsistencyIssue[] = []
  for (const item of arr as Array<Record<string, unknown>>) {
    const level = String(item.level ?? '').trim() as IssueLevel
    if (!AI_LEVELS.includes(level)) continue
    const cat = String(item.category ?? '').trim()
    const category = (AI_CATEGORIES as readonly string[]).includes(cat)
      ? (cat as ConsistencyIssue['category'])
      : ('综合' as const)
    const title = String(item.title ?? '').trim().slice(0, 60)
    const detail = String(item.detail ?? '').trim().slice(0, 200)
    if (!title && !detail) continue
    out.push({ id: `ai:${out.length}`, level, category, title: title || detail.slice(0, 30), detail })
  }
  return out
}

/* ---------------- 体检报告 AI 解读（Sprint 10 扩展） ---------------- */

/** 对健康度报告做语义解读：总体诊断 + 优先行动建议 */
export async function explainHealthReport(
  input: { projectName: string; report: HealthReport },
  config: AIProviderConfig | null,
  signal?: AbortSignal,
): Promise<string> {
  const { report } = input
  const lines = [
    `下面是小说《${input.projectName || '未命名作品'}》的故事体检评分，请给出编辑视角的解读与行动建议。`,
    `要求：先一句话总体诊断；再指出最该优先处理的 2-3 件事；最后给出可执行的下一步（结合下面维度信息）。`,
    `语气务实具体，避免空话；控制在 400 字以内，可分 2-3 段，不要 Markdown 标题符号。`,
    ``,
    `【总分】${report.total}/100（${report.level}）`,
    `【维度】`,
    ...report.dimensions.map((d) => `- ${d.label}：${d.score} 分（权重 ${d.weight}）· ${d.summary}`),
    ``,
    `【系统建议】`,
    report.suggestions.length ? report.suggestions.map((s) => `- ${s}`).join('\n') : '（暂无）',
  ]
  return runPrompt(config, [{ role: 'user', content: lines.join('\n') }], signal)
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
