import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  Columns2,
  Download,
  FileText,
  FileDown,
  History,
  MessageSquare,
  MessageSquarePlus,
  Printer,
  PenLine,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, Select, cn } from '@/components/ui'
import { characterRepo, chapterRepo, commentRepo, deleteChapterCascade, eventRepo, foreshadowingRepo, locationRepo, outlineRepo } from '@/db/repositories'
import { filterChapterComments } from '@/services/comments'
import { chaptersToPrintHtml, exportChaptersDocx, printHtml } from '@/services/exportDoc'
import { useProjectEntityList } from '@/hooks/useProjectEntityList'
import { useProjectStore } from '@/stores/projectStore'
import { createEntity, downloadTextFile } from '@/utils/common'
import { chaptersToMarkdown } from '@/utils/markdown'
import ChapterVersionModal from '@/components/writing/ChapterVersionModal'
import ReferencePanel from '@/components/writing/ReferencePanel'
import PolishModal from '@/components/ai/PolishModal'
import CommentModal from '@/components/writing/CommentModal'
import { autoSnapshot } from '@/services/chapterVersions'
import { countWords } from '@/utils/text'
import type { Chapter, ChapterStatus } from '@/types/chapter'
import { CHAPTER_STATUS_LABELS } from '@/types/chapter'
import type { Project } from '@/types/project'
import {
  RichTextEditor,
  type EditorSelection,
  type RichTextEditorAPIRef,
} from '@/components/rich/RichTextEditor'

const STATUS_BADGE: Record<ChapterStatus, 'slate' | 'amber' | 'green' | 'violet'> = {
  not_started: 'slate',
  draft: 'amber',
  done: 'green',
  revised: 'violet',
}

/** 写作区（US-501a/501c：章节管理、正文编辑与自动保存） */
export default function WritingPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const project = useProjectStore((s) => s.currentProject())
  const { items: chapters, loaded, refresh } = useProjectEntityList(chapterRepo, projectId)
  const { items: outlineNodes } = useProjectEntityList(outlineRepo, projectId)
  const { items: characters } = useProjectEntityList(characterRepo, projectId)
  const { items: locations } = useProjectEntityList(locationRepo, projectId)
  const { items: events } = useProjectEntityList(eventRepo, projectId)
  const { items: foreshadowings } = useProjectEntityList(foreshadowingRepo, projectId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showReference, setShowReference] = useState(false) // US-501b 分屏参考面板
  const [exporting, setExporting] = useState<'docx' | null>(null) // US-701 导出中状态
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Chapter | null>(null)

  const sorted = useMemo(
    () =>
      [...chapters].sort(
        (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
      ),
    [chapters],
  )
  const outlineChapterNodes = useMemo(
    () =>
      outlineNodes.filter(
        (n) => n.type === 'chapter' && !chapters.some((c) => c.outlineNodeId === n.id),
      ),
    [outlineNodes, chapters],
  )

  // 从大纲“生成正文草稿”跳转选中（?chapter=xx）
  useEffect(() => {
    const cid = searchParams.get('chapter')
    if (cid && chapters.some((c) => c.id === cid)) {
      setSelectedId(cid)
      setSearchParams({}, { replace: true })
    }
  }, [chapters, searchParams, setSearchParams])

  // 首次进入默认选中第一章
  useEffect(() => {
    if (loaded && sorted.length > 0 && !selectedId && !searchParams.get('chapter')) {
      setSelectedId(sorted[0].id)
    }
  }, [loaded, sorted, selectedId, searchParams])

  const selected = chapters.find((c) => c.id === selectedId)

  async function handleDelete() {
    if (!deleting) return
    await deleteChapterCascade(deleting.id)
    if (selectedId === deleting.id) setSelectedId(null)
    setDeleting(null)
    void refresh()
  }

  /** US-701：导出全部章节为 Markdown（按写作区顺序） */
  function handleExport() {
    const md = chaptersToMarkdown(project?.name ?? '', sorted)
    const date = new Date().toISOString().slice(0, 10)
    downloadTextFile(`${project?.name ?? '未命名作品'}-正文-${date}.md`, md, 'text/markdown')
  }

  /** US-701 扩展：导出 Word（.docx） */
  async function handleExportDocx() {
    setExporting('docx')
    try {
      await exportChaptersDocx(project?.name ?? '', sorted)
    } catch (err) {
      window.alert(`导出 Word 失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExporting(null)
    }
  }

  /** US-701 扩展：通过打印对话框导出 PDF */
  function handleExportPdf() {
    try {
      printHtml(chaptersToPrintHtml(project?.name ?? '', sorted))
    } catch (err) {
      window.alert(`导出 PDF 失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">写作区</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {project?.name} · 共 {chapters.length} 章 · 正文自动保存到本地
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showReference ? 'primary' : 'secondary'}
            onClick={() => setShowReference((v) => !v)}
            title="开关左侧参考面板（人物/地点/伏笔/细纲）"
          >
            <Columns2 className="size-4" /> 分屏参考
          </Button>
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={!loaded || sorted.length === 0}
            title="将全部章节导出为 Markdown 文件"
          >
            <Download className="size-4" /> 导出 Markdown
          </Button>
          <Button
            variant="secondary"
            onClick={() => void handleExportDocx()}
            disabled={!loaded || sorted.length === 0}
            loading={exporting === 'docx'}
            title="将全部章节导出为 Word 文档（.docx）"
          >
            <FileDown className="size-4" /> 导出 Word
          </Button>
          <Button
            variant="secondary"
            onClick={handleExportPdf}
            disabled={!loaded || sorted.length === 0}
            title="打开打印对话框，选择「另存为 PDF」即可导出"
          >
            <Printer className="size-4" /> 导出 PDF
          </Button>
          <Button variant="primary" onClick={() => setCreating(true)} disabled={!projectId}>
            <Plus className="size-4" /> 新建章节
          </Button>
        </div>
      </div>

      {!loaded ? (
        <div className="flex h-[60vh] gap-5">
          <div className="w-72 animate-pulse rounded-2xl bg-stone-200/60" />
          <div className="flex-1 animate-pulse rounded-2xl bg-stone-200/60" />
        </div>
      ) : (
        <div className="flex flex-col items-stretch gap-5 lg:flex-row lg:items-start">
          {/* 章节列表 */}
          <aside className="w-full shrink-0 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm lg:w-72">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">章节列表</span>
              <button onClick={() => setCreating(true)} className="cursor-pointer rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-violet-700" aria-label="新建章节">
                <Plus className="size-4" />
              </button>
            </div>
            {sorted.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-stone-400">还没有章节<br />点击「新建章节」开始写作</p>
            ) : (
              <ul className="space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 15rem)' }}>
                {sorted.map((c, i) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        'w-full cursor-pointer rounded-xl px-3 py-2 text-left transition-colors',
                        selectedId === c.id ? 'bg-violet-100' : 'hover:bg-stone-100',
                      )}
                    >
                      <span className={cn('block truncate text-sm font-medium', selectedId === c.id ? 'text-violet-900' : 'text-stone-800')}>
                        {c.title || `第 ${i + 1} 章 未命名`}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-stone-400">
                        <Badge color={STATUS_BADGE[c.status]}>{CHAPTER_STATUS_LABELS[c.status]}</Badge>
                        <span>{c.wordCount.toLocaleString()} 字</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* 编辑器区（US-501b：开启分屏时左侧参考面板 + 右侧正文） */}
          <main className="min-w-0 flex-1">
            {selected ? (
              <div className={cn('flex items-start gap-4', showReference && 'flex-col lg:flex-row')}>
                {showReference && (
                  <ReferencePanel
                    chapter={selected}
                    outlineNodes={outlineNodes}
                    characters={characters}
                    locations={locations}
                    events={events}
                    foreshadowings={foreshadowings}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <ChapterEditor
                    key={selected.id}
                    chapter={selected}
                    targetWords={selected.targetWords ?? project?.chapterDefaults.targetWords}
                    onChanged={() => void refresh()}
                    onDelete={() => setDeleting(selected)}
                  />
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<PenLine className="size-6" />}
                title="开始写作"
                description="从左侧选择章节，或在「大纲」中为章节细纲生成正文草稿后跳转至此。"
                action={
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    <Plus className="size-4" /> 新建章节
                  </Button>
                }
              />
            )}
          </main>
        </div>
      )}

      {creating && projectId && (
        <NewChapterModal
          projectId={projectId}
          defaultOrder={sorted.length ? sorted[sorted.length - 1].order + 1 : 0}
          outlineChapterNodes={outlineChapterNodes}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            setSelectedId(id)
            void refresh()
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="删除章节"
        description={deleting ? `确定删除「${deleting.title || '未命名章节'}」吗？其正文与版本历史将一并删除。` : undefined}
        confirmText="删除"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}

/** 新建章节弹窗：标题 + 可选关联大纲章节细纲 */
function NewChapterModal({
  projectId,
  defaultOrder,
  outlineChapterNodes,
  onClose,
  onCreated,
}: {
  projectId: string
  defaultOrder: number
  outlineChapterNodes: Array<{ id: string; title?: string; order: number }>
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [linkNodeId, setLinkNodeId] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    setSaving(true)
    try {
      const node = outlineChapterNodes.find((n) => n.id === linkNodeId)
      const entity = createEntity<Chapter>(projectId, {
        title: title.trim() || (node?.title?.trim() ? `${node.title.trim()}` : '未命名章节'),
        outlineNodeId: linkNodeId || undefined,
        content: '',
        status: 'not_started' as ChapterStatus,
        wordCount: 0,
        order: defaultOrder,
      })
      await chapterRepo.add(entity)
      onCreated(entity.id)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="新建章节"
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" loading={saving} onClick={() => void handleCreate()}>创建</Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleCreate()
        }}
        className="space-y-4"
      >
        <Field label="章节标题">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：第1章 少年初下山" autoFocus />
        </Field>
        <Field label="关联大纲章节" hint={outlineChapterNodes.length === 0 ? '尚无未被使用的章节细纲，可先在大纲中搭建' : undefined}>
          <Select value={linkNodeId} onChange={(e) => setLinkNodeId(e.target.value)}>
            <option value="">自由章节（不关联大纲）</option>
            {outlineChapterNodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title || '未命名细纲'}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  )
}

/** 单章编辑器：富文本正文 + 标题/状态 + 字数 + 自动保存 */
function ChapterEditor({
  chapter,
  targetWords,
  onChanged,
  onDelete,
}: {
  chapter: Chapter
  /** 目标字数（项目默认或章节覆盖值） */
  targetWords?: number
  onChanged: () => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(chapter.title)
  const [status, setStatus] = useState<ChapterStatus>(chapter.status)
  const [html, setHtml] = useState(chapter.content)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [versionOpen, setVersionOpen] = useState(false) // US-504 版本历史
  const [selection, setSelection] = useState<EditorSelection | null>(null) // US-806 润色选区
  const [polishOpen, setPolishOpen] = useState(false)
  const [commentOpen, setCommentOpen] = useState(false) // US-1001 批注面板
  const editorApiRef = useRef<RichTextEditorAPIRef>({ current: null })
  const wordCount = useMemo(() => countWords(html), [html])
  // US-1001：本章未解决批注数（用于按钮角标）
  const { items: comments } = useProjectEntityList(commentRepo, chapter.projectId)
  const openCommentCount = useMemo(
    () => filterChapterComments(comments, chapter.id).filter((c) => c.status === 'open').length,
    [comments, chapter.id],
  )

  const htmlRef = useRef(html)
  htmlRef.current = html
  const chapterRef = useRef(chapter)
  chapterRef.current = chapter
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusRef = useRef<ChapterStatus>(status)
  statusRef.current = status

  const flush = useCallback(async () => {
    const cur = chapterRef.current
    if (!cur) return
    if (timerRef.current) clearTimeout(timerRef.current)
    const content = htmlRef.current
    const words = countWords(content)
    const currentStatus = statusRef.current
    const nextStatus = currentStatus === 'not_started' && words > 0 ? 'draft' : currentStatus
    setSaving(true)
    try {
      const patch: Partial<Pick<Chapter, 'content' | 'wordCount' | 'status'>> = { content, wordCount: words }
      if (nextStatus !== currentStatus) {
        patch.status = nextStatus
        setStatus(nextStatus)
        statusRef.current = nextStatus
      }
      await chapterRepo.update(cur.id, patch)
      // US-504：保存后写入自动快照（内部按内容变化与最小间隔节流）
      void autoSnapshot({ ...cur, content, wordCount: words })
      setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }))
      onChanged()
    } finally {
      setSaving(false)
    }
  }, [onChanged])

  const flushRef = useRef(flush)
  flushRef.current = flush

  // 卸载（切换章节/离开页面）时落盘未保存内容
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      void flushRef.current()
    }
  }, [])

  function scheduleSave() {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void flush(), 1500)
  }

  const target = targetWords
  const progress = target ? Math.min(100, Math.round((wordCount / target) * 100)) : undefined

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      {/* 头部：标题 + 状态 + 保存指示 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            const t = title.trim()
            if (t && t !== chapter.title) {
              void chapterRepo.update(chapter.id, { title: t }).then(onChanged)
            }
          }}
          placeholder="章节标题"
          className="min-w-0 flex-1 border-none bg-transparent font-serif-sc text-2xl font-bold text-stone-900 outline-none placeholder:text-stone-300"
        />
        <div className="flex items-center gap-2">
          {saving ? (
            <span className="text-xs text-stone-400">保存中…</span>
          ) : savedAt ? (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="size-3.5" /> {savedAt} 已保存
            </span>
          ) : (
            <span className="text-xs text-stone-300">输入后自动保存</span>
          )}
          <Select
            value={status}
            onChange={(e) => {
              const next = e.target.value as ChapterStatus
              setStatus(next)
              statusRef.current = next
              void chapterRepo.update(chapter.id, { status: next }).then(onChanged)
            }}
            className="w-28 py-1.5 text-xs"
          >
            {(Object.keys(CHAPTER_STATUS_LABELS) as ChapterStatus[]).map((s) => (
              <option key={s} value={s}>{CHAPTER_STATUS_LABELS[s]}</option>
            ))}
          </Select>
          <Button
            size="sm"
            variant={openCommentCount > 0 ? 'secondary' : 'ghost'}
            onClick={() => setCommentOpen(true)}
            title="批注（US-1001）"
          >
            <MessageSquare className="size-3.5" />
            {openCommentCount > 0 && <span className="text-xs">{openCommentCount}</span>}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setVersionOpen(true)} title="版本历史（US-504）">
            <History className="size-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="size-3.5 text-red-500" />
          </Button>
        </div>
      </div>

      {/* 字数 */}
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-stone-400">
        <span className="flex items-center gap-1">
          <FileText className="size-3.5" /> {wordCount.toLocaleString()} 字
        </span>
        {progress !== undefined && (
          <span className="flex min-w-40 flex-1 items-center gap-2">
            <Target className="size-3.5" />
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
              <span className={cn('block h-full rounded-full', progress >= 100 ? 'bg-emerald-500' : 'bg-violet-500')} style={{ width: `${progress}%` }} />
            </span>
            <span className="shrink-0">{wordCount.toLocaleString()} / {Number(target ?? 0).toLocaleString()}</span>
          </span>
        )}
      </div>

      {selection && (
        <div className="mb-2 flex items-center justify-end gap-2">
          <span className="text-xs text-stone-400">已选中 {selection.text.length} 字</span>
          <Button size="sm" variant="ghost" onClick={() => setCommentOpen(true)} title="为选中文本添加批注（US-1001）">
            <MessageSquarePlus className="size-3.5" /> 添加批注
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setPolishOpen(true)}>
            <Sparkles className="size-3.5" /> AI 润色选中
          </Button>
        </div>
      )}
      <RichTextEditor
        value={html}
        onChange={(h) => {
          setHtml(h)
          scheduleSave()
        }}
        apiRef={editorApiRef.current}
        onSelectionChange={setSelection}
        placeholder="此刻开始书写故事……（支持标题、加粗、列表、引用等；选中文字可 AI 润色）"
        minHeight="min-h-[42vh] md:min-h-[62vh]"
      />
      <p className="mt-2 text-right text-xs text-stone-300">停笔 1.5 秒后自动保存至浏览器本地</p>

      {versionOpen && (
        <ChapterVersionModal
          chapter={chapter}
          onClose={() => setVersionOpen(false)}
          onRestored={(content) => {
            setHtml(content)
            setVersionOpen(false)
            onChanged()
          }}
        />
      )}
      {commentOpen && (
        <CommentModal
          projectId={chapter.projectId}
          chapterId={chapter.id}
          chapterTitle={title || '未命名章节'}
          selectedText={selection?.text}
          onClose={() => setCommentOpen(false)}
        />
      )}
      {polishOpen && selection && (
        <PolishModal
          original={selection.text}
          context={title || '未命名章节'}
          projectId={chapter.projectId}
          onClose={() => setPolishOpen(false)}
          onApply={(text) => {
            const ok = editorApiRef.current.current?.replaceSelectionWithText(text) ?? false
            if (ok) {
              setSelection(null)
              onChanged()
            }
            return ok
          }}
        />
      )}
    </div>
  )
}
