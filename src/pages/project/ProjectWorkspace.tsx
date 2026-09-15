import { useEffect } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  BookOpen,
  CalendarClock,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Flag,
  HeartPulse,
  LayoutDashboard,
  Lightbulb,
  ListTree,
  MapPin,
  PenLine,
  Settings,
  Share2,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAutoBackup } from '@/hooks/useAutoBackup'
import { EmptyState } from '@/components/ui'

const MODULES = [
  { path: '', label: '项目概览', icon: LayoutDashboard, end: true },
  { path: 'characters', label: '人物', icon: Users },
  { path: 'locations', label: '地点', icon: MapPin },
  { path: 'events', label: '事件', icon: CalendarClock },
  { path: 'outline', label: '大纲', icon: ListTree },
  { path: 'timeline', label: '时间线', icon: Clock },
  { path: 'graph', label: '关系图', icon: Share2 },
  { path: 'foreshadowing', label: '伏笔', icon: Flag },
  { path: 'writing', label: '写作区', icon: PenLine },
  { path: 'ideas', label: '灵感碎片', icon: Lightbulb },
  { path: 'consistency', label: '一致性检查', icon: ShieldCheck },
  { path: 'health', label: '体检报告', icon: HeartPulse },
  { path: 'ai-log', label: 'AI 请求', icon: Activity },
  { path: 'settings', label: '项目设置', icon: Settings },
]

/** 侧栏菜单项样式；收起为纯图标时居中，靠 title 提示名称 */
function navItemClass(active: boolean, collapsed: boolean): string {
  return `mb-0.5 flex items-center gap-2.5 rounded-lg py-2 text-sm transition-colors ${
    collapsed ? 'justify-center px-0' : 'px-3'
  } ${
    active ? 'bg-violet-100 font-medium text-violet-800' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
  }`
}

/** 项目工作台：二级导航 + 内容区（设计文档 §6.1） */
export default function ProjectWorkspace() {
  const { projectId } = useParams<{ projectId: string }>()
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject)
  const project = useProjectStore((s) => s.getProject(projectId ?? ''))
  // 桌面端侧栏可收起为纯图标（本机偏好，持久化于全局设置）
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const toggleSidebarCollapsed = useSettingsStore((s) => s.toggleSidebarCollapsed)

  useEffect(() => {
    if (projectId) setCurrentProject(projectId)
    return () => setCurrentProject(null)
  }, [projectId, setCurrentProject])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  // Sprint 7 US-702：项目打开期间按间隔自动备份
  useAutoBackup(projectId, project?.name)

  if (!project) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <EmptyState
          icon={<BookOpen className="size-6" />}
          title="未找到该项目"
          description="项目可能已被删除，请返回项目列表。"
          action={
            <Link to="/projects" className="text-sm font-medium text-violet-600 hover:text-violet-800">
              返回项目列表
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-[1800px] flex-col gap-6 px-4 py-4 md:h-[calc(100vh-3.5rem)] md:flex-row md:gap-6 md:overflow-hidden lg:px-6">
      {/*
        左侧菜单（桌面端）：固定视口高度 + 自身独立滚动，
        与右侧内容区互不影响——右侧内容再长也能随时快速切换页签。
        收起后仅显示图标（宽度 3.5rem），状态记在本机偏好里。
      */}
      <aside
        className={`hidden shrink-0 flex-col md:flex ${
          sidebarCollapsed ? 'w-14' : 'w-52'
        } transition-[width] duration-200`}
      >
        <div className={`flex h-8 shrink-0 items-center pb-1 ${sidebarCollapsed ? 'justify-center' : 'justify-end'}`}>
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            title={sidebarCollapsed ? '展开菜单' : '收起为图标'}
            aria-label={sidebarCollapsed ? '展开菜单' : '收起为图标'}
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
          >
            {sidebarCollapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto pr-1">
          <Link
            to="/projects"
            title={sidebarCollapsed ? '全部项目' : undefined}
            className={navItemClass(false, sidebarCollapsed)}
          >
            <ArrowLeft className="size-4 shrink-0" />
            {!sidebarCollapsed && '全部项目'}
          </Link>
          <div className="my-1.5 border-t border-stone-200" />
          {MODULES.map((m) => (
            <NavLink
              key={m.path || 'overview'}
              to={m.path}
              end={m.end}
              title={sidebarCollapsed ? m.label : undefined}
              className={({ isActive }) => navItemClass(isActive, sidebarCollapsed)}
            >
              <m.icon className="size-4 shrink-0" />
              {!sidebarCollapsed && m.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* 右侧内容区：桌面端独立滚动（小屏仍为整页滚动，避免移动端视口高度抖动） */}
      <section className="min-w-0 flex-1 md:overflow-y-auto md:pr-1">
        {/* 移动端模块导航（Sprint 9 US-902：小屏隐藏左侧栏，改用横向 tab） */}
        <nav className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1 md:hidden">
          {MODULES.map((m) => (
            <NavLink
              key={m.path || 'overview'}
              to={m.path}
              end={m.end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-violet-700 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900'
                }`
              }
            >
              <m.icon className="size-3.5" />
              {m.label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </section>
    </div>
  )
}
