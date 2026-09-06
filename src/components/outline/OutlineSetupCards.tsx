import { useEffect, useState } from 'react'
import { CheckCircle2, Compass, Quote, Sparkles } from 'lucide-react'
import { Field, Textarea, cn } from '@/components/ui'
import { outlineRepo } from '@/db/repositories'
import { SYNOPSIS_PARTS } from '@/services/outline'
import type { OutlineNode } from '@/types/outline'

/* ---------------- 故事核数据编解码（content 存 JSON，语义清晰便于导出/导入） ---------------- */

/** 经典五问写作引导（设计文档 §3.1，可跳过自由填写） */
export const STORY_CORE_GUIDES = [
  { key: 'hero', label: '主角是谁', placeholder: '什么样的人？有什么渴望与恐惧？' },
  { key: 'want', label: '他想要什么', placeholder: '表层目标与深层渴望……' },
  { key: 'obstacle', label: '阻碍是什么', placeholder: '反派、环境或自身的阻碍……' },
  { key: 'stakes', label: '代价 / 赌注', placeholder: '如果失败会失去什么？' },
  { key: 'change', label: '结局与变化', placeholder: '故事结束时，他成为怎样的人？' },
] as const

export interface StoryCoreData {
  conflict: string
  question: string
  guideAnswers: Record<string, string>
}

export function parseStoryCore(node?: OutlineNode): StoryCoreData {
  const empty: StoryCoreData = { conflict: '', question: '', guideAnswers: {} }
  if (!node?.content) return empty
  try {
    const obj = JSON.parse(node.content) as Partial<StoryCoreData>
    return {
      conflict: obj.conflict ?? '',
      question: obj.question ?? '',
      guideAnswers: obj.guideAnswers ?? {},
    }
  } catch {
    return empty
  }
}

/** 故事核卡片（US-201）：项目根结构之上的核心冲突 / 核心问题，含五问引导折叠 */
export function StoryCoreCard({
  node,
  onSaved,
}: {
  node?: OutlineNode
  onSaved: () => void
}) {
  const [data, setData] = useState<StoryCoreData>(() => parseStoryCore(node))
  const [showGuides, setShowGuides] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // 节点变更（首次加载完成 / 切换项目）时载入其内容
  useEffect(() => {
    setData(parseStoryCore(node))
  }, [node?.id, node?.content])

  function patch(p: Partial<StoryCoreData>) {
    setData((d) => ({ ...d, ...p }))
  }

  async function save() {
    if (!node) return
    setSaving(true)
    try {
      await outlineRepo.update(node.id, { content: JSON.stringify(data) })
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-violet-700">
          <Compass className="size-4" /> 故事核
          {node && <span className="font-normal normal-case tracking-normal text-stone-400">（故事根节点 · US-201）</span>}
        </h2>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="size-3.5" /> 已保存
            </span>
          )}
          <button
            onClick={() => void save()}
            disabled={!node || saving}
            className="cursor-pointer rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-800 disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>

      {!node ? (
        <p className="text-sm text-stone-400">初始化大纲结构中…</p>
      ) : (
        <div className="space-y-3">
          <Field label="核心冲突" hint="推动故事向前的最根本矛盾，例如：主角被困在无限轮回，唯一的出路是背叛挚友。">
            <Textarea
              rows={2}
              value={data.conflict}
              onChange={(e) => patch({ conflict: e.target.value })}
              placeholder="一句话写出这个故事的核心冲突……"
              className="bg-white"
            />
          </Field>
          <Field label="核心问题" hint="读者追到结尾想得到的那个问题的答案。">
            <Textarea
              rows={2}
              value={data.question}
              onChange={(e) => patch({ question: e.target.value })}
              placeholder="一句话写出故事要回答的核心问题……"
              className="bg-white"
            />
          </Field>

          <button
            onClick={() => setShowGuides((v) => !v)}
            className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800"
          >
            <Sparkles className="size-3.5" />
            {showGuides ? '收起写作引导' : '展开五问引导（可跳过，自由填写）'}
            <span className={cn('transition-transform', showGuides && 'rotate-180')}>▾</span>
          </button>
          {showGuides && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {STORY_CORE_GUIDES.map((g, i) => (
                <Field key={g.key} label={`${i + 1}. ${g.label}`}>
                  <Textarea
                    rows={1}
                    value={data.guideAnswers[g.key] ?? ''}
                    onChange={(e) =>
                      patch({ guideAnswers: { ...data.guideAnswers, [g.key]: e.target.value } })
                    }
                    placeholder={g.placeholder}
                    className="min-h-16 bg-white"
                  />
                </Field>
              ))}
              <p className="text-xs leading-relaxed text-stone-400 sm:col-span-2">
                回答五问可帮助理清人物与矛盾；答案仅作为你的创作笔记，保存于本节点。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------------- 五句话梗概（US-202） ---------------- */

/** 单句梗概行：独立本地状态，失焦自动保存到对应 synopsis_item 节点 */
function SynopsisLine({ node, index, onSaved }: { node: OutlineNode; index: number; onSaved: () => void }) {
  const [value, setValue] = useState(node.content ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      await outlineRepo.update(node.id, { content: value })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-start gap-2">
      <span className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
        {index}
      </span>
      <Textarea
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        placeholder={`${node.title ?? '句子'}：用一句话概括本阶段……`}
        className="min-h-16 resize-y"
      />
    </div>
  )
}

/** 五句话梗概卡片：对应三幕式结构，五句分别输入保存（每句独立 synopsis_item 节点） */
export function LoglineCard({ items }: { items: OutlineNode[] }) {
  const sorted = [...items].sort((a, b) => a.order - b.order)
  return (
    <div className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-sky-700">
        <Quote className="size-4" /> 五句话梗概
        <span className="font-normal normal-case tracking-normal text-stone-400">
          （开端 · 发展 · 高潮 · 转折 · 结局 · US-202）
        </span>
      </h2>
      <p className="mb-3 text-xs text-stone-400">
        与「{SYNOPSIS_PARTS.join(' · ')}」对应，输入后自动保存；后续可用它生成分幕。
      </p>
      {sorted.length === 0 ? (
        <p className="text-sm text-stone-400">初始化大纲结构中…</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((n, i) => (
            <SynopsisLine key={n.id} node={n} index={i + 1} onSaved={() => undefined} />
          ))}
        </div>
      )}
    </div>
  )
}

