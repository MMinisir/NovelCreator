/** 正文/富文本字数统计工具（写作区 US-501c 章节字数） */

/** 从 HTML 提取纯文本（去掉标签与实体） */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

/**
 * 网文字数统计口径：去除空白（含换行/空格）后的字符数，
 * 中英文按单字符计（设计文档 §2.8.2 字数统计）。
 */
export function countWords(html: string): number {
  const plain = htmlToPlainText(html).replace(/\s+/g, '')
  return plain.length
}
