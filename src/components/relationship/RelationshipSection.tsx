import { useMemo, useState } from 'react'
import { ArrowRight, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  cn,
} from '@/components/ui'
import { useProjectEntityList } from '@/hooks/useProjectEntityList'
import { relationshipRepo, removeRelationshipById } from '@/db/repositories'
import { createEntity } from '@/utils/common'
import type { Character, Relationship } from '@/types'

export const RELATIONSHIP_TYPES = ['亲情', '友情', '爱情', '敌对', '师徒', '合作', '利用', '暗恋', '仇恨', '其他']

function strengthWord(s: number): string {
  if (s <= -80) return '深仇大恨'
  if (s <= -40) return '强烈敌对'
  if (s < 0) return '疏远对立'
  if (s === 0) return '中立'
  if (s < 40) return '初步好感'
  if (s < 80) return '亲近信赖'
  return '生死之交'
}

function strengthColor(s: number): string {
  if (s < 0) return 'text-red-600'
  if (s === 0) return 'text-stone-400'
  return 'text-emerald-600'
}

/**
 * 人物关系管理区块（US-107：选择两个人物、定义关系类型和强度，保存后在人物详情显示）
 * 一对人物仅允许一条关系记录（无方向，sourceId/targetId 按字符串序归一）；删除人物时级联清理。
 */
export function RelationshipSection({
  projectId,
  character,
  characters,
}: {
  projectId: string
  character: Character
  characters: Character[]
}) {
  const { items: allRelations, refresh } = useProjectEntityList(relationshipRepo, projectId)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Relationship | null>(null)
  const [deleting, setDeleting] = useState<Relationship | null>(null)

  const mine = useMemo(
    () =>
      allRelations
        .filter((r) => r.sourceId === character.id || r.targetId === character.id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [allRelations, character.id],
  )

  const otherOf = (r: Relationship): Character | undefined => {
    const id = r.sourceId === character.id ? r.targetId : r.sourceId
    return characters.find((c) => c.id === id)
  }

  async function handleDelete() {
    if (!deleting) return
    await removeRelationshipById(deleting.id)
    setDeleting(null)
    void refresh()
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">人物关系</h2>
        <Button size="sm" variant="subtle" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" /> 添加关系
        </Button>
      </div>

      {mine.length === 0 ? (
        <div className="rounded-xl bg-stone-50 px-4 py-6 text-center text-sm text-stone-400">
          暂无关系记录。选择另一位人物，定义关系类型与强度（如：师徒 +60）。
        </div>
      ) : (
        <ul className="space-y-2">
          {mine.map((r) => {
            const other = otherOf(r)
            const isOutgoing = r.sourceId === character.id
            return (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-xl border border-stone-100 bg-stone-50/60 px-3 py-2.5"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">
                  {other?.name.slice(0, 1) ?? '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm">
                    {!isOutgoing && <span className="shrink-0 text-stone-400">（{character.name}←）</span>}
                    <span className="truncate font-medium text-stone-800">{other?.name ?? '未知人物'}</span>
                    {isOutgoing && <ArrowRight className="size-3 text-stone-300" />}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge color="violet">{r.type}</Badge>
                    <span className={cn('text-xs font-medium', strengthColor(r.strength))}>
                      {r.strength > 0 ? `+${r.strength}` : r.strength} · {strengthWord(r.strength)}
                    </span>
                    {r.description && <span className="truncate text-xs text-stone-400">—— {r.description}</span>}
                  </div>
                </div>
                <button
                  className="rounded-lg p-1.5 text-stone-400 hover:bg-white hover:text-violet-700 cursor-pointer"
                  onClick={() => setEditing(r)}
                  aria-label="编辑关系"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  className="rounded-lg p-1.5 text-stone-400 hover:bg-white hover:text-red-600 cursor-pointer"
                  onClick={() => setDeleting(r)}
                  aria-label="删除关系"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {(creating || editing) && (
        <RelationshipModal
          projectId={projectId}
          character={character}
          characters={characters}
          existing={editing ?? undefined}
          takenIds={mine
            .filter((r) => r.id !== editing?.id)
            .map((r) => (r.sourceId === character.id ? r.targetId : r.sourceId))}
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
        title="删除关系"
        description={deleting ? `确定删除与「${otherOf(deleting)?.name ?? '对方'}」的「${deleting.type}」关系吗？` : undefined}
        confirmText="删除"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
      />
    </section>
  )
}

function RelationshipModal({
  projectId,
  character,
  characters,
  existing,
  takenIds,
  onClose,
  onSaved,
}: {
  projectId: string
  character: Character
  characters: Character[]
  existing?: Relationship
  takenIds: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const others = characters.filter((c) => c.id !== character.id)
  const [targetId, setTargetId] = useState(
    existing ? (existing.sourceId === character.id ? existing.targetId : existing.sourceId) : '',
  )
  const [type, setType] = useState(existing?.type ?? RELATIONSHIP_TYPES[0])
  const [strength, setStrength] = useState(existing?.strength ?? 50)
  const [dynamic, setDynamic] = useState(existing?.dynamic ?? true)
  const [description, setDescription] = useState(existing?.description ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const otherDisabled = (id: string) => !existing && takenIds.includes(id)

  async function handleSave() {
    if (!targetId) {
      setError('请选择另一位人物')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (existing) {
        await relationshipRepo.update(existing.id, {
          type,
          strength,
          dynamic,
          description: description.trim() || undefined,
          history: existing.history,
        })
      } else {
        const [a, b] = [character.id, targetId].sort()
        const entity = createEntity<Relationship>(projectId, {
          sourceId: a,
          targetId: b,
          type,
          strength,
          dynamic,
          description: description.trim() || undefined,
          history: [],
        })
        await relationshipRepo.add(entity)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? '编辑关系' : '添加人物关系'}
      width="max-w-lg"
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="人物 A">
            <div className="flex h-10 items-center rounded-lg border border-stone-300 bg-stone-100 px-3 text-sm font-medium text-stone-700">
              {character.name}
            </div>
          </Field>
          <Field label="人物 B" required>
            <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">请选择…</option>
              {others.map((c) => (
                <option key={c.id} value={c.id} disabled={otherDisabled(c.id)}>
                  {c.name}
                  {otherDisabled(c.id) ? '（已有关系）' : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="关系类型">
          <div className="flex flex-wrap gap-1.5">
            {RELATIONSHIP_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs transition-colors cursor-pointer',
                  type === t ? 'bg-violet-700 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        <Field label={`关系强度：${strength > 0 ? `+${strength}` : strength}（${strengthWord(strength)}）`} hint="负数为负面关系，正数为正面关系，0 为中立">
          <input
            type="range"
            min={-100}
            max={100}
            step={5}
            value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
            className="w-full accent-violet-600"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" className="accent-violet-600" checked={dynamic} onChange={(e) => setDynamic(e.target.checked)} />
          随剧情动态变化（记录关系历史）
        </label>

        <Field label="关系描述">
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="如何相识、关系细节……（可选）"
          />
        </Field>
      </form>
    </Modal>
  )
}
