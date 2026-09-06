import { useMemo, useState } from 'react'
import { AtSign, CheckCircle2, Sparkles } from 'lucide-react'
import { Badge, Button, Field, Input, Modal, Textarea } from '@/components/ui'
import { useProjectEntityList } from '@/hooks/useProjectEntityList'
import { characterRepo } from '@/db/repositories'
import { createEntity } from '@/utils/common'
import { IMPORTANCE_LABELS, IMPORTANCE_LEVELS, type Character, type ImportanceLevel } from '@/types'

/** 自然语言中的重要程度别名 → ImportanceLevel（“主角/重要配角/配角/龙套”及其口语形式） */
const IMPORTANCE_ALIAS: Record<string, ImportanceLevel> = {
  主角: 'protagonist',
  重要: 'major',
  重要配角: 'major',
  主要: 'major',
  配角: 'supporting',
  龙套: 'minor',
  路人: 'minor',
  次要: 'supporting',
}

export interface QuickCharacterFields {
  name: string
  importance: ImportanceLevel
  gender?: string
  age?: string
  personalityTags: string[]
}

const SPLIT_RE = /[,，、]/u

/**
 * 解析 @快速创建人物的自然语言（US-108，规则/正则实现，不依赖 AI）。
 * 示例：`@林澈，主角，废柴` → { name: 林澈, importance: protagonist, tags: [废柴] }
 * 规则：首段（去前导 @）为姓名；后续段按序识别：
 *  - 重要程度别名（主角/重要/重要配角/配角/龙套/路人…）
 *  - 性别（男/女）
 *  - 年龄（纯数字或 “20岁”，支持 “20+”）
 *  - 其余视为性格标签
 */
export function parseQuickCharacter(input: string): QuickCharacterFields {
  const text = input.trim().replace(/^@/u, '')
  const parts = text
    .split(SPLIT_RE)
    .map((s) => s.trim())
    .filter(Boolean)
  const name = parts.shift() ?? ''

  let importance: ImportanceLevel = 'supporting'
  let gender: string | undefined
  let age: string | undefined
  const personalityTags: string[] = []

  for (const p of parts) {
    const imp = IMPORTANCE_ALIAS[p]
    if (imp) {
      importance = imp
    } else if (p === '男' || p === '女') {
      gender = p
    } else if (/^\d+(\.\d+)?(\+)?岁?$/u.test(p)) {
      age = p.replace(/岁$/u, '')
    } else {
      personalityTags.push(p)
    }
  }
  return { name, importance, gender, age, personalityTags }
}

/** @快速创建人物弹窗：输入自然语言 → 解析预览 → 创建并进入详情（US-108） */
export function QuickCreateCharacterModal({
  projectId,
  characters,
  onClose,
  onCreated,
  onDirty,
}: {
  projectId: string
  characters: Character[]
  onClose: () => void
  onCreated: (id: string) => void
  onDirty: () => void
}) {
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const parsed = useMemo(() => {
    if (!input.trim()) return null
    const p = parseQuickCharacter(input)
    return p.name ? p : null
  }, [input])

  const existing = useMemo(() => {
    if (!parsed?.name) return undefined
    const q = parsed.name
    return characters.find((c) => c.name === q || c.aliases.some((a) => a === q))
  }, [characters, parsed])

  async function handleCreate() {
    if (!parsed) {
      setError('请先输入人物信息，如：@林澈，主角，废柴')
      return
    }
    if (existing) {
      setError(`「${existing.name}」已存在，将直接打开该人物。`)
      onCreated(existing.id)
      return
    }
    setSaving(true)
    setError('')
    try {
      const entity = createEntity<Character>(projectId, {
        name: parsed.name,
        importance: parsed.importance,
        gender: parsed.gender,
        age: parsed.age,
        aliases: [],
        personalityTags: parsed.personalityTags,
        abilities: [],
        currentState: null,
      })
      const saved = await characterRepo.add(entity)
      onDirty()
      onCreated(saved.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="@ 快速创建人物"
      description="一句话录入基础信息，保存后进入详情页完善设定"
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleCreate()}
            loading={saving}
            disabled={!parsed}
          >
            {existing ? '打开已有人物' : '创建'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleCreate()
        }}
        className="space-y-4"
      >
        <Field
          label="输入人物描述"
          required
          hint="格式：@姓名，重要程度，性别/年龄，性格标签…（可用“主角/重要/配角/龙套”，其余自动识别为标签）"
        >
          <div className="relative">
            <AtSign className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-violet-500" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="@林澈，主角，男，18，冷静，腹黑"
              className="pl-9"
              autoFocus
            />
          </div>
        </Field>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {parsed && !existing && (
          <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-violet-700">
              <Sparkles className="size-3.5" /> 解析预览
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold text-stone-900">{parsed.name}</span>
              <Badge color="violet">{IMPORTANCE_LABELS[parsed.importance]}</Badge>
              {parsed.gender && <Badge color="slate">{parsed.gender}</Badge>}
              {parsed.age && <Badge color="slate">{parsed.age}岁</Badge>}
              {parsed.personalityTags.map((t) => (
                <Badge key={t} color="sky">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {parsed && existing && (
          <p className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <CheckCircle2 className="size-4" />
            「{existing.name}」已在项目中，点击“打开已有人物”跳转其详情。
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {IMPORTANCE_LEVELS.map((i) => (
            <span key={i} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-500">
              {IMPORTANCE_LABELS[i]}
            </span>
          ))}
        </div>
      </form>
    </Modal>
  )
}

/** 供其它模块复用的默认导出占位（本组件以具名导出为准） */
export default QuickCreateCharacterModal
