import type { Comment } from '@/types'

/**
 * 评论/批注服务（Sprint 10 US-1001）：
 * 评论挂在 targetType + targetId 上（正文批注 targetType='chapter'），
 * 支持引用锚点（选中文本）、回复（parentId）与解决状态。
 */
export const COMMENT_TARGET_CHAPTER = 'chapter'

export interface CommentNode {
  root: Comment
  replies: Comment[]
}

const byCreated = (a: Comment, b: Comment) => a.createdAt.localeCompare(b.createdAt)

/** 某章节的评论 */
export function filterChapterComments(comments: Comment[], chapterId: string): Comment[] {
  return comments.filter((c) => c.targetType === COMMENT_TARGET_CHAPTER && c.targetId === chapterId)
}

/** 根评论 + 回复树（按创建时间正序） */
export function buildCommentTree(list: Comment[]): CommentNode[] {
  const roots = list.filter((c) => !c.parentId).sort(byCreated)
  return roots.map((root) => ({
    root,
    replies: list.filter((c) => c.parentId === root.id).sort(byCreated),
  }))
}

/** 统计：总数 / 未解决 / 已解决 */
export function summarizeComments(list: Comment[]): { total: number; open: number; resolved: number } {
  let open = 0
  let resolved = 0
  for (const c of list) {
    if (c.status === 'resolved') resolved += 1
    else open += 1
  }
  return { total: list.length, open, resolved }
}

/** 引用锚点展示文本（截断） */
export function anchorLabel(anchor?: string, max = 48): string {
  const t = (anchor ?? '').trim()
  if (!t) return ''
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** 时间展示（本地化短格式） */
export function commentTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
