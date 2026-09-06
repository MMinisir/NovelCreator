import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Input, Modal, Select } from '@/components/ui'
import { useProjectStore } from '@/stores/projectStore'
import type { Project, ProjectInput, ProjectStatus, ProjectTemplate } from '@/types/project'
import { PROJECT_STATUS_LABELS, PROJECT_TEMPLATE_LABELS } from '@/types/project'

export const PROJECT_GENRES = ['玄幻', '都市', '言情', '悬疑', '科幻', '历史', '奇幻', '武侠', '现实', '其他']

const TEMPLATE_DESC: Record<ProjectTemplate, string> = {
  webnovel: '预置黄金三章、爽点节奏等网文方法论结构',
  literary: '面向传统文学创作的三幕式与角色弧光引导',
  script: '剧本杀 / 互动叙事专用结构模板',
  blank: '空白项目，结构完全自由，适合自由模式',
}

const STATUS_OPTIONS: ProjectStatus[] = ['idea', 'writing', 'paused', 'finished']

export function ProjectFormModal({
  open,
  onClose,
  initial,
}: {
  open: boolean
  onClose: () => void
  /** 传入表示编辑模式 */
  initial?: Project | null
}) {
  const navigate = useNavigate()
  const createProject = useProjectStore((s) => s.createProject)
  const updateProject = useProjectStore((s) => s.updateProject)

  const editing = Boolean(initial)
  const [name, setName] = useState(initial?.name ?? '')
  const [genre, setGenre] = useState(initial?.genre ?? PROJECT_GENRES[0])
  const [penName, setPenName] = useState(initial?.penName ?? '')
  const [tagline, setTagline] = useState(initial?.tagline ?? '')
  const [template, setTemplate] = useState<ProjectTemplate>(initial?.template ?? 'webnovel')
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? 'idea')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('请填写书名')
      return
    }
    setSaving(true)
    setError('')
    try {
      const input: ProjectInput = { name, genre, penName, tagline, template, status }
      if (initial) {
        await updateProject(initial.id, input)
        onClose()
      } else {
        const created = await createProject(input)
        onClose()
        navigate(`/projects/${created.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? '编辑项目' : '新建项目'}
      description={editing ? '修改项目基础信息' : '创建属于你的故事项目，数据将保存在本地浏览器（IndexedDB）'}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form="project-form" variant="primary" loading={saving}>
            {editing ? '保存修改' : '创建项目'}
          </Button>
        </>
      }
    >
      <form id="project-form" onSubmit={handleSubmit} className="space-y-5">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="书名" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="《我的小说》" autoFocus />
          </Field>
          <Field label="笔名 / 作者">
            <Input value={penName} onChange={(e) => setPenName(e.target.value)} placeholder="可选" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="类型">
            <Select value={genre} onChange={(e) => setGenre(e.target.value)}>
              {PROJECT_GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="状态">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="一句话简介" hint="用于快速识别项目核心，可在项目设置中完善">
          <TextareaBlock value={tagline} onChange={setTagline} />
        </Field>

        {!editing && (
          <Field label="项目模板" hint="模板会预置对应的大纲结构与引导流程（详细设计文档 §2.1.1）">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(Object.keys(PROJECT_TEMPLATE_LABELS) as ProjectTemplate[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTemplate(t)}
                  className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                    template === t
                      ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-500/20'
                      : 'border-stone-200 bg-white hover:border-stone-300'
                  }`}
                >
                  <span className="block text-sm font-medium text-stone-800">{PROJECT_TEMPLATE_LABELS[t]}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-stone-500">{TEMPLATE_DESC[t]}</span>
                </button>
              ))}
            </div>
          </Field>
        )}
      </form>
    </Modal>
  )
}

function TextareaBlock({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <textarea className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)} rows={2} placeholder="可选" />
}
