/**
 * AI 提示词模板层（统一复用）：
 * - 所有 AI 提示词（系统提示 + 各生成任务的用户提示）以「模板文本」注册于此；
 *   模板支持 {{变量}} 插值与 {{?变量}}…{{/变量}} 条件块（变量为空时整块移除）。
 * - 渲染统一走 renderPrompt()，实际生效内容 = 用户覆盖/自定义模板 或 内置默认；
 *   预览与实际发送因此永远一致（所见即所发）。
 * - 覆盖与自定义模板持久化在 prompt_templates 表（projectId 为空 = 全局），
 *   由 usePromptStore 在启动时加载到内存，渲染为同步读，不改动各调用点签名。
 */
import { create } from 'zustand'
import { db } from '@/db/database'
import type { PromptTemplate } from '@/types/meta'
import { isoNow, uid } from '@/utils/common'

/** 生成任务类型（与 AIRequestKind 的前 7 项一致） */
export type TaskKind =
  | 'synopsis'
  | 'characterBio'
  | 'relationship'
  | 'polish'
  | 'consistency'
  | 'health'
  | 'characterCard'

/** 可被用户管理的提示词键 */
export type PromptTemplateKey = 'system' | TaskKind

export const TASK_ORDER: TaskKind[] = ['synopsis', 'characterBio', 'relationship', 'polish', 'consistency', 'health', 'characterCard']

export const TASK_LABELS: Record<TaskKind, string> = {
  synopsis: '五句话梗概',
  characterBio: '人物小传',
  relationship: '关系建议',
  polish: '润色选中文本',
  consistency: '一致性深度检查',
  health: '体检报告解读',
  characterCard: '一句话角色卡',
}

export interface TemplateVarInfo {
  name: string
  desc: string
}

/* ---------------- 内置默认模板文本（与历史提示构建输出等价） ---------------- */

export const DEFAULT_PROMPT_CONTENT: Record<PromptTemplateKey, string> = {
  /* 系统提示（所有任务共用，可在管理页覆盖） */
  system: `你是资深中文小说创作助手，熟悉类型小说结构与人物塑造。
要求：输出简体中文；内容具体、可执行、避免空话套话；不要输出解释性前言、不要 Markdown 标题符号，除非任务明确要求。`,

  /* US-802 五句话梗概 */
  synopsis: `请为下面这部小说创作“五句话梗概”（三幕式结构）。
输出格式严格要求：
{{partsLine}}

题材/类型：{{genre}}
核心想法：{{premise}}
{{?characters}}主要人物：{{characters}}{{/characters}}
{{?style}}风格要求：{{style}}{{/style}}
{{?projectContext}}
【已有设定参考】
{{projectContext}}{{/projectContext}}

每句控制在 30-60 字，共五句，直接输出。`,

  /* US-803 人物小传 */
  characterBio: `请为下面这个小说人物撰写人物小传（约 {{words}} 字，可分段）。
要求：交代出身与关键经历，点明核心欲望与致命缺陷，语言贴合其身份；只输出小传正文。

{{characterBrief}}
{{?projectContext}}
【项目世界观参考】
{{projectContext}}{{/projectContext}}
{{?extra}}
补充要求：{{extra}}{{/extra}}`,

  /* US-804 人物关系建议 */
  relationship: `下面是小说的人物列表，请提出 {{max}} 条值得建立/强化的关系建议（不要重复已有常识性关系）。
只输出 JSON 数组（不要任何额外文字、不要代码块说明），每项格式：
{"source":"人物A姓名","target":"人物B姓名","type":"关系类型","strength":强度数字,"reason":"一句话理由"}
关系类型限定为：亲情/友情/爱情/敌对/师徒/合作/利用/暗恋/仇恨/其他 之一；
strength 取 -100 到 100 的整数（正数为正面关系，负数为负面关系）。

【人物列表】
{{pool}}
{{?focusName}}
优先围绕人物：{{focusName}}{{/focusName}}
{{?projectContext}}
【项目世界观参考】
{{projectContext}}{{/projectContext}}
{{?extra}}
补充要求：{{extra}}{{/extra}}`,

  /* US-806 润色选中文本 */
  polish: `请润色下面的小说片段。
要求：保持原意、人物口吻、叙事视角与段落结构；表达更生动流畅、用词更精炼，避免重复与空话；不新增情节、不改变人称与时间线。
直接输出润色后的正文，不要输出任何解释或前后缀文字。

【待润色片段】
{{text}}
{{?context}}
【所在章节】{{context}}{{/context}}
{{?style}}
【润色方向】{{style}}{{/style}}`,

  /* US-805 一致性深度检查 */
  consistency: `你是资深中文小说审稿编辑。请对《{{projectName}}》进行语义一致性检查（基于设定数据与正文片段做推断），
找出需要作者留意的深层次矛盾或遗漏：如“人物已死/重伤却仍在后续出场”“时间线前后矛盾”“行为与人设不符”“地点空间矛盾”“伏笔埋设与回收矛盾”“章节间叙述断裂”等。
只输出 JSON 数组（不要代码块、不要任何解释文字），每项格式：
{"level":"error|warn|info","category":"人物|关系|地点|事件|伏笔|章节|大纲|综合","title":"一句话标题","detail":"说明矛盾所在与建议（80 字内）"}
要求：不要重复规则引擎已列出的问题；若没有额外发现，返回空数组 []。

【人物】
{{charactersText}}

【章节正文片段】
{{chaptersText}}

【伏笔】
{{foreshadowingsText}}

【设定规模】地点 {{locationCount}} 个，事件 {{eventCount}} 个，细纲节点 {{outlineCount}} 个。

【规则引擎已发现（勿重复）】
{{existingIssuesText}}`,

  /* 一句话生成角色卡 */
  characterCard: `请根据作者的一句话设定，生成一份完整、可直接投入创作的小说角色卡。
只输出 JSON 对象（不要代码块、不要任何解释文字），字段与含义如下：
{
  "name": "姓名",
  "aliases": ["别名/称号，可为空数组"],
  "importance": "protagonist | major | supporting | minor 之一",
  "gender": "性别（可空字符串）",
  "age": "年龄（可模糊，如 外表18岁、实际300岁）",
  "appearance": "外貌与气质描写，80 字内",
  "personalityTags": ["3-5 个性格标签"],
  "desire": "核心欲望，一句话",
  "flaw": "致命缺陷，一句话",
  "background": "背景故事，150-250 字，段落之间用 \\n 分隔",
  "abilities": ["能力/技能/专长"],
  "notes": "给作者的备注：戏份定位与可能的弧光方向（可空）",
  "currentState": "当前状态，一句话，如 初入宗门的外门弟子"
}

要求：与设定自洽；欲望与缺陷形成张力；避免脸谱化与空洞形容词；全部简体中文。

【作者的一句话设定】
{{prompt}}
{{?genre}}
【题材/类型】{{genre}}{{/genre}}
{{?worldContext}}
【世界观参考】
{{worldContext}}{{/worldContext}}
{{?existingNames}}
【已有人物（不要重名，可与之建立关联）】{{existingNames}}{{/existingNames}}
{{?extra}}
【补充要求】{{extra}}{{/extra}}`,

  /* 体检报告 AI 解读 */
  health: `下面是小说《{{projectName}}》的故事体检评分，请给出编辑视角的解读与行动建议。
要求：先一句话总体诊断；再指出最该优先处理的 2-3 件事；最后给出可执行的下一步（结合下面维度信息）。
语气务实具体，避免空话；控制在 400 字以内，可分 2-3 段，不要 Markdown 标题符号。

【总分】{{total}}/100（{{level}}）
【维度】
{{dimensionLines}}
{{?suggestionLines}}
【系统建议】
{{suggestionLines}}{{/suggestionLines}}`,
}

/* ---------------- 注册表（供管理页展示与变量说明） ---------------- */

export interface PromptTemplateDef {
  key: PromptTemplateKey
  /** 管理页展示名 */
  label: string
  /** 管理页说明 */
  description: string
  category: 'system' | 'task'
  variables: TemplateVarInfo[]
}

export const PROMPT_TEMPLATE_DEFS: Record<PromptTemplateKey, PromptTemplateDef> = {
  system: {
    key: 'system',
    label: '系统提示（通用）',
    description: '附加在所有请求前的基础角色与输出要求。修改后对所有 AI 生成立即生效。',
    category: 'system',
    variables: [],
  },
  synopsis: {
    key: 'synopsis',
    label: TASK_LABELS.synopsis,
    description: '生成「开端/发展/高潮/转折/结局」五句话梗概的用户提示。',
    category: 'task',
    variables: [
      { name: 'genre', desc: '题材/类型' },
      { name: 'premise', desc: '核心想法/卖点' },
      { name: 'characters', desc: '主要人物（可选）' },
      { name: 'style', desc: '风格要求（可选）' },
      { name: 'projectContext', desc: '项目已有设定参考（可选，自动截取 3000 字）' },
      { name: 'partsLine', desc: '输出格式的五句名称行（自动生成）' },
    ],
  },
  characterBio: {
    key: 'characterBio',
    label: TASK_LABELS.characterBio,
    description: '为单个小说人物撰写小传的用户提示。',
    category: 'task',
    variables: [
      { name: 'words', desc: '期望字数' },
      { name: 'characterBrief', desc: '人物设定摘要（自动生成）' },
      { name: 'projectContext', desc: '项目世界观参考（可选）' },
      { name: 'extra', desc: '补充要求（可选）' },
    ],
  },
  relationship: {
    key: 'relationship',
    label: TASK_LABELS.relationship,
    description: '基于人物列表提出可建立/强化关系的候选（JSON）。',
    category: 'task',
    variables: [
      { name: 'max', desc: '建议条数' },
      { name: 'pool', desc: '人物编号列表（自动生成，前 30 人）' },
      { name: 'focusName', desc: '聚焦人物（可选）' },
      { name: 'projectContext', desc: '项目世界观参考（可选）' },
      { name: 'extra', desc: '补充要求（可选）' },
    ],
  },
  polish: {
    key: 'polish',
    label: TASK_LABELS.polish,
    description: '润色选中正文片段的用户提示（要求保持原意与视角）。',
    category: 'task',
    variables: [
      { name: 'text', desc: '待润色片段（自动截取 3000 字）' },
      { name: 'context', desc: '所在章节等上下文（可选）' },
      { name: 'style', desc: '润色方向（可选）' },
    ],
  },
  consistency: {
    key: 'consistency',
    label: TASK_LABELS.consistency,
    description: '基于设定与正文做语义级一致性检查（输出问题 JSON）。',
    category: 'task',
    variables: [
      { name: 'projectName', desc: '项目名' },
      { name: 'charactersText', desc: '人物清单（自动生成）' },
      { name: 'chaptersText', desc: '章节正文片段（自动生成）' },
      { name: 'foreshadowingsText', desc: '伏笔清单（自动生成）' },
      { name: 'locationCount', desc: '地点数量' },
      { name: 'eventCount', desc: '事件数量' },
      { name: 'outlineCount', desc: '大纲节点数量' },
      { name: 'existingIssuesText', desc: '规则引擎已发现问题（自动生成）' },
    ],
  },
  characterCard: {
    key: 'characterCard',
    label: TASK_LABELS.characterCard,
    description: '根据一句话设定生成结构化角色卡（输出 JSON）。',
    category: 'task',
    variables: [
      { name: 'prompt', desc: '作者的一句话设定' },
      { name: 'genre', desc: '题材/类型（可选）' },
      { name: 'worldContext', desc: '世界观参考（可选，自动截取 1500 字）' },
      { name: 'existingNames', desc: '已有人物名（可选）' },
      { name: 'extra', desc: '补充要求（可选）' },
    ],
  },
  health: {
    key: 'health',
    label: TASK_LABELS.health,
    description: '对故事体检报告做编辑视角解读的用户提示。',
    category: 'task',
    variables: [
      { name: 'projectName', desc: '作品名' },
      { name: 'total', desc: '总分' },
      { name: 'level', desc: '健康等级' },
      { name: 'dimensionLines', desc: '各维度得分行（自动生成）' },
      { name: 'suggestionLines', desc: '系统建议行（自动生成）' },
    ],
  },
}

/** 任务键列表（用于自定义模板的「作用任务」下拉） */
export const TASK_KEYS = TASK_ORDER

/* ---------------- 渲染器 ---------------- */

function renderPrompt(content: string, vars: Record<string, string>): string {
  const hasValue = (name: string): boolean => {
    const v = vars[name]
    return v != null && String(v).trim() !== ''
  }
  let out = content
  // 1) 展开条件块 {{?name}}…{{/name}}：变量为空则整块移除（支持简单重复展开）
  for (let guard = 0; guard < 10; guard += 1) {
    const m = out.match(/\{\{\?([A-Za-z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/)
    if (!m) break
    out = out.replace(m[0], hasValue(m[1]) ? m[2] : '')
  }
  // 2) 替换普通变量（未提供的占位符原样保留，避免用户误删变量后模板失效）
  out = out.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (raw, name: string) => {
    const v = vars[name]
    return v != null ? String(v) : raw
  })
  // 3) 清理条件块移除后留下的多余空行
  return out
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

/** 由任务键渲染默认/覆盖模板（供 prompts.ts 各 build 函数使用） */
export function renderByKind(kind: PromptTemplateKey, vars: Record<string, string>): string {
  const content = usePromptStore.getState().getContent(kind)
  return renderPrompt(content, vars)
}

/** 渲染自定义模板（供生成入口选中自定义模板时使用） */
export function renderCustom(content: string, vars: Record<string, string>): string {
  return renderPrompt(content, vars)
}

/* ---------------- Store（内存 + prompt_templates 持久化，projectId 为空 = 全局） ---------------- */

export const GLOBAL_PROJECT_ID = ''

export interface CustomPromptTemplate {
  id: string
  name: string
  /** 作用任务（渲染时使用该任务的变量集） */
  kind: TaskKind
  content: string
  createdAt: string
  updatedAt: string
}

interface PromptStoreState {
  hydrated: boolean
  /** 用户覆盖的内置模板（key → content） */
  overrides: Partial<Record<PromptTemplateKey, string>>
  /** 用户自定义模板 */
  customs: CustomPromptTemplate[]
  /** 启动时从 IndexedDB 加载全部全局模板 */
  load: () => Promise<void>
  /** 当前生效内容（覆盖 ?? 内置默认） */
  getContent: (key: PromptTemplateKey) => string
  /** 保存内置模板覆盖（写库 + 内存） */
  saveOverride: (key: PromptTemplateKey, content: string) => Promise<void>
  /** 恢复内置默认（删除覆盖记录） */
  restoreOverride: (key: PromptTemplateKey) => Promise<void>
  addCustom: (input: { name: string; kind: TaskKind; content: string }) => Promise<CustomPromptTemplate>
  updateCustom: (id: string, patch: { name?: string; content?: string }) => Promise<void>
  removeCustom: (id: string) => Promise<void>
}

function toRow(id: string, name: string, category: string, content: string, createdAt: string): PromptTemplate {
  return {
    id,
    projectId: GLOBAL_PROJECT_ID,
    name,
    category,
    content,
    variables: [],
    createdAt,
    updatedAt: isoNow(),
  }
}

export const usePromptStore = create<PromptStoreState>((set, get) => ({
  hydrated: false,
  overrides: {},
  customs: [],

  async load() {
    if (get().hydrated) return
    const rows = await db.prompt_templates.where('projectId').equals(GLOBAL_PROJECT_ID).toArray()
    const overrides: PromptStoreState['overrides'] = {}
    const customs: CustomPromptTemplate[] = []
    for (const row of rows) {
      if (row.id.startsWith('custom:')) {
        const kind = (TASK_KEYS as readonly string[]).includes(row.category) ? (row.category as TaskKind) : 'synopsis'
        customs.push({
          id: row.id,
          name: row.name,
          kind,
          content: row.content,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })
      } else if (Object.prototype.hasOwnProperty.call(DEFAULT_PROMPT_CONTENT, row.id)) {
        overrides[row.id as PromptTemplateKey] = row.content
      }
    }
    set({ overrides, customs, hydrated: true })
  },

  getContent(key) {
    const overridden = get().overrides[key]
    return overridden != null ? overridden : DEFAULT_PROMPT_CONTENT[key]
  },

  async saveOverride(key, content) {
    const def = PROMPT_TEMPLATE_DEFS[key]
    const now = isoNow()
    const exist = await db.prompt_templates.get(key)
    const row = toRow(key, def.label, def.category, content, exist?.createdAt ?? now)
    row.updatedAt = now
    await db.prompt_templates.put(row)
    set((s) => ({ overrides: { ...s.overrides, [key]: content } }))
  },

  async restoreOverride(key) {
    await db.prompt_templates.delete(key)
    set((s) => {
      const next = { ...s.overrides }
      delete next[key]
      return { overrides: next }
    })
  },

  async addCustom(input) {
    const now = isoNow()
    const id = `custom:${uid()}`
    const row = toRow(id, input.name, input.kind, input.content, now)
    await db.prompt_templates.put(row)
    const item: CustomPromptTemplate = {
      id,
      name: input.name,
      kind: input.kind,
      content: input.content,
      createdAt: now,
      updatedAt: now,
    }
    set((s) => ({ customs: [...s.customs, item] }))
    return item
  },

  async updateCustom(id, patch) {
    const now = isoNow()
    const exist = await db.prompt_templates.get(id)
    if (!exist) return
    const merged = { ...exist, ...patch, updatedAt: now } as PromptTemplate
    await db.prompt_templates.put(merged)
    set((s) => ({
      customs: s.customs.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: now } : c)),
    }))
  },

  async removeCustom(id) {
    await db.prompt_templates.delete(id)
    set((s) => ({ customs: s.customs.filter((c) => c.id !== id) }))
  },
}))

/** 当前生效的系统提示（供 withSystem / 自定义请求默认使用） */
export function getEffectiveSystemPrompt(): string {
  return usePromptStore.getState().getContent('system')
}

/* ---------------- 供生成入口选择模板 ---------------- */

/** 内置「默认模板」标记值：代表任务键对应的默认/覆盖模板 */
export const TEMPLATE_VALUE_DEFAULT = ''

/** 由自定义模板 id 取内容（未找到返回 undefined，调用方回退默认） */
export function customContentById(id: string | undefined): string | undefined {
  if (!id) return undefined
  return usePromptStore.getState().customs.find((c) => c.id === id)?.content
}
