import { create } from 'zustand'

/**
 * 全局应用设置（跨项目、存本机 localStorage）：
 * - `uiFontSize`：界面根字号（px）。Tailwind 的尺寸都基于 rem，改根字号即整体缩放界面；
 * - `editorFontSize`：写作区正文字号（px），通过 CSS 变量 --editor-font-size 注入编辑器。
 * AI 服务配置不在本 store（由 services/ai/config.ts 独立管理，同为本机全局）。
 */

const UI_FONT_KEY = 'novel-creator.ui-font-size.v1'
const EDITOR_FONT_KEY = 'novel-creator.editor-font-size.v1'

export const UI_FONT_MIN = 14
export const UI_FONT_MAX = 20
export const EDITOR_FONT_MIN = 14
export const EDITOR_FONT_MAX = 30

export const DEFAULT_UI_FONT = 16
export const DEFAULT_EDITOR_FONT = 16

function readNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const value = Number(raw)
    if (!Number.isFinite(value)) return fallback
    return Math.min(max, Math.max(min, Math.round(value)))
  } catch {
    return fallback
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** 把界面字号应用到根元素（rem 基准） */
function applyUiFontSize(size: number): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.fontSize = `${size}px`
}

interface SettingsState {
  uiFontSize: number
  editorFontSize: number
  hydrated: boolean
  /** 启动时读取本机偏好并立即应用（幂等） */
  load: () => void
  setUiFontSize: (size: number) => void
  setEditorFontSize: (size: number) => void
  reset: () => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  uiFontSize: DEFAULT_UI_FONT,
  editorFontSize: DEFAULT_EDITOR_FONT,
  hydrated: false,

  load() {
    if (get().hydrated) return
    const uiFontSize = readNumber(UI_FONT_KEY, DEFAULT_UI_FONT, UI_FONT_MIN, UI_FONT_MAX)
    const editorFontSize = readNumber(EDITOR_FONT_KEY, DEFAULT_EDITOR_FONT, EDITOR_FONT_MIN, EDITOR_FONT_MAX)
    applyUiFontSize(uiFontSize)
    set({ uiFontSize, editorFontSize, hydrated: true })
  },

  setUiFontSize(size) {
    const next = clamp(size, UI_FONT_MIN, UI_FONT_MAX)
    try {
      localStorage.setItem(UI_FONT_KEY, String(next))
    } catch {
      // 忽略隐私模式下的写入失败
    }
    applyUiFontSize(next)
    set({ uiFontSize: next })
  },

  setEditorFontSize(size) {
    const next = clamp(size, EDITOR_FONT_MIN, EDITOR_FONT_MAX)
    try {
      localStorage.setItem(EDITOR_FONT_KEY, String(next))
    } catch {
      // 同上
    }
    set({ editorFontSize: next })
  },

  reset() {
    get().setUiFontSize(DEFAULT_UI_FONT)
    get().setEditorFontSize(DEFAULT_EDITOR_FONT)
  },
}))
