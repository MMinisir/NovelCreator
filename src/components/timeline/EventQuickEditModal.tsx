import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Flame, Star } from 'lucide-react'
import { Button, Field, Input, Modal, Select, cn } from '@/components/ui'
import { FlexibleTimeEditor } from '@/components/time/FlexibleTimeEditor'
import { CharacterMultiSelect } from '@/components/people/CharacterMultiSelect'
import { eventRepo } from '@/db/repositories'
import { EVENT_TYPES } from '@/utils/eventTypes'
import type { Character, Location, StoryEvent } from '@/types'

/**
 * 时间线事件快速编辑（列表 / 甘特图点击事件后调起）：
 * 只放最常改的字段（名称 / 重要性 / 时间 / 类型 / 地点 / 参与者），
 * 描述、结果与伏笔等完整字段仍去「事件」页编辑。
 */
export default function EventQuickEditModal({
  event,
  characters,
  locations,
  onClose,
  onSaved,
}: {
  event: StoryEvent
  characters: Character[]
  locations: Location[]
  onClose: () => void
  onSaved: (patch: Partial<StoryEvent>) => void
}) {
  const [name, setName] = useState(event.name)
  const [importance, setImportance] = useState(event.importance)
  const [tension, setTension] = useState(event.tension ?? 0)
  const [time, setTime] = useState(event.time)
  const [type, setType] = useState(event.type)
  const [locationId, setLocationId] = useState(event.locationId ?? '')
  const [participants, setParticipants] = useState<string[]>(event.participantIds ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e?: FormEvent) {
    e?.preventDefault()
    if (!name.trim()) {
      setError('请填写事件名称')
      return
    }
    setSaving(true)
    setError('')
    try {
      const patch: Partial<StoryEvent> = {
        name: name.trim(),
        importance,
        tension: tension || undefined,
        time,
        type,
        locationId: locationId || undefined,
        participantIds: participants,
      }
      await eventRepo.update(event.id, patch)
      onSaved(patch)
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
      title="快速编辑事件"
      description="只改常用字段；描述、结果与伏笔请到「事件」页完整编辑。"
      width="max-w-xl"
      footer={
        <>
          <Link to="../events" className="mr-auto self-center text-xs text-violet-600 hover:text-violet-800">
            去事件页完整编辑 →
          </Link>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void handleSave()}>
            保存
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="事件名称" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：青云大比决赛" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="重要性">
              <div className="flex h-10 items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setImportance(n)}
                    className={cn('cursor-pointer p-0.5', n <= importance ? 'text-amber-400' : 'text-stone-200')}
                    aria-label={`${n} 星`}
                  >
                    <Star className="size-4 fill-current" />
                  </button>
                ))}
                <span className="ml-1 text-xs text-stone-400">{importance}</span>
              </div>
            </Field>
            <Field label="情节张力" hint="再点一次可取消">
              <div className="flex h-10 items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setTension(tension === n ? 0 : n)}
                    className={cn('cursor-pointer p-0.5', n <= tension ? 'text-rose-500' : 'text-stone-200')}
                    aria-label={`张力 ${n}`}
                  >
                    <Flame className="size-4 fill-current" />
                  </button>
                ))}
                <span className="ml-1 text-xs text-stone-400">{tension === 0 ? '—' : tension}</span>
              </div>
            </Field>
          </div>
        </div>

        <Field label="发生时间" hint="支持精确日期、章节时间或模糊时间（如“三年后”）">
          <FlexibleTimeEditor value={time} onChange={setTime} />
        </Field>

        <Field label="事件类型">
          <div className="flex flex-wrap gap-1.5">
            {EVENT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  'cursor-pointer rounded-full px-3 py-1 text-xs transition-colors',
                  type === t ? 'bg-violet-700 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="发生地点">
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">未指定</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="参与者">
            <div className="pt-1">
              <CharacterMultiSelect
                characters={characters}
                value={participants}
                onChange={setParticipants}
                placeholder="搜索人物…"
              />
            </div>
          </Field>
        </div>
      </form>
    </Modal>
  )
}
