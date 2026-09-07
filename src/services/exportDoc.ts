import type { Chapter } from '@/types'
import { CHAPTER_STATUS_LABELS } from '@/types'
import { countWords } from '@/utils/text'
import { htmlToTextLines } from '@/utils/diff'

/**
 * 正文导出扩展（Sprint 10 US-701）：
 * - DOCX：使用 `docx` 库（动态 import，避免拖慢首屏）生成 Word 文档
 * - PDF：生成排版好的打印 HTML，由浏览器打印对话框「另存为 PDF」（零依赖、保留中文字体）
 */
function dateStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 章节正文 HTML → 纯文本行（复用 diff 工具，避免重复实现） */
export function chapterToLines(chapter: Chapter): string[] {
  return htmlToTextLines(chapter.content)
}

/** 导出 Word（.docx）：作品名 + 各章标题 + 正文段落（首行缩进） */
export async function exportChaptersDocx(projectName: string, chapters: Chapter[]): Promise<void> {
  const { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx')
  const name = projectName || '未命名作品'
  const exportedAt = new Date().toLocaleString('zh-CN', { hour12: false })

  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ text: `《${name}》`, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({
      children: [new TextRun({ text: `共 ${chapters.length} 章 · 导出时间 ${exportedAt}`, size: 18, color: '888888' })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: '' }),
  ]

  chapters.forEach((c, i) => {
    const title = c.title.trim() || `第 ${i + 1} 章 未命名`
    children.push(
      new Paragraph({ text: title, heading: HeadingLevel.HEADING_1, pageBreakBefore: i > 0 }),
      new Paragraph({
        children: [
          new TextRun({
            text: `状态：${CHAPTER_STATUS_LABELS[c.status]}　字数：${countWords(c.content).toLocaleString()}`,
            size: 18,
            color: '888888',
          }),
        ],
      }),
    )
    const lines = chapterToLines(c)
    if (lines.length === 0) {
      children.push(new Paragraph({ text: '（本章暂无正文）' }))
      return
    }
    for (const line of lines) {
      children.push(new Paragraph({ text: line, spacing: { after: 120 }, indent: { firstLine: 480 } }))
    }
  })

  const blob = await Packer.toBlob(new Document({ sections: [{ children }] }))
  downloadBlob(blob, `${name}-正文-${dateStr()}.docx`)
}

/** 打印/导出 PDF 用的完整 HTML（A4 排版，每章另起一页） */
export function chaptersToPrintHtml(projectName: string, chapters: Chapter[]): string {
  const name = escapeHtml(projectName || '未命名作品')
  const exportedAt = new Date().toLocaleString('zh-CN', { hour12: false })
  const body = chapters
    .map((c, i) => {
      const title = escapeHtml(c.title.trim() || `第 ${i + 1} 章 未命名`)
      const meta = `状态：${CHAPTER_STATUS_LABELS[c.status]}　字数：${countWords(c.content).toLocaleString()}`
      const paras = chapterToLines(c)
        .map((l) => `<p>${escapeHtml(l)}</p>`)
        .join('')
      return `<section><h2 class="${i === 0 ? 'first' : ''}">${title}</h2><p class="cmeta">${meta}</p>${
        paras || '<p>（本章暂无正文）</p>'
      }</section>`
    })
    .join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${name} - 正文</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  body { font-family: "Songti SC", "SimSun", "Noto Serif CJK SC", serif; font-size: 12pt; line-height: 1.8; color: #111; }
  h1 { font-size: 22pt; text-align: center; margin: 0 0 6mm; }
  .meta { text-align: center; color: #666; font-size: 10pt; margin: 0 0 8mm; }
  h2 { font-size: 16pt; margin: 0 0 4mm; page-break-before: always; }
  h2.first { page-break-before: auto; }
  .cmeta { color: #888; font-size: 10pt; margin: 0 0 4mm; }
  p { margin: 0 0 2mm; text-indent: 2em; }
  .cmeta, .meta { text-indent: 0; }
</style>
</head>
<body>
  <h1>《${name}》</h1>
  <p class="meta">共 ${chapters.length} 章 · 导出时间 ${exportedAt}</p>
  ${body || '<p>（暂无章节）</p>'}
</body>
</html>`
}

/** 打开打印窗口：在打印对话框中选择「另存为 PDF」即可导出 */
export function printHtml(html: string): void {
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) throw new Error('浏览器阻止了弹出窗口，请允许本站点弹出窗口后重试')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
}
