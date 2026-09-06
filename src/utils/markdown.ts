import type { Chapter } from '@/types/chapter'
import { CHAPTER_STATUS_LABELS } from '@/types/chapter'
import { countWords } from '@/utils/text'

/**
 * Markdown 导出（Sprint 6 US-701）：TipTap 富文本 HTML（受控子集）→ Markdown。
 * 纯函数，不依赖 React/DB，可单测。DOCX/PDF 延后（执行案 Sprint 10）。
 */

/** 内联节点（strong/em/code/a/img/br/文本）递归转 Markdown */
function inlineToMd(node: Node): string {
  const out: string[] = []
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.push(child.textContent ?? '')
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const el = child as HTMLElement
    const tag = el.tagName.toLowerCase()
    const inner = inlineToMd(el)
    switch (tag) {
      case 'strong':
      case 'b':
        out.push(`**${inner}**`)
        break
      case 'em':
      case 'i':
        out.push(`*${inner}*`)
        break
      case 'code':
        out.push(`\`${inner}\``)
        break
      case 's':
      case 'strike':
      case 'del':
        out.push(`~~${inner}~~`)
        break
      case 'a':
        out.push(`[${inner}](${el.getAttribute('href') ?? ''})`)
        break
      case 'br':
        out.push('\n')
        break
      case 'img':
        out.push(`![${el.getAttribute('alt') ?? ''}](${el.getAttribute('src') ?? ''})`)
        break
      default:
        out.push(inner)
    }
  }
  return out.join('')
}

/** 有序/无序列表（支持嵌套，TipTap 结构：li 直属 ul/ol） */
function renderList(el: HTMLElement, lines: string[], depth: number): void {
  const ordered = el.tagName.toLowerCase() === 'ol'
  let index = 0
  for (const child of Array.from(el.children)) {
    const li = child as HTMLElement
    if (li.tagName.toLowerCase() !== 'li') continue
    index += 1
    const clone = li.cloneNode(true) as HTMLElement
    clone.querySelectorAll(':scope > ul, :scope > ol').forEach((n) => n.remove())
    const text = inlineToMd(clone).replace(/\s*\n\s*/g, ' ').trim()
    if (text) lines.push(`${'  '.repeat(depth)}${ordered ? `${index}. ` : '- '}${text}`)
    for (const sub of Array.from(li.children)) {
      const subTag = (sub as HTMLElement).tagName.toLowerCase()
      if (subTag === 'ul' || subTag === 'ol') renderList(sub as HTMLElement, lines, depth + 1)
    }
  }
  lines.push('')
}

/** 递归遍历块级结构，输出 Markdown 行 */
function walkBlocks(el: Node, lines: string[]): void {
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = (child.textContent ?? '').trim()
      if (t) lines.push(t)
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const n = child as HTMLElement
    const tag = n.tagName.toLowerCase()
    switch (tag) {
      case 'p': {
        const t = inlineToMd(n).replace(/\n+/g, ' ').trim()
        if (t) lines.push(t, '')
        break
      }
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const level = Number(tag[1])
        const t = inlineToMd(n).trim()
        if (t) lines.push(`${'#'.repeat(level)} ${t}`, '')
        break
      }
      case 'blockquote': {
        const inner: string[] = []
        walkBlocks(n, inner)
        for (const l of inner) lines.push(l ? `> ${l}` : '>')
        if (inner.length) lines.push('')
        break
      }
      case 'ul':
      case 'ol':
        renderList(n, lines, 0)
        break
      case 'hr':
        lines.push('---', '')
        break
      case 'pre': {
        lines.push('```')
        lines.push((n.textContent ?? '').replace(/\s+$/, ''))
        lines.push('```', '')
        break
      }
      default: {
        const container = tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main'
        if (container) {
          walkBlocks(n, lines)
        } else {
          const t = inlineToMd(n).trim()
          if (t) lines.push(t, '')
        }
      }
    }
  }
}

/** TipTap 富文本 HTML → Markdown 纯文本 */
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const lines: string[] = []
  walkBlocks(doc.body, lines)
  return lines.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** 组装项目正文导出：头部元信息 + 章节正文（按写作区顺序） */
export function chaptersToMarkdown(projectName: string, chapters: Chapter[]): string {
  const lines: string[] = []
  const exportedAt = new Date().toLocaleString('zh-CN', { hour12: false })
  lines.push(`# 《${projectName || '未命名作品'}》正文导出`, '')
  lines.push(`> 导出时间：${exportedAt}　共 ${chapters.length} 章　（NovelCreator 导出）`, '')
  chapters.forEach((c, i) => {
    const title = c.title.trim() || `第 ${i + 1} 章 未命名`
    lines.push('', `## ${title}`, '')
    lines.push(`> 状态：${CHAPTER_STATUS_LABELS[c.status]}　字数：${countWords(c.content).toLocaleString()}`)
    if (c.targetWords) lines.push(`> 目标字数：${c.targetWords.toLocaleString()}`)
    lines.push('')
    const body = htmlToMarkdown(c.content)
    lines.push(body ? body : '>（本章暂无正文）')
  })
  lines.push('')
  return lines.join('\n')
}
