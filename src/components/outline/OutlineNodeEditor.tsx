import { useEffect, useMemo, useRef, useState } from 'react'
import { FilePlus2, FileText, Plus, Trash2, X } from 'lucide-react'
import { Badge, Button, ConfirmDialog, Field, Input, Select, Textarea, cn } from '@/components/ui'
import { deleteOutlineNodeCascade, foreshadowingRepo, outlineRepo } from '@/db/repositories'
import { NODE_TYPE_LABELS, addOutlineChild, allowedChildTypes, createChapterDraftFromOutline, plantVagueForeshadowing, saveOutlineNode, stripHtml } from '@/services/outline'
import type { Character, Location, StoryEvent } from '@/types'
import type { Chapter } from '@/types/chapter'
import type { Foreshadowing } from '@/types/meta'
import type { OutlineNode, OutlineNodeType, OutlineSceneData } from '@/types/outline'
import { CharacterMultiSelect } from '@/components/people/CharacterMultiSelect'
import { RichTextEditor } from '@/components/rich/RichTextEditor'

/** 大纲节点详情编辑器（US-203/204 + US-206 草稿入口）：字段自动保存，伏笔埋设/回收最小闭环 */
export function OutlineNodeEditor(props: {
  projectId: string
  node: OutlineNode
  children: OutlineNode[]
  characters: Character[]
  events: StoryEvent[]
  locations: Location[]
  foreshadowings: Foreshadowing[]
  chapters: Chapter[]
  onSaved: () => void
  onSelectNode: (id: string) => void
  onDeleted: () => void
  onJumpToWriting: (chapterId: string) => void
}) {
  const { projectId, node, children, characters, events, locations, foreshadowings, chapters, onSaved, onSelectNode, onDeleted, onJumpToWriting } = props
  const [title, setTitle] = useState(node.title ?? '')
  const [content, setContent] = useState(node.content ?? '')
  const [characterIds, setCharacterIds] = useState<string[]>(node.type === 'scene' ? node.scene?.characterIds ?? [] : node.characterIds)
  const [keyEventIds, setKeyEventIds] = useState<string[]>(node.keyEventIds)
  const [plantedIds, setPlantedIds] = useState<string[]>(node.foreshadowingPlantedIds ?? [])
  const [resolvedIds, setResolvedIds] = useState<string[]>(node.foreshadowingResolvedIds ?? [])
  const [scene, setScene] = useState<OutlineSceneData>({ goal: node.scene?.goal, locationId: node.scene?.locationId, conflict: node.scene?.conflict, outcome: node.scene?.outcome, characterIds: node.scene?.characterIds ?? [] })
  const [addType, setAddType] = useState<OutlineNodeType | ''>('')
  const [addTitle, setAddTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    setTitle(node.title ?? '')
    setContent(node.content ?? '')
    setCharacterIds(node.type === 'scene' ? node.scene?.characterIds ?? [] : node.characterIds)
    setKeyEventIds(node.keyEventIds)
    setPlantedIds(node.foreshadowingPlantedIds ?? [])
    setResolvedIds(node.foreshadowingResolvedIds ?? [])
    setScene({ goal: node.scene?.goal, locationId: node.scene?.locationId, conflict: node.scene?.conflict, outcome: node.scene?.outcome, characterIds: node.scene?.characterIds ?? [] })
    setAddTitle('')
    setAddType('')
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [node.id])

  const fgMap = useMemo(() => new Map(foreshadowings.map((f) => [f.id, f])), [foreshadowings])
  const isChapter = node.type === 'chapter'
  const isScene = node.type === 'scene'
  const isFree = node.type === 'free'

  /** 按序提交，避免并发 update 竞态（repo.update 内部先 get 再 put） */
  function enqueue(fn: () => Promise<unknown>) {
    chain.current = chain.current.then(() => fn()).then(onSaved).catch(() => undefined)
    return chain.current
  }
  function persist(patch: Parameters<typeof outlineRepo.update>[1]) {
    return enqueue(() => outlineRepo.update(node.id, patch))
  }
  function scheduleSave(patch: Parameters<typeof outlineRepo.update>[1]) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void persist(patch), 800)
  }

  /* 伏笔：埋设 / 移除 / 回收（函数式更新 + 串行落库，连续操作不丢） */
  async function handlePlant(text: string) {
    const f = await plantVagueForeshadowing(projectId, text)
    setPlantedIds((prev) => {
      const next = [...prev, f.id]
      enqueue(() => saveOutlineNode(node.id, { foreshadowingPlantedIds: next }))
      return next
    })
  }
  async function handleUnplant(id: string) {
    const f = fgMap.get(id)
    setPlantedIds((prev) => {
      const next = prev.filter((p) => p !== id)
      enqueue(() => saveOutlineNode(node.id, { foreshadowingPlantedIds: next, foreshadowingResolvedIds: resolvedIds.filter((r) => r !== id) }))
      if (f) enqueue(() => foreshadowingRepo.remove(id))
      return next
    })
    setResolvedIds((prev) => prev.filter((r) => r !== id))
  }
  const resolveCandidates = foreshadowings.filter((f) => f.status !== 'abandoned' && !plantedIds.includes(f.id) && !resolvedIds.includes(f.id))
  function toggleResolve(id: string) {
    setResolvedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
      enqueue(() => saveOutlineNode(node.id, { foreshadowingResolvedIds: next }))
      return next
    })
  }

  /* 子节点 / 草稿 / 删除 */
  const childTypes = allowedChildTypes(node.type)
  async function handleAddChild() {
    if (!addType) return
    const created = await addOutlineChild(projectId, node.id, addType as OutlineNodeType, addTitle.trim() || '未命名节点')
    setAddTitle('')
    setAddType('')
    onSaved()
    onSelectNode(created.id)
  }
  const linkedChapter = isChapter ? chapters.find((c) => c.outlineNodeId === node.id) : undefined
  async function handleWriteDraft() {
    if (!isChapter) return
    const c = linkedChapter ?? (await createChapterDraftFromOutline(projectId, node))
    onJumpToWriting(c.id)
  }
  async function handleDelete() {
    await deleteOutlineNodeCascade(node.id)
    setConfirmDelete(false)
    onDeleted()
  }

  const scenePatch = (extra: Partial<OutlineSceneData>) => {
    const next = { ...scene, ...extra }
    setScene(next)
    void saveOutlineNode(node.id, { scene: { ...next, characterIds } })
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge color="violet">{NODE_TYPE_LABELS[node.type]}</Badge>
          <span className="text-xs text-stone-400">字段改动自动保存</span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="size-3.5 text-red-500" /> 删除
        </Button>
      </div>

      <Field label="标题" required>
        <Input value={title} onChange={(e) => setTitle(e.target.value)}
          onBlur={() => { if (title.trim() && title.trim() !== (node.title ?? '')) void persist({ title: title.trim() }) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() } }}
          placeholder={node.type === 'act' ? '如：第一卷 青云山下' : node.type === 'chapter' ? '如：第1章 入门考核' : '节点标题'} />
      </Field>

      {isChapter && (
        <button onClick={() => void handleWriteDraft()}
          className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-dashed border-violet-300 bg-violet-50/60 px-4 py-3 text-left transition-colors hover:bg-violet-100">
          <span className="flex items-center gap-2 text-sm font-medium text-violet-700">
            {linkedChapter ? <FileText className="size-4" /> : <FilePlus2 className="size-4" />}
            {linkedChapter ? `已有正文草稿「${linkedChapter.title}」` : '从本章细纲创建正文草稿'}
          </span>
          <span className="text-xs text-violet-500">{linkedChapter ? '打开写作区 →' : 'US-206'}</span>
        </button>
      )}

      {(isChapter || node.type === 'act' || isFree) && (
        <Field label={isChapter ? '核心剧情' : '概要'}>
          <RichTextEditor value={content} onChange={(html) => { setContent(html); scheduleSave({ content: html }) }}
            placeholder={isChapter ? '本章推进什么、达成什么……' : node.type === 'act' ? '本卷/本幕剧情主线概要……' : '记录灵感、备注或待办……'} minHeight="min-h-28" />
        </Field>
      )}

      {isScene && (
        <div className="space-y-3 rounded-xl border border-stone-100 bg-stone-50/60 p-3">
          <Field label="场景目标">
            <Textarea rows={1} value={scene.goal ?? ''} onChange={(e) => setScene((s) => ({ ...s, goal: e.target.value }))}
              onBlur={() => scenePatch({ goal: scene.goal?.trim() || undefined })} placeholder="这个场景要实现什么？" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="地点">
              <Select value={scene.locationId ?? ''} onChange={(e) => scenePatch({ locationId: e.target.value || undefined })}>
                <option value="">未指定</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
            <Field label="冲突">
              <Textarea rows={1} value={scene.conflict ?? ''} onChange={(e) => setScene((s) => ({ ...s, conflict: e.target.value }))}
                onBlur={() => scenePatch({ conflict: scene.conflict?.trim() || undefined })} placeholder="场景张力来源" />
            </Field>
          </div>
          <Field label="结果">
            <Textarea rows={1} value={scene.outcome ?? ''} onChange={(e) => setScene((s) => ({ ...s, outcome: e.target.value }))}
              onBlur={() => scenePatch({ outcome: scene.outcome?.trim() || undefined })} placeholder="场景结束时的局面？" />
          </Field>
          <Field label="补充描述">
            <RichTextEditor value={content} onChange={(html) => { setContent(html); scheduleSave({ content: html }) }} placeholder="氛围、关键台词……" minHeight="min-h-16" />
          </Field>
        </div>
      )}

      {(isChapter || isScene) && (
        <Field label="出场人物">
          <CharacterMultiSelect characters={characters} value={characterIds}
            onChange={(ids) => {
              setCharacterIds(ids)
              if (isScene) void saveOutlineNode(node.id, { scene: { ...scene, characterIds: ids } })
              else scheduleSave({ characterIds: ids })
            }}
            placeholder="搜索人物加入本章…" />
        </Field>
      )}

      {(isChapter || isScene) && (
        <Field label="关键事件" hint="勾选已记录的事件，供时间线关联大纲">
          {events.length === 0 ? (
            <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-400">暂无事件，可在「事件」模块先记录。</p>
          ) : (
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-stone-200 p-2">
              {events.map((e) => {
                const on = keyEventIds.includes(e.id)
                return (
                  <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-stone-50">
                    <input type="checkbox" checked={on} className="accent-violet-600"
                      onChange={() => {
                        const next = on ? keyEventIds.filter((x) => x !== e.id) : [...keyEventIds, e.id]
                        setKeyEventIds(next)
                        scheduleSave({ keyEventIds: next })
                      }} />
                    <span className="truncate text-stone-700">{e.name}</span>
                    <span className="ml-auto shrink-0 rounded bg-stone-100 px-1.5 text-[10px] text-stone-400">{e.type}</span>
                  </label>
                )
              })}
            </div>
          )}
        </Field>
      )}

      {(isChapter || isScene || node.type === 'act') && (
        <div className="space-y-3 rounded-xl border border-stone-100 bg-stone-50/60 p-3">
          <Field label="埋设伏笔" hint="回车创建，统一在「伏笔」模块管理（Sprint 6）">
            <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2 py-1.5">
              {plantedIds.map((id) => {
                const f = fgMap.get(id)
                return f ? (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full bg-orange-100 py-0.5 pl-2.5 pr-1 text-xs font-medium text-orange-700">
                    {stripHtml(f.description)}
                    <button type="button" onClick={() => void handleUnplant(id)} className="cursor-pointer rounded-full p-0.5 hover:bg-orange-200" aria-label="移除伏笔"><X className="size-3" /></button>
                  </span>
                ) : null
              })}
              <PlantInput onCommit={(t) => void handlePlant(t)} />
            </div>
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-medium text-stone-700">回收伏笔（他处埋设）</p>
            {resolveCandidates.length === 0 ? (
              <p className="text-xs text-stone-400">{resolvedIds.length ? '无更多可回收项' : '暂无他处埋设的活跃伏笔可回收。'}</p>
            ) : (
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-stone-200 bg-white p-2">
                {resolveCandidates.map((f) => (
                  <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-stone-50">
                    <input type="checkbox" onChange={() => void toggleResolve(f.id)} className="accent-emerald-600" />
                    <span className="truncate text-stone-700">{stripHtml(f.description)}</span>
                  </label>
                ))}
              </div>
            )}
            {resolvedIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {resolvedIds.map((id) => {
                  const f = fgMap.get(id)
                  return f ? (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 py-0.5 pl-2.5 pr-1 text-xs font-medium text-emerald-700">
                      {stripHtml(f.description)}
                      <button type="button" onClick={() => void toggleResolve(id)} className="cursor-pointer rounded-full p-0.5 hover:bg-emerald-200" aria-label="撤销回收"><X className="size-3" /></button>
                    </span>
                  ) : null
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 子节点添加 */}
      <div className="rounded-xl border border-stone-100 bg-stone-50/60 p-3">
        <p className="mb-2 text-sm font-medium text-stone-700">子节点（{children.length}）</p>
        {children.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {children.map((c) => (
              <button key={c.id} onClick={() => onSelectNode(c.id)}
                className="cursor-pointer rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-600 hover:border-violet-300 hover:text-violet-700">
                {NODE_TYPE_LABELS[c.type]}：{c.title || '未命名'}
              </button>
            ))}
          </div>
        )}
        {childTypes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {childTypes.map((t) => (
                <button key={t} onClick={() => setAddType(t)}
                  className={cn('cursor-pointer rounded-full px-2.5 py-1 text-xs transition-colors', addType === t ? 'bg-violet-700 text-white' : 'border border-stone-200 bg-white text-stone-500 hover:text-violet-700')}>
                  +{NODE_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <Input value={addTitle} onChange={(e) => setAddTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAddChild() }}
              placeholder={addType ? `输入${NODE_TYPE_LABELS[addType]}标题…` : '先选择类型'} className="min-w-0 flex-1" />
            <Button size="sm" variant="subtle" onClick={() => void handleAddChild()} disabled={!addType}>
              <Plus className="size-3.5" /> 添加
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog open={confirmDelete} title="删除大纲节点"
        description={`确定删除「${title || '未命名节点'}」吗？其全部子节点将被一并删除；已生成的正文草稿会保留（仅解除关联）。`}
        confirmText="删除" danger onCancel={() => setConfirmDelete(false)} onConfirm={() => void handleDelete()} />
    </div>
  )
}

/** 伏笔埋设输入框：回车提交 */
function PlantInput({ onCommit, disabled }: { onCommit: (text: string) => void; disabled?: boolean }) {
  const [text, setText] = useState('')
  return (
    <input value={text} disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          const t = text.trim()
          if (t) { onCommit(t); setText('') }
        }
      }}
      placeholder={disabled ? '埋设数量已达上限' : '输入伏笔描述，回车创建…'}
      className="min-w-24 flex-1 border-none bg-transparent py-0.5 text-sm outline-none placeholder:text-stone-400" />
  )
}
