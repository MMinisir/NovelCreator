import { useEffect } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  Clock,
  Flag,
  LayoutDashboard,
  Lightbulb,
  ListTree,
  MapPin,
  PenLine,
  Settings,
  Share2,
  Users,
} from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
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
  { path: 'settings', label: '项目设置', icon: Settings },
]

/** 项目工作台：二级导航 + 内容区（设计文档 §6.1） */
export default function ProjectWorkspace() {
  const { projectId } = useParams<{ projectId: string }>()
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject)
  const project = useProjectStore((s) => s.getProject(projectId ?? ''))

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
    <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6 lg:px-6">
      <aside className="hidden w-52 shrink-0 md:block">
        <Link
          to="/projects"
          className="mb-4 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-violet-700"
        >
          <ArrowLeft className="size-4" /> 全部项目
        </Link>
        <nav className="space-y-0.5">
          {MODULES.map((m) => (
            <NavLink
              key={m.path || 'overview'}
              to={m.path}
              end={m.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-violet-100 font-medium text-violet-800'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                }`
              }
            >
              <m.icon className="size-4 shrink-0" />
              {m.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <section className="min-w-0 flex-1">
        <Outlet />
      </section>
    </div>
  )
}
