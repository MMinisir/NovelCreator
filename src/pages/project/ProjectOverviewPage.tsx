import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, Download, FileUp, ListTree, Map as MapIcon, PenLine, Settings, Sprout, Trash2 } from 'lucide-react'
import { Badge, Button, ConfirmDialog, EmptyState } from '@/components/ui'
import { ImportDialog } from '@/components/project/ImportDialog'
import { useProjectStore } from '@/stores/projectStore'
import { PROJECT_STATUS_LABELS, PROJECT_TEMPLATE_LABELS } from '@/types/project'
import type { Project } from '@/types/project'
import { exportProjectToJson } from '@/services/exportImport'
import { downloadTextFile } from '@/utils/common'

const STATUS_BADGE: Record<Project['status'], 'amber' | 'green' | 'slate' | 'violet'> = {
  idea: 'amber',
  writing: 'green',
  paused: 'slate',
  finished: 'violet',
}

/** 项目概览页（US-002 项目详情展示 + 数据管理入口） */
export default function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { getProject, removeProject } = useProjectStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const project = getProject(projectId ?? '')

  if (!project) {
    return (
      <EmptyState
        icon={<MapIcon className="size-6" />}
        title="项目不存在"
        action={<Link to="/projects">返回项目列表</Link>}
      />
    )
  }

  async function handleExport() {
    if (!project) return
    setExporting(true)
    try {
      const json = await exportProjectToJson(project.id)
      downloadTextFile(`${project.name}.novel.json`, json)
    } finally {
      setExporting(false)
    }
  }

  async function handleDelete() {
    if (!project) return
    await removeProject(project.id)
    navigate('/projects')
  }

  const infoItems: Array<[string, React.ReactNode]> = [
    ['类型', project.genre],
    ['笔名', project.penName || '—'],
    ['模板', PROJECT_TEMPLATE_LABELS[project.template]],
    ['模式', project.mode === 'guided' ? '引导模式' : '自由模式'],
    ['叙事视角', project.narration || '—'],
    ['创建于', new Date(project.createdAt).toLocaleString('zh-CN')],
  ]

  return (
    <div className="space-y-5">
      {/* 头部 */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif-sc text-3xl font-bold text-stone-900">{project.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge color={STATUS_BADGE[project.status]}>{PROJECT_STATUS_LABELS[project.status]}</Badge>
              <Badge color="violet">{project.genre}</Badge>
              <Badge color="slate">{PROJECT_TEMPLATE_LABELS[project.template]}</Badge>
              {project.tags.map((t) => (
                <Badge key={t} color="sky">
                  {t}
                </Badge>
              ))}
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-600">{project.tagline || '暂无简介，可在项目设置中补充一句话简介。'}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="primary" onClick={() => navigate('settings')}>
              <Settings className="size-4" /> 项目设置
            </Button>
            <Button variant="subtle" onClick={() => navigate('writing')}>
              <PenLine className="size-4" /> 开始写作
            </Button>
            <Button variant="secondary" onClick={() => navigate('outline')}>
              <ListTree className="size-4" /> 查看大纲
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* 信息卡 */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">项目信息</h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {infoItems.map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-2 text-sm">
                <dt className="shrink-0 text-stone-400">{k}</dt>
                <dd className="truncate font-medium text-stone-800">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 rounded-xl bg-stone-50 p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-stone-600">
              <Sprout className="size-4 text-emerald-600" /> 世界观设定
            </h3>
            {project.worldSetting.freeText ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-600">{project.worldSetting.freeText}</p>
            ) : (
              <p className="text-sm text-stone-400">尚未填写，可在项目设置中补充力量体系、社会规则等世界观背景。</p>
            )}
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-stone-400">
            <CalendarDays className="size-3.5" />
            最后修改：{new Date(project.updatedAt).toLocaleString('zh-CN')}
          </div>
        </div>

        {/* 数据管理卡 */}
        <div className="space-y-5">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">数据管理</h2>
            <div className="space-y-2">
              <Button className="w-full justify-start" onClick={handleExport} loading={exporting}>
                <Download className="size-4" /> 导出项目 JSON
              </Button>
              <Button className="w-full justify-start" onClick={() => setImporting(true)}>
                <FileUp className="size-4" /> 从 JSON 导入
              </Button>
              <Button
                className="w-full justify-start"
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4 text-red-500" /> 删除项目
              </Button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-stone-400">
              提示：JSON 导出包含全部设定与正文。定期导出可避免浏览器数据意外丢失（执行案风险表 R1）。
            </p>
          </div>
        </div>
      </div>

      {importing && (
        <ImportDialog open onClose={() => setImporting(false)} />
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="删除项目"
        description={`确定删除项目「${project.name}」吗？其全部数据将不可恢复。`}
        confirmText="删除"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}
