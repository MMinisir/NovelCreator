/**
 * 轻量行级差异对比（Sprint 8 US-504 版本历史）。
 * 自实现 LCS 而非引入 diff 库：正文按行比对，先裁剪公共前后缀再 DP，
 * 超大规模（裁剪后 > 1200 行）退化为整块替换，避免卡顿与内存暴涨。
 */

export type DiffType = 'same' | 'add' | 'remove'

export interface DiffLine {
  type: DiffType
  text: string
  leftNo?: number
  rightNo?: number
}

/** HTML（TipTap 正文）→ 纯文本行，用于对比 */
export function htmlToTextLines(html: string): string[] {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const text = (doc.body.textContent ?? '').replace(/\r\n?/g, '\n')
  return text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
}

const MAX_DP = 1200

export function diffLines(oldLines: string[], newLines: string[]): DiffLine[] {
  // 公共前缀 / 后缀裁剪
  let start = 0
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start += 1
  let endOld = oldLines.length
  let endNew = newLines.length
  while (endOld > start && endNew > start && oldLines[endOld - 1] === newLines[endNew - 1]) {
    endOld -= 1
    endNew -= 1
  }

  const head: DiffLine[] = oldLines.slice(0, start).map((text, i) => ({ type: 'same' as const, text, leftNo: i + 1, rightNo: i + 1 }))
  const a = oldLines.slice(start, endOld)
  const b = newLines.slice(start, endNew)
  const mid = a.length > MAX_DP || b.length > MAX_DP ? fallback(a, b, start) : lcsDiff(a, b, start)
  const tail: DiffLine[] = oldLines
    .slice(endOld)
    .map((text, i) => ({ type: 'same' as const, text, leftNo: endOld + i + 1, rightNo: endNew + i + 1 }))
  return [...head, ...mid, ...tail]
}

function lcsDiff(a: string[], b: string[], offset: number): DiffLine[] {
  const n = a.length
  const m = b.length
  const width = m + 1
  const dp = new Uint32Array((n + 1) * width)
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      dp[i * width + j] =
        a[i - 1] === b[j - 1]
          ? dp[(i - 1) * width + (j - 1)] + 1
          : Math.max(dp[(i - 1) * width + j], dp[i * width + (j - 1)])
    }
  }
  const out: DiffLine[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      out.push({ type: 'same', text: a[i - 1], leftNo: offset + i, rightNo: offset + j })
      i -= 1
      j -= 1
    } else if (j > 0 && (i === 0 || dp[i * width + (j - 1)] >= dp[(i - 1) * width + j])) {
      out.push({ type: 'add', text: b[j - 1], rightNo: offset + j })
      j -= 1
    } else {
      out.push({ type: 'remove', text: a[i - 1], leftNo: offset + i })
      i -= 1
    }
  }
  return out.reverse()
}

function fallback(a: string[], b: string[], offset: number): DiffLine[] {
  return [
    ...a.map((text, i) => ({ type: 'remove' as const, text, leftNo: offset + i + 1 })),
    ...b.map((text, i) => ({ type: 'add' as const, text, rightNo: offset + i + 1 })),
  ]
}

export function diffSummary(ops: DiffLine[]): { added: number; removed: number } {
  return {
    added: ops.filter((o) => o.type === 'add').length,
    removed: ops.filter((o) => o.type === 'remove').length,
  }
}
