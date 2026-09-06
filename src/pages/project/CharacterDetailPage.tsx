import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Save, Trash2, Users } from 'lucide-react'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Select, Textarea } from '@/components/ui'
import { useProjectEntityList } from '@/hooks/useProjectEntityList'
import { characterRepo, deleteCharacterCascade, eventRepo, locationRepo } from '@/db/repositories'
import { IMPORTANCE_LABELS, IMPORTANCE_LEVELS, type Character, type ImportanceLevel } from '@/types'
import { RichTextEditor } from '@/components/rich/RichTextEditor'
import { TagInput } from '@/components/people/TagInput'
import { StateHistorySection } from '@/components/people/StateHistorySection'
import { RelationshipSection } from '@/components/relationship/RelationshipSection'
import { timeLabel } from '@/utils/time'
import type { FlexibleTimestamp } from '@/types'

/** 人物详情编辑页（US-101/102：编辑字段、富文本备注、保存；US-107 关系区块） */
export default function CharacterDetailPage() {
  const { projectId, characterId } = useParams<{ projectId: string; characterId: string }>()
  const navigate = useNavigate()
  const { items: characters, loaded: charsLoaded } = useProjectEntityList(characterRepo, projectId)
  const { items: events } = useProjectEntityList(eventRepo, projectId)
  const { items: locations } = useProjectEntityList(locationRepo, projectId)

  const [draft, setDraft] = useState<Character | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    let alive = true
    if (!characterId) return
    void characterRepo.byId(characterId).then((c) => {
      if (!alive) return
      if (!c) {
        setNotFound(true)
      } else {
        setDraft({
          ...c,
          aliases: [...c.aliases],
          personalityTags: [...c.personalityTags],
          abilities: [...c.abilities],
          currentState: c.currentState ? { ...c.currentState } : null,
        })
        setNotFound(false)
      }
    })
    return () => {
      alive = false
    }
  }, [characterId])

  const char = draft

  const refs = useMemo(() => {
    if (!char) return { events: [], locations: [] }
    return {
      events: events.filter((e) => e.participantIds.includes(char.id)),
      locations: locations.filter((l) => l.relatedCharacterIds.includes(char.id)),
    }
  }, [char, events, locations])

  if (notFound) {
    return (
      <EmptyState
        icon={<Users className="size-6" />}
        title="人物不存在"
        description="该人物可能已被删除。"
        action={
          <Link to=".." relative="path" className="text-sm font-medium text-violet-600 hover:text-violet-800">
            返回人物列表
          </Link>
        }
      />
    )
  }
  if (!char || !charsLoaded || !projectId) {
    return <div className="py-20 text-center text-sm text-stone-400">加载中…</div>
  }

  function patch(p: Partial<Omit<Character, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>>) {
    setDraft((d) => (d ? { ...d, ...p } : d))
  }

  async function handleSave() {
    if (!char || !char.name.trim()) return
    setSaving(true)
    try {
      const { id, projectId: _pid, createdAt: _c, updatedAt: _u, ...fields } = char
      await characterRepo.update(id, { ...fields, name: char.name.trim() })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!char) return
    await deleteCharacterCascade(char.id)
    navigate('..', { relative: 'path' })
  }

  return (
    <div className="space-y-5 pb-20">
      {/* 顶部操作条 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to=".." relative="path" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-violet-700">
          <ArrowLeft className="size-4" /> 人物列表
        </Link>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle2 className="size-4" /> 已保存
            </span>
          )}
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4 text-red-500" /> 删除
          </Button>
          <Button variant="primary" onClick={() => void handleSave()} loading={saving}>
            <Save className="size-4" /> 保存
          </Button>
        </div>
      </div>

      {/* 头部 */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-2xl font-bold text-white shadow-sm">
            {char.name.slice(0, 1) || '?'}
          </span>
          <div className="min-w-0 flex-1">
            <input
              value={char.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="人物姓名"
              className="w-full border-none bg-transparent font-serif-sc text-3xl font-bold text-stone-900 outline-none placeholder:text-stone-300"
            />
            <div className="mt-1 text-xs text-stone-400">
              最后修改：{new Date(char.updatedAt).toLocaleString('zh-CN')}
            </div>
          </div>
          {char.currentState?.state && (
            <Badge color="amber">
              当前状态：{timeLabel(char.currentState.time)} · {char.currentState.state}
            </Badge>
          )}
        </div>
      </div>

      {/* 基本信息 */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-400">基本信息</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="重要程度">
            <Select value={char.importance} onChange={(e) => patch({ importance: e.target.value as ImportanceLevel })}>
              {IMPORTANCE_LEVELS.map((i) => (
                <option key={i} value={i}>
                  {IMPORTANCE_LABELS[i]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="性别">
            <Input value={char.gender ?? ''} onChange={(e) => patch({ gender: e.target.value })} placeholder="男/女/自定义" />
          </Field>
          <Field label="年龄">
            <Input value={char.age ?? ''} onChange={(e) => patch({ age: e.target.value })} placeholder="支持模糊，如 300+" />
          </Field>
          <div className="sm:col-span-3">
            <Field label="别名" hint="正文识别与快速关联用，逗号或回车分隔">
              <TagInput tags={char.aliases} onChange={(v) => patch({ aliases: v })} placeholder="如：阿澈、墨尘君" />
            </Field>
          </div>
          <div className="sm:col-span-3">
            <Field label="性格标签">
              <TagInput tags={char.personalityTags} onChange={(v) => patch({ personalityTags: v })} placeholder="如：冷静、腹黑、护短" />
            </Field>
          </div>
          <div className="sm:col-span-3">
            <Field label="能力 / 技能" hint="如“境界：金丹”，后续可关联世界观设定">
              <TagInput tags={char.abilities} onChange={(v) => patch({ abilities: v })} placeholder="如：御剑飞行、炼丹" />
            </Field>
          </div>
        </div>
      </section>

      {/* 核心欲望与致命缺陷 */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">核心欲望</h2>
          <Textarea
            rows={3}
            value={char.desire ?? ''}
            onChange={(e) => patch({ desire: e.target.value })}
            placeholder="角色最深层的动机，如：为家族复仇、守护宗门"
          />
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">致命缺陷</h2>
          <Textarea
            rows={3}
            value={char.flaw ?? ''}
            onChange={(e) => patch({ flaw: e.target.value })}
            placeholder="性格弱点，如：多疑、感情用事"
          />
        </div>
      </section>

      {/* 富文本设定块 */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">外貌描写</h2>
          <RichTextEditor value={char.appearance} onChange={(html) => patch({ appearance: html })} placeholder="外表特征、服饰、气质……" />
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">背景故事</h2>
          <RichTextEditor value={char.background} onChange={(html) => patch({ background: html })} placeholder="身世、过往经历……" minHeight="min-h-48" />
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">备注</h2>
        <RichTextEditor value={char.notes} onChange={(html) => patch({ notes: html })} placeholder="与编辑沟通的备注、待补充设定……" />
      </section>

      {/* 引用联动 */}
      {(refs.events.length > 0 || refs.locations.length > 0) && (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">故事中的出现</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {refs.events.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-xs text-stone-400">参与事件</h3>
                <div className="flex flex-wrap gap-1.5">
                  {refs.events.map((e) => (
                    <span key={e.id} className="rounded-lg bg-stone-100 px-2 py-1 text-xs text-stone-600">
                      {e.name}
                      <span className="ml-1 text-stone-400">{timeLabel(e.time)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {refs.locations.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-xs text-stone-400">关联地点</h3>
                <div className="flex flex-wrap gap-1.5">
                  {refs.locations.map((l) => (
                    <span key={l.id} className="rounded-lg bg-sky-50 px-2 py-1 text-xs text-sky-700">
                      {l.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 人物状态历史（US-104） */}
      <StateHistorySection
        projectId={projectId}
        characterId={char.id}
        onCurrentStateChange={(current: { time: FlexibleTimestamp; state: string } | null) => patch({ currentState: current })}
      />

      {/* 人物关系区块（US-107） */}
      <RelationshipSection projectId={projectId} character={char} characters={characters} />

      <ConfirmDialog
        open={confirmDelete}
        title="删除人物"
        description={
          char
            ? `确定删除人物「${char.name}」吗？其状态历史、弧光及涉及的关系将被一并清理，事件与地点中的引用也会移除。`
            : undefined
        }
        confirmText="删除"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}
