import type { Character, Location, Project, StoryEvent } from '@/types'
import { timeLabel } from '@/utils/time'

/**
 * AI 上下文构建器（Sprint 5 预研）。
 * 纯函数：把项目本地数据压缩为结构化提示文本，不发起任何网络请求；
 * 后续 US-802（生成五句话）/ US-803（人物小传）/ US-804（关系建议）复用。
 */

export interface ProjectContextInput {
  project: Project
  characters: Character[]
  locations: Location[]
  events: StoryEvent[]
}

function stripHtml(html: string | undefined): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** 人物一句话简介（用于列表上下文） */
export function characterOneLine(c: Character): string {
  const parts: string[] = []
  if (c.gender) parts.push(c.gender)
  if (c.age) parts.push(`约${c.age}`)
  if (c.personalityTags.length) parts.push(c.personalityTags.slice(0, 4).join('、'))
  const head = [c.name, ...(c.aliases.length ? [`别名：${c.aliases.join('、')}`] : [])].join('（') + (c.aliases.length ? '）' : '')
  const desc = parts.join('，')
  return `${head}${desc ? `：${desc}` : ''}`
}

/** 构建项目基础上下文（作者用于写稿与校验的“世界观速览”） */
export function buildProjectContextBrief(input: ProjectContextInput): string {
  const { project, characters, locations, events } = input
  const lines: string[] = []
  lines.push(`【项目】《${project.name}》（类型：${project.genre || '未分类'}）`)
  if (project.tagline) lines.push(`【一句话简介】${project.tagline}`)
  if (project.worldSetting?.freeText.trim()) lines.push(`【世界观】${project.worldSetting.freeText.trim().replace(/\s+/g, ' ').slice(0, 400)}`)

  if (characters.length) {
    lines.push('【人物】')
    for (const c of characters) {
      const extras: string[] = []
      if (c.desire) extras.push(`欲望：${stripHtml(c.desire)}`)
      if (c.flaw) extras.push(`缺陷：${stripHtml(c.flaw)}`)
      if (c.currentState) extras.push(`当前状态：${timeLabel(c.currentState.time)}-${c.currentState.state}`)
      lines.push(`- ${characterOneLine(c)}${extras.length ? `（${extras.join('；')}）` : ''}`)
    }
  }
  if (locations.length) {
    lines.push('【地点】' + locations.map((l) => `${l.name}${l.type ? `（${l.type}）` : ''}${stripHtml(l.description) ? `：${stripHtml(l.description).slice(0, 60)}` : ''}`).join('；'))
  }
  if (events.length) {
    lines.push('【事件】')
    for (const e of events) {
      const t = timeLabel(e.time) || '时间未定'
      lines.push(`- ${t}：${e.name}${e.type ? `（${e.type}）` : ''}${e.outcome ? ` → ${e.outcome}` : ''}`)
    }
  }
  return lines.join('\n')
}

/** 构建单人物小传上下文（生成人物小传 / 一致性检查用） */
export function buildCharacterContextBrief(character: Character): string {
  const lines: string[] = [`人物：${character.name}`]
  if (character.aliases.length) lines.push(`别名：${character.aliases.join('、')}`)
  if (character.gender || character.age) lines.push(`性别/年龄：${character.gender ?? ''}${character.age ? ` 约${character.age}` : ''}`)
  if (character.importance) lines.push(`重要程度：${character.importance}`)
  if (character.personalityTags.length) lines.push(`性格标签：${character.personalityTags.join('、')}`)
  if (character.desire) lines.push(`核心欲望：${stripHtml(character.desire)}`)
  if (character.flaw) lines.push(`致命缺陷：${stripHtml(character.flaw)}`)
  if (character.background) lines.push(`背景故事：${stripHtml(character.background)}`)
  if (character.abilities.length) lines.push(`能力：${character.abilities.join('、')}`)
  if (character.currentState) lines.push(`当前状态：${timeLabel(character.currentState.time)}-${character.currentState.state}`)
  if (character.notes) lines.push(`备注：${stripHtml(character.notes)}`)
  return lines.join('\n')
}
