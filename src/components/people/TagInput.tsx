import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/components/ui'

/** 标签输入：Enter/逗号 添加，退格/叉 删除（用于别名、性格标签、能力列表等） */
export function TagInput({
  tags,
  onChange,
  placeholder = '输入后回车',
  max = 12,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  max?: number
}) {
  const [text, setText] = useState('')

  function commit() {
    const t = text.trim()
    if (t && tags.length < max && !tags.includes(t)) {
      onChange([...tags, t])
    }
    setText('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && !text && tags.length) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2 py-1.5">
      {tags.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-stone-100 py-0.5 pl-2.5 pr-1 text-xs font-medium text-stone-700"
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(tags.filter((_, idx) => idx !== i))}
            className="rounded-full p-0.5 hover:bg-stone-200 cursor-pointer"
            aria-label={`删除 ${t}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={tags.length === 0 ? placeholder : ''}
        className={cn('min-w-20 flex-1 border-none bg-transparent py-0.5 text-sm outline-none placeholder:text-stone-400')}
      />
    </div>
  )
}
