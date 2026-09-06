import { Input, Select } from '@/components/ui'
import type { FlexibleTimestamp, TimeKind } from '@/types'
import { cn } from '@/components/ui'

const KIND_OPTIONS: Array<{ value: TimeKind; label: string }> = [
  { value: 'exact', label: '精确日期' },
  { value: 'chapter', label: '章节时间' },
  { value: 'fuzzy', label: '模糊时间' },
  { value: 'relative', label: '相对时间' },
]

/**
 * 灵活时间编辑器（设计文档 §2.4.1 时间表达统一）：
 * exact→datetime-local / chapter→章节号 / fuzzy·relative→描述文本。
 */
export function FlexibleTimeEditor({
  value,
  onChange,
  className,
}: {
  value: FlexibleTimestamp
  onChange: (v: FlexibleTimestamp) => void
  className?: string
}) {
  const kind = value.type ?? 'fuzzy'
  const val = value.value ?? ''

  function setKind(next: TimeKind) {
    const nextVal = next === 'exact' ? (val && !/T/.test(val) ? val.slice(0, 10) : val) : val
    onChange({ ...value, type: next, value: nextVal })
  }

  return (
    <div className={cn('grid grid-cols-1 gap-2 sm:grid-cols-[8.5rem_1fr]', className)}>
      <Select value={kind} onChange={(e) => setKind(e.target.value as TimeKind)}>
        {KIND_OPTIONS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </Select>
      {kind === 'exact' ? (
        <Input type="datetime-local" value={val} onChange={(e) => onChange({ ...value, value: e.target.value })} />
      ) : kind === 'chapter' ? (
        <Input
          type="number"
          min={1}
          placeholder="如 10（第10章）"
          value={val && /^\d+$/.test(val) ? Number(val) : ''}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
        />
      ) : (
        <Input
          placeholder={kind === 'relative' ? '如：事件A发生前三天' : '如：春天、三年后'}
          value={val}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
        />
      )}
    </div>
  )
}
