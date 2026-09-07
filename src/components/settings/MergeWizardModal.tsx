import { useMemo, useState } from 'react'
import { GitMerge } from 'lucide-react'
import { Badge, Button, Modal, cn } from '@/components/ui'
import { DIFF_LABELS, applyMergePlan, defaultSelection, diffKey, type DiffKind, type EntityDiff, type MergePlan } from '@/services/merge'

const KIND_BADGE: Record<DiffKind, 'green' | 'sky' | 'amber' | 'red'> = {
  added: 'green',
  changed: 'sky',
  localNewer: 'amber',
  removed: 'red',
}

const KIND_HINT: Record<DiffKind, string> = {
  added: '合并后会加入当前项目',
  changed: '远端更新，合并后覆盖本地',
  localNewer: '本地更新，勾选会用远端覆盖',
  removed: '远端没有，勾选会删除本地这条',
}

/** 合并向导（Sprint 10 US-1002）：逐项选择远端差异合并进当前项目 */
export default function MergeWizardModal({
  projectId,
  plan,
  onClose,
  onApplied,
}: {
  projectId: string
  plan: MergePlan
  onClose: () => void
  onApplied: (count: number) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(() => defaultSelection(plan))
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  const groups = useMemo(() => {
    const map = new Map<string, EntityDiff[]>()
    for (const d of plan.diffs) {
      const list = map.get(d.storeLabel) ?? []
      list.push(d)
      map.set(d.storeLabel, list)
    }
    return [...map.entries()]
  }, [plan.diffs])

  const stats = useMemo(() => {
    const s: Record<DiffKind, number> = { added: 0, changed: 0, localNewer: 0, removed: 0 }
    for (const d of plan.diffs) s[d.kind] += 1
    return s
  }, [plan.diffs])

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(plan.diffs.map(diffKey)))
  }

  function clearAll() {
    setSelected(new Set())
  }

  async function handleApply() {
    setApplying(true)
    setError('')
    try {
      const count = await applyMergePlan(projectId, plan, selected)
      onApplied(count)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="合并项目文件"
      description={`远端：《${plan.remoteName}》· 导出于 ${new Date(plan.remoteExportedAt).toLocaleString('zh-CN', { hour12: false })}`}
      width="max-w-3xl"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={applying}
            disabled={selected.size === 0}
            onClick={() => void handleApply()}
          >
            <GitMerge className="size-4" /> 合并 {selected.size} 项
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge color="green">远端新增 {stats.added}</Badge>
          <Badge color="sky">远端更新 {stats.changed}</Badge>
          <Badge color="amber">本地更新 {stats.localNewer}</Badge>
          <Badge color="red">远端缺失 {stats.removed}</Badge>
          <button
            type="button"
            onClick={selectAll}
            className="ml-auto cursor-pointer rounded-lg px-2 py-1 font-medium text-stone-500 hover:bg-stone-100"
          >
            全选
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="cursor-pointer rounded-lg px-2 py-1 font-medium text-stone-500 hover:bg-stone-100"
          >
            清空
          </button>
        </div>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {plan.diffs.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-500">两份数据完全一致，无需合并。</p>
        ) : (
          <div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1">
            {groups.map(([storeLabel, list]) => (
              <div key={storeLabel}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">{storeLabel}</div>
                <ul className="space-y-1">
                  {list.map((d) => {
                    const key = diffKey(d)
                    const checked = selected.has(key)
                    return (
                      <li key={key}>
                        <label
                          className={cn(
                            'flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                            checked ? 'border-violet-300 bg-violet-50/60' : 'border-stone-200 bg-white hover:bg-stone-50',
                          )}
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggle(key)} className="mt-1 size-3.5 accent-violet-600" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge color={KIND_BADGE[d.kind]}>{DIFF_LABELS[d.kind]}</Badge>
                              <span className="truncate font-medium text-stone-900">{d.label}</span>
                            </div>
                            <p className="mt-0.5 text-xs text-stone-400">
                              {KIND_HINT[d.kind]}
                              {d.detail ? ` · ${d.detail}` : ''}
                              {d.remoteAt ? ` · 远端 ${d.remoteAt.slice(0, 16).replace('T', ' ')}` : ''}
                              {d.localAt ? ` / 本地 ${d.localAt.slice(0, 16).replace('T', ' ')}` : ''}
                            </p>
                          </div>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
