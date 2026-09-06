import type { FlexibleTimestamp } from '@/types'

/**
 * 灵活时间排序（设计文档 §2.4.1）：
 * - exact/章节 时间可由值推导顺序；
 * - 模糊/相对时间默认置于最早，由用户手动 sortOrder 调整（时间线 Sprint 5 完善 UI）。
 * 排序基准：relative=0 < fuzzy=1 < chapter=2 < exact=3，二级为该类型内序。
 */
export function compareFlexibleTime(a?: FlexibleTimestamp, b?: FlexibleTimestamp): number {
  const [pa, pb] = [rank(a), rank(b)]
  if (pa[0] !== pb[0]) return pa[0] - pb[0]
  return pa[1] - pb[1]
}

function rank(t?: FlexibleTimestamp): [number, number] {
  if (!t) return [0, 0]
  switch (t.type) {
    case 'exact': {
      const ms = Date.parse(t.value) || 0
      return [3, ms]
    }
    case 'chapter':
      return [2, Number(t.value) || 0]
    case 'fuzzy':
      return [1, t.sortOrder ?? 0]
    default:
      return [0, t.sortOrder ?? 0]
  }
}
