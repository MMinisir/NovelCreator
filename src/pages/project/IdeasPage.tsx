import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Lightbulb, Plus, Search, StickyNote, Trash2 } from 'lucide-react'
import { Button, ConfirmDialog, EmptyState, Field, Input, Modal, Textarea, cn } from '@/components/ui'
import { useProjectEntityList } from '@/hooks/useProjectEntityList'
import { useProjectStore } from '@/stores/projectStore'
import { ideaRepo } from '@/db/repositories'
import { createEntity } from '@/utils/common'
import type { IdeaFragment } from '@/types/meta'

/** 标签解析：支持中英文逗号/顿号/分号/空白分隔 */
function parseTags(text: string): string[] {
  return [...new Set(text.split(/[,，、;；\s]+/).map((t) => t.trim()).filter(Boolean))].slice(0, 10)
}

const TAG_COLORS = ['bg-violet-100 text-violet-700', 'bg-sky-100 text-sky-700', 'bg-amber-100 text-amber-700', 'bg-emerald-100 text-emerald-700', 'bg-rose-100 text-rose-700']
function tagClass(index: number): string {
  return TAG_COLORS[index % TAG_COLORS.length]
}

/** 灵感碎片页（Sprint 6 US-901 简化版：文本速记，本地 IndexedDB 保存，PWA 离线可用） */
export default function IdeasPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const project = useProjectStore((s) => s.currentProject())
  const { items: ideas, loaded, refresh } = useProjectEntityList(ideaRepo, projectId)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<IdeaFragment | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...ideas].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (!q) return list
    return list.filter(
      (i) =>
        i.content.toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [ideas, query])

  async function handleDelete() {
    if (!deleting) return
    await ideaRepo.remove(deleting.id)
    setDeleting(null)
    void refresh()
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">灵感碎片</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {project?.name} · 共 {ideas.length} 条 · 随手记录，可安装到手机/桌面离线使用（PWA）
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> 记一条灵感
        </Button>
      </div>

      {/* 搜索 */}
      <div className="relative mb-4 w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索内容或标签…"
          className="pl-9"
        />
      </div>

      {!loaded ? (
        <div className="h-96 animate-pulse rounded-2xl bg-stone-200/60" />
      ) : ideas.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="size-6" />}
          title="还没有灵感"
          description="剧情点子、对话金句、角色瞬间——随手记下，之后可拖入大纲或正文使用。"
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> 记一条灵感
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search className="size-6" />} title="没有匹配的灵感" description="换个关键词或清空搜索。" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((idea, idx) => (
            <li
              key={idea.id}
              className="group relative flex flex-col rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition-colors hover:border-violet-300"
            >
              <p className="whitespace-pre-wrap font-serif-sc text-sm leading-relaxed text-stone-800">{idea.content}</p>
              {idea.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {idea.tags.map((tag, ti) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setQuery(tag)}
                      className={cn('cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80', tagClass(idx + ti))}
                      title="点击筛选该标签"
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2 text-[11px] text-stone-400">
                <span className="inline-flex items-center gap-1">
                  <StickyNote className="size-3" />
                  {new Date(idea.createdAt).toLocaleString('zh-CN', { hour12: false })}
                </span>
                <button
                  type="button"
                  onClick={() => setDeleting(idea)}
                  className="cursor-pointer rounded p-1 text-stone-300 transition-colors hover:bg-red-50 hover:text-red-600"
                  aria-label="删除灵感"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <NewIdeaModal
          projectId={projectId!}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            void refresh()
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="删除灵感"
        description={deleting ? `确定删除这条灵感吗？「${deleting.content.slice(0, 40)}${deleting.content.length > 40 ? '…' : ''}」` : undefined}
        confirmText="删除"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}

function NewIdeaModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [content, setContent] = useState('')
  const [tagText, setTagText] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const text = content.trim()
    if (!text) return
    setSaving(true)
    try {
      await ideaRepo.add(
        createEntity<IdeaFragment>(projectId, {
          content: text,
          tags: parseTags(tagText),
          kind: 'text',
        }),
      )
      onCreated()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="记录灵感"
      description="保存到本机浏览器（IndexedDB），离线也能使用。"
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" loading={saving} disabled={!content.trim()} onClick={() => void handleSave()}>
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
        <Field label="灵感内容" required>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="剧情点子、伏笔暗示、对话金句、角色细节…"
            className="min-h-36"
            autoFocus
          />
        </Field>
        <Field label="标签" hint="用逗号分隔，如：剧情、伏笔、对话">
          <Input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="如：情节, 台词" />
        </Field>
      </form>
    </Modal>
  )
}
