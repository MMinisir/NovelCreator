import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button, Field, Input, Modal, Textarea } from '@/components/ui'
import { useAITask } from '@/hooks/useAITask'
import { loadAIConfig } from '@/services/ai/config'
import { generateCharacterBioText, textToHtmlParagraphs } from '@/services/ai/tasks'
import type { Character } from '@/types'

/** 人物小传生成器（Sprint 7 US-803）：基于已有设定生成小传，可编辑后写入背景故事 */
export default function CharacterBioModal({
  character,
  projectContext,
  onClose,
  onApplied,
}: {
  character: Character
  projectContext?: string
  onClose: () => void
  onApplied: (html: string) => void
}) {
  const [extra, setExtra] = useState('')
  const [words, setWords] = useState(400)
  const [text, setText] = useState<string | null>(null)
  const { loading, error, run, cancel } = useAITask<string>()

  async function handleGenerate() {
    const result = await run((signal) =>
      generateCharacterBioText(character, { extra, words, projectContext }, loadAIConfig(), signal),
    )
    if (result) setText(result.trim())
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`AI 生成人物小传 · ${character.name}`}
      description="结合人物已有设定生成背景故事，可直接编辑后写入「背景故事」字段。"
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          {text ? (
            <>
              <Button variant="secondary" onClick={() => void handleGenerate()} loading={loading}>
                <Sparkles className="size-4" /> 重新生成
              </Button>
              <Button variant="primary" onClick={() => onApplied(textToHtmlParagraphs(text))}>
                写入背景故事
              </Button>
            </>
          ) : (
            <>
              {loading && (
                <Button variant="ghost" onClick={cancel}>
                  停止
                </Button>
              )}
              <Button variant="primary" loading={loading} onClick={() => void handleGenerate()}>
                <Sparkles className="size-4" /> 生成
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="期望字数">
            <Input type="number" min={100} max={2000} step={50} value={words} onChange={(e) => setWords(Number(e.target.value) || 400)} />
          </Field>
          <Field label="补充要求" hint="如“突出悲剧色彩、第一段埋下伏笔”">
            <Input value={extra} onChange={(e) => setExtra(e.target.value)} />
          </Field>
        </div>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {text && (
          <Field label="生成结果（可编辑，空行分段）">
            <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} className="min-h-64" />
          </Field>
        )}
      </div>
    </Modal>
  )
}
