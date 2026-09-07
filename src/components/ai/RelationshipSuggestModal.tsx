import { useMemo, useState } from 'react'
import { ClipboardPaste, Eye, Sparkles } from 'lucide-react'
import { Badge, Button, Field, Input, Modal, Select, cn } from '@/components/ui'
import { useAITask } from '@/hooks/useAITask'
import { loadAIConfig } from '@/services/ai/config'
import {
  generateRelationshipSuggestions,
  parseRelationshipSuggestions,
  runCustomPrompt,
  type RelationshipSuggestion,
} from '@/services/ai/tasks'
import { buildRelationshipPrompt, withSystem } from '@/services/ai/prompts'
import PromptPreviewModal from './PromptPreviewModal'
import PasteImportModal from './PasteImportModal'
import { relationshipRepo } from '@/db/repositories'
import { createEntity } from '@/utils/common'
import type { Character, Relationship } from '@/types'

/** 人物关系建议（Sprint 7 US-804）：AI 产出候选 → 勾选采纳写入关系表 */
export default function RelationshipSuggestModal({
  projectId,
  characters,
  relationships,
  projectContext,
  onClose,
  onApplied,
}: {
  projectId: string
  characters: Character[]
  relationships: Relationship[]
  projectContext?: string
  onClose: () => void
  onApplied: () => void
}) {
  const [focus, setFocus] = useState('')
  const [extra, setExtra] = useState('')
  const [count, setCount] = useState(5)
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const { loading, error, result, setResult, setError, run, cancel } = useAITask<RelationshipSuggestion[]>()

  /** 已存在关系对（无方向，按 id 排序归一） */
  const existing = useMemo(() => {
    const set = new Set<string>()
    for (const r of relationships) set.add([r.sourceId, r.targetId].sort().join('|'))
    return set
  }, [relationships])

  function isDup(s: RelationshipSuggestion): boolean {
    if (!s.sourceId || !s.targetId) return false
    return existing.has([s.sourceId, s.targetId].sort().join('|'))
  }

  /** 粘贴在别处生成好的关系建议 JSON 直接填充为可勾选列表 */
  async function handlePasteImport(text: string): Promise<string | null> {
    let list: RelationshipSuggestion[]
    try {
      list = parseRelationshipSuggestions(text, characters)
    } catch (err) {
      return err instanceof Error ? err.message : 'JSON 解析失败'
    }
    if (!list.length) return '未解析出任何关系条目，请粘贴符合格式的 JSON 数组'
    setError('')
    setResult(list)
    const next: Record<number, boolean> = {}
    list.forEach((s, i) => {
      next[i] = !s.disabled && !isDup(s)
    })
    setChecked(next)
    return null
  }

  async function handleGenerate(custom?: { userText: string; systemText: string }) {
    const list = custom
      ? await run(async (signal) =>
          parseRelationshipSuggestions(
            await runCustomPrompt(
              { projectId, kind: 'relationship', inputSummary: focus },
              custom.userText,
              custom.systemText,
              loadAIConfig(),
              signal,
            ),
            characters,
          ),
        )
      : await run((signal) =>
          generateRelationshipSuggestions(
            characters,
            { focusName: focus, extra, projectContext, max: count, projectId },
            loadAIConfig(),
            signal,
          ),
        )
    if (list) {
      const next: Record<number, boolean> = {}
      list.forEach((s, i) => {
        next[i] = !s.disabled && !isDup(s)
      })
      setChecked(next)
    }
  }

  async function handleAdopt() {
    if (!result) return
    setSaving(true)
    try {
      const picked = result.filter((_, i) => checked[i] && !result[i].disabled && !isDup(result[i]))
      for (const s of picked) {
        if (!s.sourceId || !s.targetId) continue
        const [sourceId, targetId] = [s.sourceId, s.targetId].sort()
        await relationshipRepo.add(
          createEntity<Relationship>(projectId, {
            sourceId,
            targetId,
            type: s.type,
            strength: s.strength,
            description: s.reason || undefined,
            dynamic: false,
            history: [],
          }),
        )
      }
      onApplied()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="AI 人物关系建议"
      description="基于人物列表与世界观生成候选关系，勾选后写入关系图（已存在的关系不会重复添加）。"
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="ghost"
            onClick={() => setPasteOpen(true)}
            title="粘贴在别处生成好的关系建议直接填充"
          >
            <ClipboardPaste className="size-4" /> 粘贴填充
          </Button>
          <Button
            variant="ghost"
            disabled={characters.length < 2}
            onClick={() => setPreviewOpen(true)}
            title="查看并编辑将要发送的提示"
          >
            <Eye className="size-4" /> 提示预览
          </Button>
          {result ? (
            <>
              <Button variant="secondary" onClick={() => void handleGenerate()} loading={loading}>
                <Sparkles className="size-4" /> 重新生成
              </Button>
              <Button
                variant="primary"
                loading={saving}
                disabled={!result.some((_, i) => checked[i])}
                onClick={() => void handleAdopt()}
              >
                采纳所选
              </Button>
            </>
          ) : (
            <>
              {loading && (
                <Button variant="ghost" onClick={cancel}>
                  停止
                </Button>
              )}
              <Button variant="primary" loading={loading} disabled={characters.length < 2} onClick={() => void handleGenerate()}>
                <Sparkles className="size-4" /> 生成建议
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="围绕人物" hint="可选">
            <Select value={focus} onChange={(e) => setFocus(e.target.value)}>
              <option value="">不限</option>
              {characters.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="建议条数">
            <Input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value) || 5)} />
          </Field>
          <Field label="补充要求">
            <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="如：多给敌对与师徒" />
          </Field>
        </div>

        {characters.length < 2 && <p className="text-sm text-amber-700">至少需要 2 个人物才能生成关系建议。</p>}
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {result && (
          <ul className="space-y-2">
            {result.map((s, i) => {
              const dup = isDup(s)
              const blocked = Boolean(s.disabled) || dup
              return (
                <li
                  key={`${s.sourceName}-${s.targetName}-${i}`}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3',
                    blocked ? 'border-stone-200 bg-stone-50 opacity-70' : 'border-violet-200 bg-violet-50/40',
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 accent-violet-600"
                    checked={Boolean(checked[i]) && !blocked}
                    disabled={blocked}
                    onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-stone-900">
                        {s.sourceName} — {s.targetName}
                      </span>
                      <Badge color={s.strength < 0 ? 'red' : 'green'}>{s.type}</Badge>
                      <span className="text-xs text-stone-500">强度 {s.strength}</span>
                      {dup && <Badge color="slate">已存在</Badge>}
                      {s.disabled && !dup && <Badge color="amber">{s.note ?? '无法采纳'}</Badge>}
                    </div>
                    {s.reason && <p className="mt-1 text-xs leading-relaxed text-stone-600">{s.reason}</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {previewOpen && (
        <PromptPreviewModal
          title="人物关系建议"
          messages={withSystem(buildRelationshipPrompt(characters, { focusName: focus, extra, projectContext, max: count }))}
          onClose={() => setPreviewOpen(false)}
          onGenerate={(userText, systemText) => {
            setPreviewOpen(false)
            void handleGenerate({ userText, systemText })
          }}
        />
      )}
      {pasteOpen && (
        <PasteImportModal
          title="人物关系建议"
          description="把在别处生成好的关系候选 JSON 粘贴进来，导入后勾选采纳（与已存在的关系自动去重）。"
          placeholder={'JSON 数组，每项含 source/target/type/strength/reason，如 [{"source":"人物A","target":"人物B","type":"敌对","strength":-60,"reason":"…"}]'}
          example={`[\n  {"source":"人物A","target":"人物B","type":"敌对","strength":-60,"reason":"为夺同一秘宝结怨"},\n  {"source":"人物C","target":"人物D","type":"师徒","strength":80,"reason":"故人之托"}\n]`}
          onImport={(t) => handlePasteImport(t)}
          onClose={() => setPasteOpen(false)}
        />
      )}
    </Modal>
  )
}
