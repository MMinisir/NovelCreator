import { createAIProvider } from './openaiCompat'
import { buildProjectContextBrief } from './contextBuilder'
import type { AIProviderConfig, ChatMessage } from './types'
import {
  AI_KIND_LABELS,
  SYSTEM_PROMPT,
  getEffectiveSystemPrompt,
  withSystem,
  buildSynopsisPrompt,
  buildBioPrompt,
  buildRelationshipPrompt,
  buildPolishPrompt,
  buildChapterContentPrompt,
  buildDeepConsistencyPrompt,
  buildCharacterCardPrompt,
  buildHealthExplainPrompt,
} from './prompts'
import type {
  SynopsisInput,
  BioInput,
  RelationshipInput,
  PolishInput,
  ChapterContentInput,
  DeepCheckInput,
  CharacterCardInput,
} from './prompts'
import { finishRequestLog, startRequestLog } from './log'
import { SYNOPSIS_PARTS } from '@/services/outline'
import type { ConsistencyIssue, IssueLevel } from '@/services/consistency'
import type { HealthReport } from '@/services/health'
import type { AIRequestKind } from '@/types'
import type { Character, Location, Project, StoryEvent } from '@/types'

export type {
  SynopsisInput,
  BioInput,
  RelationshipInput,
  PolishInput,
  ChapterContentInput,
  DeepCheckInput,
  CharacterCardInput,
} from './prompts'
export { AI_KIND_LABELS, SYSTEM_PROMPT }

/**
 * AI 任务层（Sprint 7 US-802/803/804）：
 * 提示构建在 `prompts.ts`（与「提示预览」共用同一份内容），
 * 本文件只负责「调 Provider → 解析结果 → 记录请求日志」，UI 层负责可编辑与落库。
 */

function requireConfig(config: AIProviderConfig | null): AIProviderConfig {
  if (!config || !config.apiKey?.trim()) {
    throw new Error('尚未配置 AI 服务：请在「项目设置 → AI 服务配置」填写 API Key 并测试连接')
  }
  return config
}

interface RequestMeta {
  projectId?: string
  kind: AIRequestKind
  label?: string
  /** 列表页快速识别用（如一句话设定、章节名） */
  inputSummary?: string
}

/** 执行请求并留痕：完整提示、响应、错误与耗时写入 ai_request_logs */
async function runPrompt(
  meta: RequestMeta,
  messages: ChatMessage[],
  config: AIProviderConfig | null,
  signal?: AbortSignal,
): Promise<string> {
  const cfg = requireConfig(config)
  const provider = createAIProvider(cfg)
  const logId = await startRequestLog({
    projectId: meta.projectId,
    kind: meta.kind,
    label: meta.label,
    messages: messages as Array<{ role: 'system' | 'user'; content: string }>,
    inputSummary: meta.inputSummary,
    provider: cfg.providerId,
    model: cfg.model,
  })
  const startedAt = Date.now()
  try {
    const text = await provider.chat({ messages, signal })
    await finishRequestLog(logId, { status: 'ok', response: text, durationMs: Date.now() - startedAt })
    return text
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError'
    await finishRequestLog(logId, {
      status: aborted ? 'aborted' : 'error',
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
    })
    throw err
  }
}

/** 使用自定义提示直接请求（提示预览中编辑后「用此提示生成」） */
export async function runCustomPrompt(
  meta: RequestMeta,
  userText: string,
  systemText: string,
  config: AIProviderConfig | null,
  signal?: AbortSignal,
): Promise<string> {
  return runPrompt(
    meta,
    [
      { role: 'system', content: systemText || getEffectiveSystemPrompt() },
      { role: 'user', content: userText },
    ],
    config,
    signal,
  )
}

/* ---------------- US-802 五句话梗概 ---------------- */

/** 生成五句话梗概原始文本；返回格式要求「开端：…」五段 */
export async function generateSynopsisText(
  input: SynopsisInput,
  config: AIProviderConfig | null,
  signal?: AbortSignal,
  template?: string,
): Promise<string> {
  return runPrompt(
    { projectId: input.projectId, kind: 'synopsis', inputSummary: input.premise },
    withSystem(buildSynopsisPrompt(input, template)),
    config,
    signal,
  )
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

/** 生成人物小传文本（富文本落库前由 UI 转 <p> 包裹） */
export async function generateCharacterBioText(
  character: Character,
  input: BioInput,
  config: AIProviderConfig | null,
  signal?: AbortSignal,
  template?: string,
): Promise<string> {
  return runPrompt(
    { projectId: character.projectId, kind: 'characterBio', inputSummary: character.name },
    withSystem(buildBioPrompt(character, input, template)),
    config,
    signal,
  )
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
  input: RelationshipInput,
  config: AIProviderConfig | null,
  signal?: AbortSignal,
  template?: string,
): Promise<RelationshipSuggestion[]> {
  const pool = characters.slice(0, 30)
  const text = await runPrompt(
    { projectId: input.projectId ?? characters[0]?.projectId, kind: 'relationship', inputSummary: input.focusName },
    withSystem(buildRelationshipPrompt(characters, input, template)),
    config,
    signal,
  )
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

/** 润色小说片段：只输出润色后正文 */
export async function polishText(
  input: PolishInput,
  config: AIProviderConfig | null,
  signal?: AbortSignal,
  template?: string,
): Promise<string> {
  return runPrompt(
    { projectId: input.projectId, kind: 'polish', inputSummary: input.context },
    withSystem(buildPolishPrompt(input, template)),
    config,
    signal,
  )
}

/* ---------------- 章节正文生成 ---------------- */

/**
 * 生成章节正文：只输出正文纯文本（UI 用 textToHtmlParagraphs 转段落后追加/替换正文）。
 * 上下文（细纲、出场人物、上一章结尾、项目速览）由调用方组装后传入。
 */
export async function generateChapterContent(
  input: ChapterContentInput,
  config: AIProviderConfig | null,
  signal?: AbortSignal,
  template?: string,
): Promise<string> {
  return runPrompt(
    {
      projectId: input.projectId,
      kind: 'chapterContent',
      inputSummary: input.chapterTitle || input.brief.slice(0, 30),
    },
    withSystem(buildChapterContentPrompt(input, template)),
    config,
    signal,
  )
}

/* ---------------- US-805 一致性检查（LLM 语义增强） ---------------- */

const AI_LEVELS: IssueLevel[] = ['error', 'warn', 'info']
const AI_CATEGORIES = ['人物', '关系', '地点', '事件', '伏笔', '章节', '大纲', '综合'] as const

/** 深度一致性检查：LLM 语义推断（如“人物A在后续章节已死却再次出场”），与规则引擎互补 */
export async function runDeepConsistencyCheck(
  input: DeepCheckInput,
  config: AIProviderConfig | null,
  signal?: AbortSignal,
  template?: string,
): Promise<ConsistencyIssue[]> {
  const text = await runPrompt(
    { projectId: input.project?.id, kind: 'consistency', inputSummary: input.project?.name },
    withSystem(buildDeepConsistencyPrompt(input, template)),
    config,
    signal,
  )
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

/* ---------------- 一句话生成角色卡 ---------------- */

export interface CharacterCardDraft {
  name: string
  aliases: string[]
  importance: 'protagonist' | 'major' | 'supporting' | 'minor'
  gender?: string
  age?: string
  appearance?: string
  personalityTags: string[]
  desire?: string
  flaw?: string
  background?: string
  abilities: string[]
  notes?: string
  /** 当前状态一句话（落库为 currentState.state） */
  currentState?: string
}

/** 依据作者的一句话设定生成完整角色卡（结构化字段，UI 可再编辑后落库） */
export async function generateCharacterCard(
  input: CharacterCardInput,
  config: AIProviderConfig | null,
  signal?: AbortSignal,
  template?: string,
): Promise<CharacterCardDraft> {
  const text = await runPrompt(
    { projectId: input.projectId, kind: 'characterCard', inputSummary: input.prompt },
    withSystem(buildCharacterCardPrompt(input, template)),
    config,
    signal,
  )
  return parseCharacterCard(text)
}

/** 解析角色卡 JSON（容忍 ```json 包裹与前后说明文字，字符串/数组互相容错） */
export function parseCharacterCard(text: string): CharacterCardDraft {
  const json =
    text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(json) as Record<string, unknown>
  } catch {
    throw new Error('AI 返回内容无法解析为角色卡，请调整描述后重试')
  }
  const asText = (v: unknown): string => {
    if (typeof v === 'string') return v.trim()
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join('、')
    return ''
  }
  const asList = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
    if (typeof v === 'string') {
      return v
        .split(/[,，、\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
    }
    return []
  }
  const name = asText(obj.name)
  if (!name) throw new Error('AI 未给出人物姓名，请补充描述后重试')
  const rawImportance = asText(obj.importance)
  const importance = (['protagonist', 'major', 'supporting', 'minor'] as const).includes(
    rawImportance as 'protagonist',
  )
    ? (rawImportance as CharacterCardDraft['importance'])
    : 'supporting'
  return {
    name,
    aliases: asList(obj.aliases),
    importance,
    gender: asText(obj.gender) || undefined,
    age: asText(obj.age) || undefined,
    appearance: asText(obj.appearance) || undefined,
    personalityTags: asList(obj.personalityTags),
    desire: asText(obj.desire) || undefined,
    flaw: asText(obj.flaw) || undefined,
    background: asText(obj.background) || undefined,
    abilities: asList(obj.abilities),
    notes: asText(obj.notes) || undefined,
    currentState: asText(obj.currentState) || undefined,
  }
}

/* ---------------- 体检报告 AI 解读（Sprint 10 扩展） ---------------- */

/** 对健康度报告做语义解读：总体诊断 + 优先行动建议 */
export async function explainHealthReport(
  input: { projectName: string; report: HealthReport; projectId?: string },
  config: AIProviderConfig | null,
  signal?: AbortSignal,
  template?: string,
): Promise<string> {
  return runPrompt(
    { projectId: input.projectId, kind: 'health', inputSummary: input.projectName },
    withSystem(buildHealthExplainPrompt(input, template)),
    config,
    signal,
  )
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
