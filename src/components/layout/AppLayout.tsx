import { useEffect, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { BookOpenText, Search, TextCursorInput } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { usePromptStore } from '@/services/ai/templates'
import GlobalSearchModal from '@/components/search/GlobalSearchModal'

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
const SHORTCUT = IS_MAC ? '⌘K' : 'Ctrl K'

/** 全局布局：顶栏 + 主内容区（设计文档 §6.1 顶部工具栏） */
export default function AppLayout() {
  const currentProject = useProjectStore((s) => s.currentProject())
  const [searchOpen, setSearchOpen] = useState(false)

  // 全局搜索快捷键：Cmd/Ctrl + K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 启动时加载全局 AI 提示词模板（覆盖/自定义），保证渲染与生成走同一份配置
  useEffect(() => {
    void usePromptStore.getState().load()
  }, [])

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="flex h-14 items-center gap-4 px-4 lg:px-6">
          <Link to="/projects" className="flex items-center gap-2 text-stone-900">
            <span className="flex size-8 items-center justify-center rounded-lg bg-violet-700 text-white">
              <BookOpenText className="size-4.5" />
            </span>
            <span className="hidden text-base font-bold tracking-wide sm:block">
              NovelCreator<span className="ml-1.5 font-normal text-stone-400">小说创作工作台</span>
            </span>
          </Link>

          {currentProject && (
            <span className="hidden truncate rounded-lg bg-stone-100 px-3 py-1 text-sm text-stone-600 md:inline-flex">
              当前项目：{currentProject.name}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/prompts"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm text-stone-600 transition-colors hover:border-violet-300 hover:text-violet-700"
            >
              <TextCursorInput className="size-4" />
              <span className="hidden md:inline">提示词管理</span>
            </Link>
            {/* 全局搜索（跨实体）：桌面端搜索框，小屏折叠为图标按钮 */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden cursor-pointer items-center gap-2 rounded-full border border-stone-200 bg-stone-50 py-1.5 pl-3 pr-2 text-sm text-stone-400 transition-colors hover:border-violet-300 hover:text-stone-600 lg:flex"
            >
              <Search className="size-4" />
              <span className="w-44 text-left">搜索人物 / 章节 / 伏笔…</span>
              <kbd className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[10px] text-stone-500">{SHORTCUT}</kbd>
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="全局搜索"
              className="cursor-pointer rounded-full p-2 text-stone-500 transition-colors hover:bg-stone-100 lg:hidden"
            >
              <Search className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>

      {searchOpen && <GlobalSearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  )
}
