import { useMemo } from 'react'
import { usePromptStore, type TaskKind } from '@/services/ai/templates'

/**
 * 生成入口的「提示词模板」选择行（无自定义模板时不渲染任何内容）：
 * - 选项 = 内置默认（用户在管理页对内置模板的覆盖也作用于该项）+ 作用于该任务的自定义模板；
 * - 选中自定义模板后，生成与预览的 user 提示改由该模板渲染（同一变量集），
 *   未选中（默认值 ''）时行为与改造前完全一致。
 */
export default function PromptTemplatePicker({
  kind,
  value,
  onChange,
}: {
  /** 任务键（自定义模板的「作用任务」匹配该值） */
  kind: TaskKind
  value: string
  onChange: (value: string) => void
}) {
  const all = usePromptStore((s) => s.customs)
  const customs = useMemo(() => all.filter((c) => c.kind === kind), [all, kind])
  if (customs.length === 0) return null
  return (
    <div className="flex items-center justify-end">
      <label className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-600">
        <span className="whitespace-nowrap text-stone-500">模板</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="cursor-pointer bg-transparent text-xs font-medium text-stone-700 outline-none"
        >
          <option value="">内置默认</option>
          {customs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
