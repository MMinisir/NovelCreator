import type { CSSProperties } from 'react'
import { RotateCcw, Type } from 'lucide-react'
import { Button, cn } from '@/components/ui'
import AIConfigPanel from '@/components/ai/AIConfigPanel'
import {
  DEFAULT_EDITOR_FONT,
  DEFAULT_UI_FONT,
  EDITOR_FONT_MAX,
  EDITOR_FONT_MIN,
  UI_FONT_MAX,
  UI_FONT_MIN,
  useSettingsStore,
} from '@/stores/settingsStore'

const UI_PRESETS = [
  { label: '小', value: 15 },
  { label: '标准', value: 16 },
  { label: '大', value: 18 },
  { label: '特大', value: 20 },
]

const EDITOR_PRESETS = [14, 16, 18, 20, 24, 28]

/** 全局设置页（不绑定项目）：界面字号 / 写作区字号 / AI 服务配置 */
export default function AppSettingsPage() {
  const uiFontSize = useSettingsStore((s) => s.uiFontSize)
  const editorFontSize = useSettingsStore((s) => s.editorFontSize)
  const setUiFontSize = useSettingsStore((s) => s.setUiFontSize)
  const setEditorFontSize = useSettingsStore((s) => s.setEditorFontSize)
  const reset = useSettingsStore((s) => s.reset)

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6 lg:px-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-stone-900">设置</h1>
        <p className="mt-0.5 text-sm text-stone-500">
          全局设置：对所有项目生效，仅保存在本机（浏览器 localStorage / 桌面版本地数据）
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* 字号 */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-400">
            <Type className="size-4" /> 字号
          </h2>
          <p className="mt-1 text-xs text-stone-400">调整后立即生效，无需保存。</p>

          {/* 界面字号 */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-stone-700">界面字号</span>
              <span className="text-xs text-stone-400">
                {uiFontSize}px 基准（默认 {DEFAULT_UI_FONT}px）
              </span>
            </div>
            <input
              type="range"
              min={UI_FONT_MIN}
              max={UI_FONT_MAX}
              step={1}
              value={uiFontSize}
              onChange={(e) => setUiFontSize(Number(e.target.value))}
              className="w-full cursor-pointer accent-violet-600"
              aria-label="界面字号"
            />
            <div className="flex flex-wrap gap-1.5">
              {UI_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setUiFontSize(preset.value)}
                  className={cn(
                    'cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors',
                    uiFontSize === preset.value
                      ? 'border-violet-300 bg-violet-700 text-white'
                      : 'border-stone-200 bg-white text-stone-500 hover:border-violet-300 hover:text-violet-700',
                  )}
                >
                  {preset.label} {preset.value}px
                </button>
              ))}
            </div>
            <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
              影响整个界面：标题、正文、按钮与间距会按比例一起缩放（相当于整体界面缩放）。
            </p>
          </div>

          <div className="my-4 h-px bg-stone-100" />

          {/* 写作区正文字号 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-stone-700">写作区正文字号</span>
              <span className="text-xs text-stone-400">
                {editorFontSize}px（默认 {DEFAULT_EDITOR_FONT}px）
              </span>
            </div>
            <input
              type="range"
              min={EDITOR_FONT_MIN}
              max={EDITOR_FONT_MAX}
              step={1}
              value={editorFontSize}
              onChange={(e) => setEditorFontSize(Number(e.target.value))}
              className="w-full cursor-pointer accent-violet-600"
              aria-label="写作区正文字号"
            />
            <div className="flex flex-wrap gap-1.5">
              {EDITOR_PRESETS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEditorFontSize(value)}
                  className={cn(
                    'cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors',
                    editorFontSize === value
                      ? 'border-violet-300 bg-violet-700 text-white'
                      : 'border-stone-200 bg-white text-stone-500 hover:border-violet-300 hover:text-violet-700',
                  )}
                >
                  {value}px
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-stone-200 bg-stone-50/60 px-3 py-2">
              <p className="mb-1.5 text-[11px] text-stone-400">
                正文预览（标题会随正文字号一起缩放）：
              </p>
              <div
                className="prose-editor text-stone-700"
                style={{ '--editor-font-size': `${editorFontSize}px` } as CSSProperties}
              >
                <h3>第三章 后山迷雾</h3>
                <p>他握紧了那枚玉简，指节泛白——后山的雾里，有什么东西正在等着他。</p>
              </div>
            </div>
            <p className="text-xs text-stone-400">只影响写作区正文编辑器，不影响界面其它文字。</p>
          </div>

          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="ghost" onClick={reset}>
              <RotateCcw className="size-3.5" /> 恢复默认
            </Button>
          </div>
        </section>

        {/* AI 服务配置（全局，跨项目共用） */}
        <div className="space-y-5">
          <AIConfigPanel />
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">关于 AI 配置</h2>
            <p className="mt-2 text-xs leading-relaxed text-stone-500">
              API Key 仅保存在本机（浏览器 localStorage；桌面版为本地应用数据），不会上传、不随项目导出。
              所有 AI 生成入口（梗概 / 大纲 / 小传 / 关系建议 / 润色 / 章节正文 / 一致性 / 体检解读 / 角色卡）
              共用这份配置，跨项目生效。
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
