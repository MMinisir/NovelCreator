import { useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { useAITask } from '@/hooks/useAITask'
import { characterRepo } from '@/db/repositories'
import { loadAIConfig } from '@/services/ai/config'
import { generateCharacterCard, textToHtmlParagraphs, type CharacterCardDraft } from '@/services/ai/tasks'
import { createEntity } from '@/utils/common'
import { IMPORTANCE_LABELS, IMPORTANCE_LEVELS, type Character } from '@/types'

/**
 * 一句话生成角色卡：输入设定 → AI 产出结构化字段 → 可逐项编辑 → 落库为人物。
 * 纯文本字段（外貌/背景/备注）在写入时经 textToHtmlParagraphs 转为富文本段落。
 */
export default function CharacterCardModal({
  projectId,
  genre,
  projectContext,
  existingNames,
  onClose,
  onCreated,
}: {
  projectId: string
  genre?: string
  /** 世界观/设定速览，作为生成上下文 */
  projectContext?: string
  /** 已有人物名，避免重名 */
  existingNames?: string[]
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [prompt, setPrompt] = useState('')
  const [extra, setExtra] = useState('')
  const [draft, setDraft] = useState<CharacterCardDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const { loading, error: aiError, setError: setAiError, run, cancel } = useAITask<CharacterCardDraft>()

  async function handleGenerate() {
    if (!prompt.trim()) {
      setAiError('请先写一句话设定，如“一个在末世中靠回收旧物为生的少女机械师”')
      return
    }
    const data = await run((signal) =>
      generateCharacterCard(
        { prompt, extra, genre, worldContext: projectContext, existingNames },
        loadAIConfig(),
        signal,
      ),
    )
    if (data) setDraft(data)
  }

  function update<K extends keyof CharacterCardDraft>(key: K, value: CharacterCardDraft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  }

  async function handleCreate() {
    if (!draft) return
    if (!draft.name.trim()) {
      setSaveError('姓名不能为空')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const entity = createEntity<Character>(projectId, {
        name: draft.name.trim(),
        aliases: draft.aliases,
        importance: draft.importance,
        gender: draft.gender || undefined,
        age: draft.age || undefined,
        appearance: draft.appearance ? textToHtmlParagraphs(draft.appearance) : undefined,
        personalityTags: draft.personalityTags,
        desire: draft.desire || undefined,
        flaw: draft.flaw || undefined,
        background: draft.background ? textToHtmlParagraphs(draft.background) : undefined,
        abilities: draft.abilities,
        notes: draft.notes ? textToHtmlParagraphs(draft.notes) : undefined,
        currentState: draft.currentState
          ? { time: { type: 'fuzzy', value: '初始', label: '初始' }, state: draft.currentState }
          : null,
      })
      const saved = await characterRepo.add(entity)
      onCreated(saved.id)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="AI 生成角色卡"
      description="用一句话设定生成完整人物卡，生成后可逐项修改再创建。"
      width="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          {loading && (
            <Button variant="ghost" onClick={cancel}>
              停止
            </Button>
          )}
          {draft ? (
            <>
              <Button variant="secondary" loading={loading} onClick={() => void handleGenerate()}>
                <Sparkles className="size-4" /> 重新生成
              </Button>
              <Button variant="primary" loading={saving} onClick={() => void handleCreate()}>
                <Check className="size-4" /> 创建人物
              </Button>
            </>
          ) : (
            <Button variant="primary" loading={loading} disabled={!prompt.trim()} onClick={() => void handleGenerate()}>
              <Sparkles className="size-4" /> 生成角色卡
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Field label="一句话设定" required hint="越具体越好：身份 + 处境 + 特质，如“被逐出师门、靠赏金维生的落魄剑客”">
          <Textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="一个在末世中靠回收旧物为生的少女机械师…"
            autoFocus
          />
        </Field>
        <Field label="补充要求" hint="可选：风格、避免的元素、希望强调的关系等">
          <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="如：冷峻写实，不要魔法设定" />
        </Field>

        {aiError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{aiError}</p>}
        {saveError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>}

        {draft && (
          <div className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <Field label="姓名" required>
                <Input value={draft.name} onChange={(e) => update('name', e.target.value)} />
              </Field>
              <Field label="重要程度">
                <Select
                  value={draft.importance}
                  onChange={(e) => update('importance', e.target.value as CharacterCardDraft['importance'])}
                >
                  {IMPORTANCE_LEVELS.map((i) => (
                    <option key={i} value={i}>
                      {IMPORTANCE_LABELS[i]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="性别">
                <Input value={draft.gender ?? ''} onChange={(e) => update('gender', e.target.value)} />
              </Field>
              <Field label="年龄">
                <Input value={draft.age ?? ''} onChange={(e) => update('age', e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="别名 / 称号" hint="逗号分隔">
                <Input value={draft.aliases.join('、')} onChange={(e) => update('aliases', splitList(e.target.value))} />
              </Field>
              <Field label="性格标签" hint="逗号分隔">
                <Input
                  value={draft.personalityTags.join('、')}
                  onChange={(e) => update('personalityTags', splitList(e.target.value))}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="核心欲望">
                <Textarea rows={2} value={draft.desire ?? ''} onChange={(e) => update('desire', e.target.value)} />
              </Field>
              <Field label="致命缺陷">
                <Textarea rows={2} value={draft.flaw ?? ''} onChange={(e) => update('flaw', e.target.value)} />
              </Field>
            </div>

            <Field label="能力 / 技能" hint="逗号分隔">
              <Input value={draft.abilities.join('、')} onChange={(e) => update('abilities', splitList(e.target.value))} />
            </Field>

            <Field label="外貌与气质">
              <Textarea rows={2} value={draft.appearance ?? ''} onChange={(e) => update('appearance', e.target.value)} />
            </Field>

            <Field label="背景故事" hint="空行分段，写入人物「背景故事」富文本字段">
              <Textarea rows={6} value={draft.background ?? ''} onChange={(e) => update('background', e.target.value)} />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="当前状态">
                <Input value={draft.currentState ?? ''} onChange={(e) => update('currentState', e.target.value)} />
              </Field>
              <Field label="备注 / 弧光建议">
                <Textarea rows={2} value={draft.notes ?? ''} onChange={(e) => update('notes', e.target.value)} />
              </Field>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function splitList(text: string): string[] {
  return text
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}
