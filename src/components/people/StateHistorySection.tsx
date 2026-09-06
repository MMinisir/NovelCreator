import { useMemo, useState } from 'react'
import { Activity, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/components/ui'
import { useProjectEntityList } from '@/hooks/useProjectEntityList'
import { characterRepo, characterStateRepo } from '@/db/repositories'
import { createEntity } from '@/utils/common'
import type { CharacterState, CharacterStateKind, FlexibleTimestamp } from '@/types'
import { FlexibleTimeEditor, timeLabel } from '@/components/time/FlexibleTimeEditor'

const KIND_META: Array<{ value: CharacterStateKind; label: string; badge: 'violet' | 'green' | 'amber' | 'red' | 'slate' | 'sky' }> = [
  { value: 'upgrade', label: '升级', badge: 'violet' },
  { value: 'injury', label: '受伤', badge: 'red' },
  { value: 'death', label: '死亡', badge: 'slate' },
  { value: 'corruption', label: '黑化/堕落', badge: 'amber' },
  { value: 'recovery', label: '恢复', badge: 'green' },
  { value: 'custom', label: '自定义', badge: 'sky' },
]

/** 初始灵活时间：默认“第 1 章”章节时间 */
const DEFAULT_TIME: FlexibleTimestamp = { type: 'chapter', value: '1' }

/**
 * 状态历史区块（US-104：人物状态记录增删改；历史按记录顺序展示，
 * 最新一条自动同步为人物卡片上的 currentState 冗余，展示在人物列表与详情头部）。
 */
export function StateHistorySection({
  projectId,
  characterId,
  onCurrentStateChange,
}: {
  projectId: string
  characterId: string
  onCurrentStateChange: (current: { time: FlexibleTimestamp; state: string } | null) => void
}) {
  const { items: allStates, refresh } = useProjectEntityList(characterStateRepo, projectId)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<CharacterState | null>(null)
  const [deleting, setDeleting] = useState<CharacterState | null>(null)

  const mine = useMemo(
    () =>
      allStates
        .filter((s) => s.characterId === characterId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)), // 剧情推进方向：旧 → 新
    [allStates, characterId],
  )
  const latest = mine.length > 0 ? mine[mine.length - 1] : null

  /** 增删改后重算“最新状态”并同步到人物实体 */
  async function syncCurrentState(next: CharacterState[]) {
    const ordered = [...next].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const top = ordered.length > 0 ? ordered[ordered.length - 1] : null
    const current = top ? { time: top.time, state: top.state } : null
    await characterRepo.update(characterId, { currentState: current })
    onCurrentStateChange(current)
  }

  async function handleDelete() {
    if (!deleting) return
    await characterStateRepo.remove(deleting.id)
    await syncCurrentState(mine.filter((s) => s.id !== deleting.id))
    setDeleting(null)
    void refresh()
  }

  function kindMeta(kind: CharacterStateKind) {
    return KIND_META.find((m) => m.value === kind) ?? KIND_META[KIND_META.length - 1]
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">状态历史</h2>
        <Button size="sm" variant="subtle" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" /> 记录状态变化
        </Button>
      </div>

      {mine.length === 0 ? (
        <EmptyState
          icon={<Activity className="size-5" />}
          title="暂无状态记录"
          description="记录重要变化，如“第10章：晋级金丹”“第3章：重伤昏迷”。最新一条会显示在人物卡片上。"
        />
      ) : (
        <ol className="relative ml-2 space-y-4 border-l-2 border-stone-100 pl-5">
          {mine.map((s, idx) => {
            const meta = kindMeta(s.kind)
            const isLatest = idx === mine.length - 1
            return (
              <li key={s.id} className="relative">
                <span
                  className={`absolute -left-[27px] top-1 size-3 rounded-full ring-4 ring-white ${
                    isLatest ? 'bg-violet-500' : 'bg-stone-200'
                  }`}
                />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <Badge color={meta.badge}>{meta.label}</Badge>
                  <span className="text-sm font-medium text-stone-800">{s.state}</span>
                  {isLatest && (
                    <Badge color="violet" className="font-semibold">
                      当前
                    </Badge>
                  )}
                  <span className="text-xs text-stone-400">{timeLabel(s.time)}</span>
                  <span className="ml-auto flex items-center gap-0.5">
                    <button
                      className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-violet-700 cursor-pointer"
                      onClick={() => setEditing(s)}
                      aria-label="编辑状态"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-red-600 cursor-pointer"
                      onClick={() => setDeleting(s)}
                      aria-label="删除状态"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </div>
                {s.description && <p className="mt-1 whitespace-pre-wrap text-sm text-stone-500">{s.description}</p>}
              </li>
            )
          })}
        </ol>
      )}

      {(creating || editing) && (
        <StateModal
          projectId={projectId}
          characterId={characterId}
          existing={editing ?? undefined}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={async (saved) => {
            setCreating(false)
            setEditing(null)
            const next = editing
              ? mine.map((s) => (s.id === saved.id ? saved : s))
              : [...mine, saved]
            await syncCurrentState(next)
            void refresh()
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="删除状态记录"
        description={
          deleting
            ? `确定删除「${deleting.state}」这条状态记录吗？若这是最新状态，人物卡片上的“当前状态”会改为上一条或清除。`
            : undefined
        }
        confirmText="删除"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
      />
    </section>
  )
}

function StateModal({
  projectId,
  characterId,
  existing,
  onClose,
  onSaved,
}: {
  projectId: string
  characterId: string
  existing?: CharacterState
  onClose: () => void
  onSaved: (saved: CharacterState) => void
}) {
  const [kind, setKind] = useState<CharacterStateKind>(existing?.kind ?? 'upgrade')
  const [time, setTime] = useState<FlexibleTimestamp>(existing?.time ?? DEFAULT_TIME)
  const [state, setState] = useState(existing?.state ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const summary = state.trim()
    if (!summary) {
      setError('请填写状态摘要，如“晋级金丹”')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (existing) {
        const saved = await characterStateRepo.update(existing.id, {
          kind,
          time,
          state: summary,
          description: description.trim() || undefined,
        })
        onSaved(saved)
      } else {
        const entity = createEntity<CharacterState>(projectId, {
          characterId,
          kind,
          time,
          state: summary,
          description: description.trim() || undefined,
        })
        await characterStateRepo.add(entity)
        onSaved(entity)
      }
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
      title={existing ? '编辑状态记录' : '记录状态变化'}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="变化类型">
            <Select value={kind} onChange={(e) => setKind(e.target.value as CharacterStateKind)}>
              {KIND_META.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="发生时间" hint="章节 / 日期 / 模糊时间">
            <FlexibleTimeEditor value={time} onChange={setTime} />
          </Field>
        </div>
        <Field label="状态摘要" required>
          <Input
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="如：晋级金丹、重伤昏迷、堕入魔道"
            autoFocus
          />
        </Field>
        <Field label="详情描述" hint="可选，说明变化原因与影响">
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="如：突破机缘来自…… "
          />
        </Field>
      </form>
    </Modal>
  )
}
