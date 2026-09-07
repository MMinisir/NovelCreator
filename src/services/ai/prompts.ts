import { buildCharacterContextBrief } from './contextBuilder'
import type { ChatMessage } from './types'
import { SYNOPSIS_PARTS } from '@/services/outline'
import type { ConsistencyIssue } from '@/services/consistency'
import type { HealthReport } from '@/services/health'
import type { Character, Location, Project, StoryEvent, AIRequestKind } from '@/types'

/**
 * 提示构建层（与 tasks.ts 的「执行」分离）：
 * 每个 AI 任务的提示文本在此生成，供执行与「提示预览」复用同一份内容，
 * 保证预览所见即实际发送。
 */

export const SYSTEM_PROMPT = `你是资深中文小说创作助手，熟悉类型小说结构与人物塑造。
要求：输出简体中文；内容具体、可执行、避免空话套话；不要输出解释性前言、不要 Markdown 标题符号，除非任务明确要求。`

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

/** 组装最终请求消息（system + user） */
export function withSystem(userText: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
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

export function buildSynopsisPrompt(input: SynopsisInput): string {
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
  return lines.join('\n')
}

/* ---------------- US-803 人物小传 ---------------- */

export interface BioInput {
  /** 补充要求（如“突出悲剧色彩”） */
  extra?: string
  /** 期望字数 */
  words?: number
  projectContext?: string
}

export function buildBioPrompt(character: Character, input: BioInput): string {
  const words = input.words && input.words > 0 ? input.words : 400
  const lines = [
    `请为下面这个小说人物撰写人物小传（约 ${words} 字，可分段）。`,
    `要求：交代出身与关键经历，点明核心欲望与致命缺陷，语言贴合其身份；只输出小传正文。`,
    ``,
    buildCharacterContextBrief(character),
  ]
  if (input.projectContext?.trim()) lines.push(``, `【项目世界观参考】`, input.projectContext.trim().slice(0, 2000))
  if (input.extra?.trim()) lines.push(``, `补充要求：${input.extra.trim()}`)
  return lines.join('\n')
}

/* ---------------- US-804 人物关系建议 ---------------- */

export interface RelationshipInput {
  focusName?: string
  extra?: string
  projectContext?: string
  max?: number
  projectId?: string
}

export function buildRelationshipPrompt(characters: Character[], input: RelationshipInput): string {
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
    pool
      .map(
        (c, i) =>
          `${i + 1}. ${c.name}${c.importance ? `（${c.importance}）` : ''}${
            c.personalityTags.length ? `，性格：${c.personalityTags.join('、')}` : ''
          }`,
      )
      .join('\n'),
  ]
  if (input.focusName?.trim()) lines.push(``, `优先围绕人物：${input.focusName.trim()}`)
  if (input.projectContext?.trim()) lines.push(``, `【项目世界观参考】`, input.projectContext.trim().slice(0, 1500))
  if (input.extra?.trim()) lines.push(``, `补充要求：${input.extra.trim()}`)
  return lines.join('\n')
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

export function buildPolishPrompt(input: PolishInput): string {
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
  return lines.join('\n')
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

export function buildDeepConsistencyPrompt(input: DeepCheckInput): string {
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

  return [
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
  ].join('\n')
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

export function buildCharacterCardPrompt(input: CharacterCardInput): string {
  const lines = [
    `请根据作者的一句话设定，生成一份完整、可直接投入创作的小说角色卡。`,
    `只输出 JSON 对象（不要代码块、不要任何解释文字），字段与含义如下：`,
    `{`,
    `  "name": "姓名",`,
    `  "aliases": ["别名/称号，可为空数组"],`,
    `  "importance": "protagonist | major | supporting | minor 之一",`,
    `  "gender": "性别（可空字符串）",`,
    `  "age": "年龄（可模糊，如 外表18岁、实际300岁）",`,
    `  "appearance": "外貌与气质描写，80 字内",`,
    `  "personalityTags": ["3-5 个性格标签"],`,
    `  "desire": "核心欲望，一句话",`,
    `  "flaw": "致命缺陷，一句话",`,
    `  "background": "背景故事，150-250 字，段落之间用 \\n 分隔",`,
    `  "abilities": ["能力/技能/专长"],`,
    `  "notes": "给作者的备注：戏份定位与可能的弧光方向（可空）",`,
    `  "currentState": "当前状态，一句话，如 初入宗门的外门弟子"`,
    `}`,
    ``,
    `要求：与设定自洽；欲望与缺陷形成张力；避免脸谱化与空洞形容词；全部简体中文。`,
    ``,
    `【作者的一句话设定】`,
    input.prompt.trim(),
  ]
  if (input.genre?.trim()) lines.push(``, `【题材/类型】${input.genre.trim()}`)
  if (input.worldContext?.trim()) lines.push(``, `【世界观参考】`, input.worldContext.trim().slice(0, 1500))
  if (input.existingNames?.length)
    lines.push(``, `【已有人物（不要重名，可与之建立关联）】${input.existingNames.join('、')}`)
  if (input.extra?.trim()) lines.push(``, `【补充要求】${input.extra.trim()}`)
  return lines.join('\n')
}

/* ---------------- 体检报告 AI 解读 ---------------- */

export function buildHealthExplainPrompt(input: { projectName: string; report: HealthReport }): string {
  const { report } = input
  return [
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
  ].join('\n')
}
