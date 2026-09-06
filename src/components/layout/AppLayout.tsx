import { Link, Outlet } from 'react-router-dom'
import { BookOpenText, Search } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'

/** 全局布局：顶栏 + 主内容区（设计文档 §6.1 顶部工具栏） */
export default function AppLayout() {
  const currentProject = useProjectStore((s) => s.currentProject())

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
            <div className="relative hidden lg:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
              <input
                placeholder="全局搜索（开发中）"
                disabled
                className="w-64 cursor-not-allowed rounded-full border border-stone-200 bg-stone-50 py-1.5 pl-9 pr-4 text-sm text-stone-400"
              />
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
