import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, Download, FileUp, MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react'
import { Badge, Button, ConfirmDialog, EmptyState, Input } from '@/components/ui'
import { ProjectFormModal } from '@/components/project/ProjectFormModal'
import { ImportDialog } from '@/components/project/ImportDialog'
import { useProjectStore } from '@/stores/projectStore'
import { PROJECT_STATUS_LABELS, PROJECT_TEMPLATE_LABELS } from '@/types/project'
import type { Project } from '@/types/project'
import { exportProjectToJson } from '@/services/exportImport'
import { downloadTextFile } from '@/utils/common'

/** 封面占位渐变（按类型哈希取色） */
const COVER_GRADIENTS = [
  'from-violet-500 to-indigo-500',
  'from-rose-500 to-orange-400',
  'from-emerald-500 to-teal-500',
  'from-sky-500 to-blue-600',
  'from-amber-500 to-yellow-500',
  'from-fuchsia-500 to-purple-600',
]

const STATUS_BADGE: Record<Project['status'], 'amber' | 'green' | 'slate' | 'violet'> = {
  idea: 'amber',
  writing: 'green',
  paused: 'slate',
  finished: 'violet',
}

function coverGradient(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return COVER_GRADIENTS[h % COVER_GRADIENTS.length]
}

/** 项目列表页（US-001 ~ US-005） */
export default function ProjectListPage() {
  const navigate = useNavigate()
  const { projects, loaded, loading, loadProjects, removeProject } = useProjectStore()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState<Project | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? projects.filter((p) => p.name.toLowerCase().includes(q) || (p.tagline ?? '').toLowerCase().includes(q))
      : projects
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [projects, query])

  async function handleExport(p: Project) {
    setBusyId(p.id)
    try {
      const json = await exportProjectToJson(p.id)
      downloadTextFile(`${p.name || 'project'}.novel.json`, json)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    await removeProject(deleting.id)
    setDeleting(null)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
      {/* 头部 */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif-sc text-2xl font-bold text-stone-900">我的项目</h1>
          <p className="mt-1 text-sm text-stone-500">所有数据仅保存在本地浏览器，可随时导出备份。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="subtle" onClick={() => setImporting(true)}>
            <FileUp className="size-4" /> 导入项目
          </Button>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> 新建项目
          </Button>
        </div>
      </div>

      {/* 搜索 */}
      <div className="relative mb-5 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索书名或简介…"
          className="pl-9"
        />
      </div>

      {loading && !loaded ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl bg-stone-200/70" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-6" />}
          title={query ? '没有匹配的项目' : '还没有项目'}
          description={query ? '换个关键词试试。' : '创建你的第一个小说项目，开启创作之旅。'}
          action={
            !query ? (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus className="size-4" /> 新建项目
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <div
              key={p.id}
              onClick={() => navigate(`/projects/${p.id}`)}
              className="group cursor-pointer overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              {/* 封面 */}
              {p.cover ? (
                <img src={p.cover} alt={p.name} className="h-28 w-full object-cover" />
              ) : (
                <div className={`h-28 w-full bg-gradient-to-br ${coverGradient(p.id)}`} />
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate font-serif-sc text-lg font-bold text-stone-900" title={p.name}>
                    {p.name}
                  </h3>
                  <Badge color={STATUS_BADGE[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 min-h-8 text-sm text-stone-500">{p.tagline || '暂无简介'}</p>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-stone-400">
                  <span className="rounded bg-stone-100 px-1.5 py-0.5">{p.genre}</span>
                  <span className="rounded bg-stone-100 px-1.5 py-0.5">{PROJECT_TEMPLATE_LABELS[p.template]}</span>
                  <span className="ml-auto">{new Date(p.updatedAt).toLocaleDateString('zh-CN')}</span>
                </div>
                {/* 悬停操作 */}
                <div className="mt-3 hidden items-center gap-1 border-t border-stone-100 pt-3 group-hover:flex">
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleExport(p) }} loading={busyId === p.id}>
                    <Download className="size-3.5" /> 导出
                  </Button>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDeleting(p) }}>
                    <Trash2 className="size-3.5" /> 删除
                  </Button>
                </div>
                {/* 移动端操作入口 */}
                <div className="mt-3 flex justify-end gap-1 group-hover:hidden">
                  <MoreHorizontal className="size-4 text-stone-300" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && <ProjectFormModal open onClose={() => setCreating(false)} />}
      {importing && (
        <ImportDialog
          open
          onClose={() => setImporting(false)}
          onImported={() => void loadProjects()}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="删除项目"
        description={
          deleting ? (
            <>
              确定删除项目「{deleting.name}」吗？其人物、地点、事件、大纲、正文等全部数据将一并从本地移除，此操作不可恢复。
            </>
          ) : undefined
        }
        confirmText="删除"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}
