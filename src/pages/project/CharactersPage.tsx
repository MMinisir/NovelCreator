import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Search, Users } from 'lucide-react'
import { Badge, Button, EmptyState, Field, Input, Modal, Select } from '@/components/ui'
import { useProjectStore } from '@/stores/projectStore'
import { useProjectEntityList } from '@/hooks/useProjectEntityList'
import { characterRepo } from '@/db/repositories'
import { createEntity } from '@/utils/common'
import { IMPORTANCE_LABELS, IMPORTANCE_LEVELS, type Character, type ImportanceLevel } from '@/types'
import { timeLabel } from '@/components/time/FlexibleTimeEditor'
import { cn } from '@/components/ui'

const IMPORTANCE_STYLE: Record<ImportanceLevel, string> = {
  protagonist: 'bg-violet-600 text-white',
  major: 'bg-sky-500 text-white',
  supporting: 'bg-stone-400 text-white',
  minor: 'bg-stone-200 text-stone-500',
}

/** 人物列表页（US-101 创建人物、列表可查看；US-102 编辑删除入口） */
export default function CharactersPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const currentProject = useProjectStore((s) => s.currentProject())
  const { items: characters, loaded, loading, refresh } = useProjectEntityList(characterRepo, projectId)
  const [query, setQuery] = useState('')
  const [impFilter, setImpFilter] = useState<ImportanceLevel | 'all'>('all')
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return characters
      .filter((c) => (impFilter === 'all' ? true : c.importance === impFilter))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.aliases.some((a) => a.toLowerCase().includes(q)))
      .sort(
        (a, b) =>
          IMPORTANCE_LEVELS.indexOf(a.importance) - IMPORTANCE_LEVELS.indexOf(b.importance) ||
          b.updatedAt.localeCompare(a.updatedAt),
      )
  }, [characters, query, impFilter])

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">人物</h1>
          <p className="mt-0.5 text-sm text-stone-500">{currentProject?.name} · 共 {characters.length} 人</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> 新建人物
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索姓名/别名…" className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['all', ...IMPORTANCE_LEVELS] as const).map((imp) => (
            <button
              key={imp}
              onClick={() => setImpFilter(imp)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
                impFilter === imp
                  ? 'bg-violet-700 text-white'
                  : 'border border-stone-200 bg-white text-stone-500 hover:border-violet-300 hover:text-violet-700',
              )}
            >
              {imp === 'all' ? '全部' : IMPORTANCE_LABELS[imp]}
            </button>
          ))}
        </div>
      </div>

      {loading && !loaded ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-stone-200/60" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="size-6" />}
          title={characters.length === 0 ? '还没有人物' : '没有匹配的人物'}
          description={characters.length === 0 ? '创建你故事中的第一个人物吧。' : '调整搜索或筛选条件。'}
          action={
            characters.length === 0 ? (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus className="size-4" /> 新建人物
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(c.id)}
              className="group rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-bold',
                    IMPORTANCE_STYLE[c.importance],
                  )}
                >
                  {c.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-serif-sc text-base font-bold text-stone-900 group-hover:text-violet-800">
                    {c.name}
                  </h3>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-stone-400">
                    {c.gender && <span>{c.gender}</span>}
                    {c.age && (
                      <>
                        <span>·</span>
                        <span>{c.age}</span>
                      </>
                    )}
                  </div>
                </div>
                <Badge className="shrink-0" color="violet">
                  {IMPORTANCE_LABELS[c.importance]}
                </Badge>
              </div>

              {c.currentState?.state && (
                <div className="mt-3 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                  当前状态：{timeLabel(c.currentState.time)}
                  {c.currentState.state && ` · ${c.currentState.state}`}
                </div>
              )}

              <div className="mt-2.5 flex flex-wrap gap-1">
                {c.personalityTags.slice(0, 4).map((t) => (
                  <span key={t} className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500">
                    {t}
                  </span>
                ))}
                {c.aliases.length > 0 && (
                  <span className="rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-600">
                    别名：{c.aliases.slice(0, 2).join('/')}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {creating && (
        <CreateCharacterModal
          projectId={projectId ?? ''}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            navigate(id)
          }}
          onDirty={() => void refresh()}
        />
      )}
    </div>
  )
}

/** 新建人物（快速录入，保存后进入详情完善；US-101） */
function CreateCharacterModal({
  projectId,
  onClose,
  onCreated,
  onDirty,
}: {
  projectId: string
  onClose: () => void
  onCreated: (id: string) => void
  onDirty: () => void
}) {
  const [name, setName] = useState('')
  const [importance, setImportance] = useState<ImportanceLevel>('supporting')
  const [gender, setGender] = useState('')
  const [age, setAge] = useState('')
  const [tags, setTags] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!name.trim()) {
      setError('请填写姓名')
      return
    }
    setSaving(true)
    setError('')
    try {
      const entity = createEntity<Character>(projectId, {
        name: name.trim(),
        importance,
        gender: gender || undefined,
        age: age || undefined,
        aliases: [],
        personalityTags: tags
          .split(/[,，、]/)
          .map((s) => s.trim())
          .filter(Boolean),
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
      title="新建人物"
      description="先快速录入基本信息，保存后进入详情页完善设定"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={() => void handleCreate()} loading={saving}>
            创建
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
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <Field label="姓名" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：林澈" autoFocus />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="重要程度">
            <Select value={importance} onChange={(e) => setImportance(e.target.value as ImportanceLevel)}>
              {IMPORTANCE_LEVELS.map((i) => (
                <option key={i} value={i}>
                  {IMPORTANCE_LABELS[i]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="性别">
            <Select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">未知</option>
              <option>男</option>
              <option>女</option>
              <option>无性/未知</option>
            </Select>
          </Field>
          <Field label="年龄">
            <Input value={age} onChange={(e) => setAge(e.target.value)} placeholder="如：18 / 300+" />
          </Field>
        </div>
        <Field label="性格标签" hint="逗号分隔，如：冷静,腹黑">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="可选" />
        </Field>
      </form>
    </Modal>
  )
}
