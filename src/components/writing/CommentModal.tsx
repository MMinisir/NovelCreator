import { useMemo, useState } from 'react'
import { Check, MessageSquare, Reply, RotateCcw, Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, Input, Modal, Textarea, cn } from '@/components/ui'
import { useProjectEntityList } from '@/hooks/useProjectEntityList'
import { commentRepo } from '@/db/repositories'
import { createEntity } from '@/utils/common'
import {
  COMMENT_TARGET_CHAPTER,
  anchorLabel,
  buildCommentTree,
  commentTime,
  filterChapterComments,
  summarizeComments,
} from '@/services/comments'
import type { Comment } from '@/types'

/**
 * 正文评论/批注面板（Sprint 10 US-1001）：
 * 评论挂在章节上，可引用选中文本（anchor）、回复（parentId）、标记解决。
 */
export default function CommentModal({
  projectId,
  chapterId,
  chapterTitle,
  selectedText,
  onClose,
}: {
  projectId: string
  chapterId: string
  chapterTitle: string
  /** 打开面板时正文中选中的文本（作为批注引用） */
  selectedText?: string
  onClose: () => void
}) {
  const { items: comments, refresh } = useProjectEntityList(commentRepo, projectId)
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [author, setAuthor] = useState('')
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')

  const list = useMemo(() => filterChapterComments(comments, chapterId), [comments, chapterId])
  const stats = useMemo(() => summarizeComments(list), [list])
  const tree = useMemo(
    () => buildCommentTree(onlyOpen ? list.filter((c) => c.status === 'open' || c.parentId) : list),
    [list, onlyOpen],
  )

  const authorName = () => author.trim() || '作者'

  async function addComment(parentId: string | null, content: string, anchor?: string) {
    await commentRepo.add(
      createEntity<Comment>(projectId, {
        targetType: COMMENT_TARGET_CHAPTER,
        targetId: chapterId,
        anchor,
        content,
        parentId,
        status: 'open',
        author: authorName(),
      }),
    )
    await refresh()
  }

  async function handleAdd() {
    if (!draft.trim()) return
    await addComment(null, draft.trim(), selectedText?.trim() || undefined)
    setDraft('')
  }

  async function handleReply(parentId: string) {
    if (!replyDraft.trim()) return
    await addComment(parentId, replyDraft.trim())
    setReplyDraft('')
    setReplyTo(null)
  }

  async function toggleStatus(c: Comment) {
    await commentRepo.update(c.id, { status: c.status === 'open' ? 'resolved' : 'open' })
    await refresh()
  }

  async function removeComment(c: Comment) {
    const children = list.filter((x) => x.parentId === c.id)
    for (const child of children) await commentRepo.remove(child.id)
    await commentRepo.remove(c.id)
    await refresh()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`批注 · ${chapterTitle}`}
      description="在正文段落上留下问题与建议，可回复讨论并标记解决（本地存储，随项目导出）。"
      width="max-w-2xl"
      footer={
        <Button variant="primary" onClick={onClose}>
          完成
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge color="slate">共 {stats.total} 条</Badge>
          <Badge color="amber">{stats.open} 条未解决</Badge>
          <Badge color="green">{stats.resolved} 条已解决</Badge>
          <button
            onClick={() => setOnlyOpen((v) => !v)}
            className={cn(
              'ml-auto cursor-pointer rounded-lg px-2 py-1 font-medium transition-colors',
              onlyOpen ? 'bg-violet-100 text-violet-700' : 'text-stone-500 hover:bg-stone-100',
            )}
          >
            仅看未解决
          </button>
        </div>

        {/* 新建批注 */}
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
          {selectedText ? (
            <p className="mb-2 border-l-2 border-violet-400 pl-2 text-xs italic text-stone-500">
              引用：{anchorLabel(selectedText)}
            </p>
          ) : (
            <p className="mb-2 text-xs text-stone-400">未选中文本：可在正文中选中一段后再「添加批注」，批注会记住引用内容。</p>
          )}
          <Textarea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="写下批注内容，如“这里的动机不够充分，建议补充”"
          />
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="署名（默认：作者）"
              className="max-w-48"
            />
            <Button size="sm" variant="primary" className="ml-auto" disabled={!draft.trim()} onClick={() => void handleAdd()}>
              <MessageSquare className="size-3.5" /> 添加批注
            </Button>
          </div>
        </div>

        {tree.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="size-6" />}
            title="还没有批注"
            description="选中正文中的段落并添加批注，即可与编辑/合作者异步讨论。"
          />
        ) : (
          <ul className="space-y-3">
            {tree.map(({ root, replies }) => (
              <li key={root.id} className={cn('rounded-xl border p-3', root.status === 'resolved' ? 'border-stone-200 bg-stone-50' : 'border-amber-200 bg-white')}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-stone-900">{root.author || '作者'}</span>
                  <span className="text-xs text-stone-400">{commentTime(root.createdAt)}</span>
                  <Badge color={root.status === 'open' ? 'amber' : 'green'}>{root.status === 'open' ? '未解决' : '已解决'}</Badge>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => setReplyTo(replyTo === root.id ? null : root.id)}
                      className="cursor-pointer rounded p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-violet-700"
                      aria-label="回复"
                    >
                      <Reply className="size-3.5" />
                    </button>
                    <button
                      onClick={() => void toggleStatus(root)}
                      className="cursor-pointer rounded p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-emerald-700"
                      aria-label={root.status === 'open' ? '标记解决' : '重新打开'}
                    >
                      {root.status === 'open' ? <Check className="size-3.5" /> : <RotateCcw className="size-3.5" />}
                    </button>
                    <button
                      onClick={() => void removeComment(root)}
                      className="cursor-pointer rounded p-1 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      aria-label="删除"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
                {root.anchor && (
                  <p className="mt-1.5 border-l-2 border-violet-400 pl-2 text-xs italic text-stone-500">
                    引用：{anchorLabel(root.anchor)}
                  </p>
                )}
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-stone-700">{root.content}</p>

                {replies.length > 0 && (
                  <ul className="mt-2 space-y-2 border-l border-stone-200 pl-3">
                    {replies.map((r) => (
                      <li key={r.id}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-stone-700">{r.author || '作者'}</span>
                          <span className="text-xs text-stone-400">{commentTime(r.createdAt)}</span>
                          <button
                            onClick={() => void removeComment(r)}
                            className="ml-auto cursor-pointer rounded p-0.5 text-stone-300 transition-colors hover:text-red-600"
                            aria-label="删除回复"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-stone-600">{r.content}</p>
                      </li>
                    ))}
                  </ul>
                )}

                {replyTo === root.id && (
                  <div className="mt-2 flex items-start gap-2">
                    <Textarea
                      rows={2}
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      placeholder="回复…"
                    />
                    <Button size="sm" disabled={!replyDraft.trim()} onClick={() => void handleReply(root.id)}>
                      回复
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
