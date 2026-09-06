import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { Character } from '@/types'
import { cn } from '@/components/ui'

/**
 * 人物多选组件：显示已选人物 chips，输入框过滤项目内人物后添加。
 * 用于事件参与者、地点关联人物、关系选择等（设计文档 §2.2 自动关联）。
 */
export function CharacterMultiSelect({
  characters,
  value,
  onChange,
  excludeId,
  placeholder = '搜索并添加人物…',
}: {
  characters: Character[]
  value: string[]
  onChange: (ids: string[]) => void
  /** 排除项（如关系中的自身） */
  excludeId?: string
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const candidates = characters
    .filter((c) => c.id !== excludeId && !value.includes(c.id))
    .filter((c) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.aliases.some((a) => a.toLowerCase().includes(q)) ||
        c.personalityTags.some((t) => t.toLowerCase().includes(q))
      )
    })
    .slice(0, 8)

  const picked = value
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is Character => Boolean(c))

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else {
      onChange([...value, id])
    }
    setQuery('')
  }

  return (
    <div ref={boxRef} className="relative">
      <div
        className={cn(
          'flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2 py-1.5',
          open && 'ring-2 ring-violet-500/40 border-violet-500',
        )}
      >
        {picked.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1 rounded-full bg-violet-100 py-0.5 pl-2.5 pr-1 text-xs font-medium text-violet-800"
          >
            {c.name}
            <button
              type="button"
              onClick={() => toggle(c.id)}
              className="rounded-full p-0.5 hover:bg-violet-200 cursor-pointer"
              aria-label={`移除 ${c.name}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && candidates[0]) {
              e.preventDefault()
              toggle(candidates[0].id)
            }
          }}
          placeholder={picked.length === 0 ? placeholder : ''}
          className="min-w-24 flex-1 border-none bg-transparent py-0.5 text-sm outline-none placeholder:text-stone-400"
        />
      </div>

      {open && candidates.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
          {candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-violet-50 cursor-pointer"
            >
              <span className="flex size-5 items-center justify-center rounded bg-violet-50 text-violet-500">
                <Plus className="size-3" />
              </span>
              <span className="font-medium text-stone-800">{c.name}</span>
              {c.gender && <span className="text-xs text-stone-400">{c.gender}</span>}
              <span className="ml-auto text-xs text-stone-400">
                {c.aliases.length ? c.aliases.slice(0, 2).join(' / ') : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
