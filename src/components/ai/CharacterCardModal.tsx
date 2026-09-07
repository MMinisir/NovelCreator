import { useState } from 'react'
import { Check, ClipboardPaste, Eye, Sparkles } from 'lucide-react'
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { useAITask } from '@/hooks/useAITask'
import { characterRepo } from '@/db/repositories'
import { loadAIConfig } from '@/services/ai/config'
import {
  generateCharacterCard,
  parseCharacterCard,
  runCustomPrompt,
  textToHtmlParagraphs,
  type CharacterCardDraft,
} from '@/services/ai/tasks'
import { buildCharacterCardPrompt, withSystem } from '@/services/ai/prompts'
import PromptPreviewModal from './PromptPreviewModal'
import PasteImportModal from './PasteImportModal'
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
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const { loading, error: aiError, setError: setAiError, run, cancel } = useAITask<CharacterCardDraft>()

  async function handleGenerate(custom?: { userText: string; systemText: string }) {
    if (!prompt.trim()) {
      setAiError('请先写一句话设定，如“一个在末世中靠回收旧物为生的少女机械师”')
      return
    }
    const data = custom
      ? await run(async (signal) =>
          parseCharacterCard(
            await runCustomPrompt(
              { projectId, kind: 'characterCard', inputSummary: prompt },
              custom.userText,
              custom.systemText,
              loadAIConfig(),
              signal,
            ),
          ),
        )
      : await run((signal) =>
          generateCharacterCard(
            { prompt, extra, genre, worldContext: projectContext, existingNames, projectId },
            loadAIConfig(),
            signal,
          ),
        )
    if (data) setDraft(data)
  }

  /** 粘贴在别处生成好的角色卡 JSON 直接填充为可编辑草稿 */
  async function handlePasteImport(text: string): Promise<string | null> {
    try {
      const data = parseCharacterCard(text)
      if (!data.name.trim()) return '解析出的角色卡缺少姓名，请补充后重试'
      setDraft(data)
      setAiError('')
      return null
    } catch (err) {
      return err instanceof Error ? err.message : '角色卡 JSON 解析失败'
    }
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
          <Button variant="ghost" onClick={() => setPasteOpen(true)} title="粘贴在别处生成好的角色卡直接填充">
            <ClipboardPaste className="size-4" /> 粘贴填充
          </Button>
          <Button
            variant="ghost"
            disabled={!prompt.trim()}
            onClick={() => setPreviewOpen(true)}
            title="查看并编辑将要发送的提示"
          >
            <Eye className="size-4" /> 提示预览
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
      {previewOpen && (
        <PromptPreviewModal
          title="一句话角色卡"
          messages={withSystem(
            buildCharacterCardPrompt({ prompt, extra, genre, worldContext: projectContext, existingNames }),
          )}
          onClose={() => setPreviewOpen(false)}
          onGenerate={(userText, systemText) => {
            setPreviewOpen(false)
            void handleGenerate({ userText, systemText })
          }}
        />
      )}
      {pasteOpen && (
        <PasteImportModal
          title="一句话角色卡"
          description="把在别处生成好的角色卡 JSON 粘贴进来，导入为可逐项编辑的草稿后即可创建人物。"
          placeholder='JSON 角色卡，含 name/aliases/importance/personalityTags/desire/flaw/background 等字段'
          example={`{"name":"沈观鱼","aliases":["白鹮"] ,"importance":"protagonist","gender":"男","age":"27","appearance":"清瘦高挑，惯穿洗得发白的旧袍，左手常年缠着绷带。","personalityTags":["谨慎","记仇","重诺"],"desire":"查明当年师门覆灭的真相","flaw":"一旦涉及旧事便失去冷静","background":"出身医修世家，幼年随师门避世于东海孤岛，十七岁那年一夜之间师门尽灭，唯他生还。","abilities":["针灸封脉","岐黄问诊","易容"],"currentState":"流落临安城，以行医换消息"}`}
          onImport={(t) => handlePasteImport(t)}
          onClose={() => setPasteOpen(false)}
        />
      )}
    </Modal>
  )
}

function splitList(text: string): string[] {
  return text
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}
