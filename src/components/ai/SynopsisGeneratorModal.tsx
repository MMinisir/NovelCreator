import { useState } from 'react'
import { Eye, Sparkles } from 'lucide-react'
import { Button, Field, Input, Modal, Textarea } from '@/components/ui'
import { useAITask } from '@/hooks/useAITask'
import { loadAIConfig } from '@/services/ai/config'
import { generateSynopsisText, parseSynopsis, runCustomPrompt } from '@/services/ai/tasks'
import { buildSynopsisPrompt, withSystem } from '@/services/ai/prompts'
import PromptPreviewModal from './PromptPreviewModal'
import { SYNOPSIS_PARTS, applySynopsis } from '@/services/outline'
import type { Character, Project } from '@/types'

/** 五句话梗概生成器（Sprint 7 US-802）：输入设定 → AI 生成 → 可编辑 → 写入大纲 */
export default function SynopsisGeneratorModal({
  project,
  characters,
  onClose,
  onApplied,
}: {
  project: Project
  characters: Character[]
  onClose: () => void
  onApplied: () => void
}) {
  const [genre, setGenre] = useState(project.genre ?? '')
  const [premise, setPremise] = useState(project.tagline ?? '')
  const [chars, setChars] = useState(() => characters.slice(0, 5).map((c) => c.name).join('、'))
  const [style, setStyle] = useState('')
  const [lines, setLines] = useState<string[] | null>(null)
  const [applying, setApplying] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const { loading, error, setError, run, cancel } = useAITask<string>()

  function buildContext(): string | undefined {
    return characters.length
      ? `【主要人物】\n${characters
          .slice(0, 10)
          .map((c) => `- ${c.name}${c.personalityTags.length ? `（${c.personalityTags.slice(0, 3).join('、')}）` : ''}`)
          .join('\n')}\n【一句话简介】${project.tagline ?? '（无）'}`
      : undefined
  }

  async function handleGenerate(custom?: { userText: string; systemText: string }) {
    const text = custom
      ? await run((signal) =>
          runCustomPrompt(
            { projectId: project.id, kind: 'synopsis', inputSummary: premise },
            custom.userText,
            custom.systemText,
            loadAIConfig(),
            signal,
          ),
        )
      : await run((signal) =>
          generateSynopsisText(
            { genre, premise, characters: chars, style, projectContext: buildContext(), projectId: project.id },
            loadAIConfig(),
            signal,
          ),
        )
    if (text) {
      const parsed = parseSynopsis(text)
      setLines(parsed)
      if (parsed.every((l) => !l.trim())) setError('AI 返回内容为空或格式无法识别，可补充设定后重试（也可直接在下方手填）')
    }
  }

  async function handleApply() {
    if (!lines) return
    setApplying(true)
    try {
      await applySynopsis(project.id, lines)
      onApplied()
    } finally {
      setApplying(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="AI 生成五句话梗概"
      description="基于你的设定生成开端/发展/高潮/转折/结局五句话，可逐句修改后再写入大纲。"
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="ghost" onClick={() => setPreviewOpen(true)} title="查看并编辑将要发送的提示">
            <Eye className="size-4" /> 提示预览
          </Button>
          {lines ? (
            <>
              <Button variant="secondary" onClick={() => void handleGenerate()} loading={loading}>
                <Sparkles className="size-4" /> 重新生成
              </Button>
              <Button variant="primary" loading={applying} onClick={() => void handleApply()}>
                写入梗概
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
          <Field label="题材 / 类型">
            <Input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="如：都市异能" />
          </Field>
          <Field label="主要人物" hint="逗号或顿号分隔">
            <Input value={chars} onChange={(e) => setChars(e.target.value)} placeholder="如：林澈、苏晚" />
          </Field>
        </div>
        <Field label="核心想法 / 卖点" hint="一句话说明你想写什么，留空则由 AI 构思">
          <Textarea rows={2} value={premise} onChange={(e) => setPremise(e.target.value)} placeholder="如：废柴少年意外获得记载未来死亡名单的残卷……" />
        </Field>
        <Field label="风格要求" hint="可选，如“节奏快、强悬念、反套路”">
          <Input value={style} onChange={(e) => setStyle(e.target.value)} />
        </Field>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {lines && (
          <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/40 p-4">
            <p className="text-xs font-medium text-sky-700">生成结果（可直接编辑）</p>
            {SYNOPSIS_PARTS.map((part, i) => (
              <Field key={part} label={part}>
                <Textarea
                  rows={2}
                  value={lines[i] ?? ''}
                  onChange={(e) =>
                    setLines((prev) => {
                      const next = [...(prev ?? [])]
                      next[i] = e.target.value
                      return next
                    })
                  }
                />
              </Field>
            ))}
          </div>
        )}
      </div>
      {previewOpen && (
        <PromptPreviewModal
          title="五句话梗概"
          messages={withSystem(
            buildSynopsisPrompt({ genre, premise, characters: chars, style, projectContext: buildContext() }),
          )}
          onClose={() => setPreviewOpen(false)}
          onGenerate={(userText, systemText) => {
            setPreviewOpen(false)
            void handleGenerate({ userText, systemText })
          }}
        />
      )}
    </Modal>
  )
}
