import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MapPin, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, Select, cn } from '@/components/ui'
import { useProjectStore } from '@/stores/projectStore'
import { useProjectEntityList } from '@/hooks/useProjectEntityList'
import { characterRepo, deleteLocationCascade, locationRepo } from '@/db/repositories'
import { createEntity } from '@/utils/common'
import type { Character, Location } from '@/types'
import { CharacterMultiSelect } from '@/components/people/CharacterMultiSelect'
import { RichTextEditor } from '@/components/rich/RichTextEditor'

export const LOCATION_TYPES = ['城市', '建筑', '自然', '异界', '虚拟空间', '其他']

const TYPE_STYLE: Record<string, string> = {
  城市: 'bg-sky-100 text-sky-700',
  建筑: 'bg-violet-100 text-violet-700',
  自然: 'bg-emerald-100 text-emerald-700',
  异界: 'bg-fuchsia-100 text-fuchsia-700',
  虚拟空间: 'bg-amber-100 text-amber-700',
  其他: 'bg-stone-100 text-stone-600',
}

/** 地点管理页（US-105：创建/编辑地点，字段含所属区域与关联人物） */
export default function LocationsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const currentProject = useProjectStore((s) => s.currentProject())
  const { items: locations, loaded, loading, refresh } = useProjectEntityList(locationRepo, projectId)
  const { items: characters } = useProjectEntityList(characterRepo, projectId)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [editing, setEditing] = useState<Location | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Location | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return locations
      .filter((l) => (typeFilter === 'all' ? true : l.type === typeFilter))
      .filter((l) => !q || l.name.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [locations, query, typeFilter])

  const parentOf = (id?: string) => locations.find((l) => l.id === id)

  async function handleDelete() {
    if (!deleting) return
    await deleteLocationCascade(deleting.id)
    setDeleting(null)
    void refresh()
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">地点</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {currentProject?.name} · 共 {locations.length} 处
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> 新建地点
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索地点…" className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['all', ...LOCATION_TYPES] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
                typeFilter === t
                  ? 'bg-violet-700 text-white'
                  : 'border border-stone-200 bg-white text-stone-500 hover:border-violet-300 hover:text-violet-700',
              )}
            >
              {t === 'all' ? '全部' : t}
            </button>
          ))}
        </div>
      </div>

      {loading && !loaded ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-stone-200/60" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<MapPin className="size-6" />}
          title={locations.length === 0 ? '还没有地点' : '没有匹配的地点'}
          description="记录故事中的城池、门派、秘境等场景，便于事件关联。"
          action={
            locations.length === 0 ? (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus className="size-4" /> 新建地点
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((l) => {
            const parent = parentOf(l.parentLocationId)
            return (
              <div
                key={l.id}
                className="group flex flex-col rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-serif-sc text-base font-bold text-stone-900">{l.name}</h3>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs', TYPE_STYLE[l.type] ?? TYPE_STYLE['其他'])}>
                    {l.type}
                  </span>
                </div>
                {parent && <div className="mt-0.5 text-xs text-stone-400">所属：{parent.name}</div>}

                {l.description ? (
                  <div
                    className="rich-display mt-2 line-clamp-3 text-sm leading-relaxed text-stone-600"
                    dangerouslySetInnerHTML={{ __html: l.description }}
                  />
                ) : (
                  <div className="mt-2 line-clamp-2 text-sm text-stone-300">暂无描述</div>
                )}

                <div className="mt-3 flex items-end justify-between gap-2">
                  {l.relatedCharacterIds.length > 0 ? (
                    <div className="flex -space-x-1.5">
                      {l.relatedCharacterIds.slice(0, 4).map((cid) => {
                        const c = characters.find((x) => x.id === cid)
                        return c ? (
                          <span
                            key={cid}
                            title={c.name}
                            className="flex size-6 items-center justify-center rounded-full border border-white bg-violet-200 text-[10px] font-bold text-violet-800"
                          >
                            {c.name.slice(0, 1)}
                          </span>
                        ) : null
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-stone-300">未关联人物</span>
                  )}
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(l)}>
                      <Pencil className="size-3.5" /> 编辑
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(l)}>
                      <Trash2 className="size-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(creating || editing) && (
        <LocationFormModal
          projectId={projectId ?? ''}
          locations={locations}
          characters={characters}
          existing={editing ?? undefined}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            void refresh()
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="删除地点"
        description={deleting ? `确定删除地点「${deleting.name}」吗？其子地点与关联事件中的引用将一并清理。` : undefined}
        confirmText="删除"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}

/** 地点编辑弹窗 */
function LocationFormModal({
  projectId,
  locations,
  characters,
  existing,
  onClose,
  onSaved,
}: {
  projectId: string
  locations: Location[]
  characters: Character[]
  existing?: Location
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [type, setType] = useState(existing?.type ?? LOCATION_TYPES[0])
  const [parentLocationId, setParentLocationId] = useState(existing?.parentLocationId ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [related, setRelated] = useState<string[]>(existing?.relatedCharacterIds ?? [])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) {
      setError('请填写地点名称')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: name.trim(),
        type,
        parentLocationId: parentLocationId || undefined,
        description: description || undefined,
        relatedCharacterIds: related,
      }
      if (existing) {
        await locationRepo.update(existing.id, payload)
      } else {
        const entity = createEntity<Location>(projectId, {
          ...payload,
          relatedEventIds: [],
          image: undefined,
        })
        await locationRepo.add(entity)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const parentOptions = locations.filter((l) => l.id !== existing?.id)

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? '编辑地点' : '新建地点'}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={() => void handleSave()} loading={saving}>
            保存
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleSave()
        }}
        className="space-y-4"
      >
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="地点名称" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：青云宗 藏经阁" autoFocus />
          </Field>
          <Field label="类型">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {LOCATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="所属区域" hint="先建上层区域（如城池），再把下层地点（如皇宫）归属其中">
          <Select value={parentLocationId} onChange={(e) => setParentLocationId(e.target.value)}>
            <option value="">无（顶层区域）</option>
            {parentOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="常驻 / 相关人物">
          <CharacterMultiSelect characters={characters} value={related} onChange={setRelated} placeholder="搜索人物加入…" />
        </Field>
        <Field label="地点描述">
          <RichTextEditor value={description} onChange={setDescription} placeholder="规模、氛围、标志性细节……" minHeight="min-h-32" />
        </Field>
      </form>
    </Modal>
  )
}
