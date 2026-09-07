import type { ConsistencyIssue } from '@/services/consistency'
import type { ArcStage, Character } from '@/types/character'
import type { Chapter } from '@/types/chapter'
import type { Foreshadowing } from '@/types/meta'
import type { Location, StoryEvent } from '@/types/world'

/**
 * 故事健康度报告（Sprint 10 新增用户故事，设计文档 §2.11）。
 * 纯函数：基于已有设定计算五个维度得分与总分，并给出可执行建议。
 * 维度权重：伏笔回收 25 / 人物弧光 25 / 时间线连贯 20 / 一致性 20 / 章节进度 10。
 */
export interface HealthDimension {
  key: 'foreshadowing' | 'character' | 'timeline' | 'consistency' | 'chapter'
  label: string
  /** 0-100 */
  score: number
  weight: number
  summary: string
  tips: string[]
}

export interface HealthReport {
  /** 加权总分 0-100 */
  total: number
  levelKey: 'excellent' | 'good' | 'fair' | 'poor'
  level: string
  dimensions: HealthDimension[]
  /** 汇总建议（各维度 tips 去重后截断） */
  suggestions: string[]
}

export interface HealthInput {
  characters: Character[]
  arcs: ArcStage[]
  foreshadowings: Foreshadowing[]
  events: StoryEvent[]
  chapters: Chapter[]
  locations: Location[]
  /** 规则引擎（+AI）已发现的问题，用于一致性维度 */
  issues: ConsistencyIssue[]
  /** 项目默认每章目标字数 */
  defaultTargetWords?: number
}

const LEVELS: Record<HealthReport['levelKey'], string> = {
  excellent: '优秀',
  good: '良好',
  fair: '待改进',
  poor: '需大修',
}

const DAY = 24 * 60 * 60 * 1000

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

function levelOf(total: number): HealthReport['levelKey'] {
  if (total >= 85) return 'excellent'
  if (total >= 70) return 'good'
  if (total >= 50) return 'fair'
  return 'poor'
}

/* ---------------- 各维度 ---------------- */

/** 伏笔回收：回收率为主，缺回收锚点/长期未回收扣分 */
function foreshadowingDimension(list: Foreshadowing[]): HealthDimension {
  const active = list.filter((f) => f.status === 'active')
  const resolved = list.filter((f) => f.status === 'resolved')
  const total = active.length + resolved.length
  if (total === 0) {
    return {
      key: 'foreshadowing',
      label: '伏笔回收',
      score: 60,
      weight: 25,
      summary: '尚未登记伏笔',
      tips: ['在「伏笔管理」登记伏笔，或在大纲节点标记埋设/回收，形成闭环。'],
    }
  }
  const noAnchor = active.filter((f) => !f.expectedResolveEventId && !f.expectedResolveAt)
  const stale = active.filter((f) => Date.now() - new Date(f.createdAt).getTime() > 30 * DAY)
  const score = clamp((resolved.length / total) * 100 - Math.min(30, noAnchor.length * 5) - Math.min(30, stale.length * 3))
  const tips: string[] = []
  if (noAnchor.length) tips.push(`${noAnchor.length} 条活跃伏笔没有预期回收锚点，建议指定回收事件。`)
  if (stale.length) tips.push(`${stale.length} 条伏笔已活跃超过 30 天，考虑回收或标记废弃。`)
  if (!tips.length && active.length) tips.push('保持现状：定期在大纲中确认伏笔回收节点。')
  return {
    key: 'foreshadowing',
    label: '伏笔回收',
    score,
    weight: 25,
    summary: `已回收 ${resolved.length} / ${total}（活跃 ${active.length}）`,
    tips,
  }
}

/** 人物弧光：主要人物的欲望/缺陷/弧光阶段/当前状态齐备度 */
function characterDimension(characters: Character[], arcs: ArcStage[]): HealthDimension {
  const main = characters.filter((c) => c.importance === 'protagonist' || c.importance === 'major')
  if (main.length === 0) {
    return {
      key: 'character',
      label: '人物弧光',
      score: 60,
      weight: 25,
      summary: '尚未设定主要人物',
      tips: ['先创建主角与重要配角，并填写核心欲望与致命缺陷。'],
    }
  }
  const missing: string[] = []
  let sum = 0
  for (const c of main) {
    let s = 0
    if (c.desire?.trim()) s += 25
    else missing.push(`${c.name} 缺核心欲望`)
    if (c.flaw?.trim()) s += 25
    else missing.push(`${c.name} 缺致命缺陷`)
    if (arcs.some((a) => a.characterId === c.id)) s += 25
    else missing.push(`${c.name} 缺弧光阶段`)
    if (c.currentState?.state?.trim()) s += 25
    else missing.push(`${c.name} 缺当前状态`)
    sum += s
  }
  return {
    key: 'character',
    label: '人物弧光',
    score: clamp(sum / main.length),
    weight: 25,
    summary: `主要人物 ${main.length} 位，平均完成度 ${Math.round(sum / main.length)}%`,
    tips: missing.slice(0, 5),
  }
}

/** 时间线连贯：事件参与者/地点/明确时间齐备度 */
function timelineDimension(events: StoryEvent[]): HealthDimension {
  if (events.length === 0) {
    return {
      key: 'timeline',
      label: '时间线连贯',
      score: 50,
      weight: 20,
      summary: '尚无事件',
      tips: ['在「事件」中补充关键事件，时间线才能发挥校验作用。'],
    }
  }
  const withParticipants = events.filter((e) => e.participantIds.length > 0).length
  const withLocation = events.filter((e) => e.locationId).length
  const explicit = events.filter((e) => e.time.type !== 'fuzzy' && e.time.type !== 'relative').length
  const pct = (n: number) => (n / events.length) * 100
  const score = clamp((pct(withParticipants) + pct(withLocation) + pct(explicit)) / 3)
  const tips: string[] = []
  if (events.length - withParticipants > 0) tips.push(`${events.length - withParticipants} 个事件没有参与者，建议补全。`)
  if (events.length - withLocation > 0) tips.push(`${events.length - withLocation} 个事件没有地点，场景感会偏弱。`)
  if (events.length - explicit > 0) tips.push(`${events.length - explicit} 个事件时间为模糊表达，可用排序功能确定相对次序。`)
  return {
    key: 'timeline',
    label: '时间线连贯',
    score,
    weight: 20,
    summary: `事件 ${events.length} 个（参与者 ${withParticipants} / 地点 ${withLocation} / 明确时间 ${explicit}）`,
    tips: tips.slice(0, 3),
  }
}

/** 一致性：严重问题扣分（问题来自规则引擎与 AI 语义检查） */
function consistencyDimension(issues: ConsistencyIssue[]): HealthDimension {
  const errors = issues.filter((i) => i.level === 'error').length
  const warns = issues.filter((i) => i.level === 'warn').length
  const infos = issues.filter((i) => i.level === 'info').length
  const tips = issues
    .filter((i) => i.level === 'error')
    .slice(0, 3)
    .map((i) => `【严重】${i.title}`)
  if (issues.length === 0) {
    tips.push('规则引擎与 AI 语义检查均未发现问题。')
  } else if (!tips.length) {
    tips.push('暂无严重问题，可处理提示级建议后再次体检。')
  }
  tips.push('完整问题清单见「一致性检查」。')
  return {
    key: 'consistency',
    label: '设定一致性',
    score: clamp(100 - errors * 8 - warns * 3 - infos * 1),
    weight: 20,
    summary: `严重 ${errors} 项 / 提示 ${warns} 项 / 提醒 ${infos} 项`,
    tips,
  }
}

/** 章节进度：完成率 + 平均字数达标率 */
function chapterDimension(chapters: Chapter[], defaultTargetWords = 2000): HealthDimension {
  if (chapters.length === 0) {
    return {
      key: 'chapter',
      label: '章节进度',
      score: 40,
      weight: 10,
      summary: '尚无章节',
      tips: ['开始写作并标记章节状态，进度才会纳入体检。'],
    }
  }
  const done = chapters.filter((c) => c.status === 'done' || c.status === 'revised').length
  const avgWords = chapters.reduce((s, c) => s + c.wordCount, 0) / chapters.length
  const avgTarget = chapters.reduce((s, c) => s + (c.targetWords ?? defaultTargetWords), 0) / chapters.length
  const doneRate = done / chapters.length
  const wordRate = Math.min(1, avgWords / (avgTarget || defaultTargetWords))
  const tips: string[] = []
  if (doneRate < 0.5) tips.push(`已完成（含已修改）章节 ${done}/${chapters.length}，可先补齐前几章。`)
  if (wordRate < 0.8) tips.push(`平均 ${Math.round(avgWords)} 字 / 目标 ${Math.round(avgTarget)} 字，建议扩充场景与细节。`)
  if (!tips.length) tips.push('章节进度良好，保持更新节奏。')
  return {
    key: 'chapter',
    label: '章节进度',
    score: clamp(doneRate * 60 + wordRate * 40),
    weight: 10,
    summary: `完成 ${done}/${chapters.length} 章 · 均 ${Math.round(avgWords)} 字（目标 ${Math.round(avgTarget)}）`,
    tips,
  }
}

/** 生成健康度报告 */
export function buildHealthReport(input: HealthInput): HealthReport {
  const dimensions: HealthDimension[] = [
    foreshadowingDimension(input.foreshadowings),
    characterDimension(input.characters, input.arcs),
    timelineDimension(input.events),
    consistencyDimension(input.issues),
    chapterDimension(input.chapters, input.defaultTargetWords),
  ]
  const total = clamp(dimensions.reduce((s, d) => s + (d.score * d.weight) / 100, 0))
  const levelKey = levelOf(total)
  const suggestions: string[] = []
  for (const d of [...dimensions].sort((a, b) => a.score - b.score)) {
    for (const t of d.tips) {
      if (!suggestions.includes(t)) suggestions.push(t)
    }
  }
  return { total, levelKey, level: LEVELS[levelKey], dimensions, suggestions: suggestions.slice(0, 8) }
}

/** 维度得分 → 进度条颜色（Tailwind 类） */
export function scoreColor(score: number): string {
  if (score >= 85) return 'bg-emerald-500'
  if (score >= 70) return 'bg-sky-500'
  if (score >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

export function scoreBadgeColor(score: number): 'green' | 'sky' | 'amber' | 'red' {
  if (score >= 85) return 'green'
  if (score >= 70) return 'sky'
  if (score >= 50) return 'amber'
  return 'red'
}
