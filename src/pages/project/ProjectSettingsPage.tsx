import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, GitMerge, Save } from 'lucide-react'
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/ui'
import { useProjectStore } from '@/stores/projectStore'
import { PROJECT_STATUS_LABELS, PROJECT_TEMPLATE_LABELS } from '@/types/project'
import type { Project, ProjectMode, ProjectStatus } from '@/types/project'
import { PROJECT_GENRES } from '@/components/project/ProjectFormModal'
import AIConfigPanel from '@/components/ai/AIConfigPanel'
import BackupPanel from '@/components/backup/BackupPanel'
import MergeWizardModal from '@/components/settings/MergeWizardModal'
import { buildMergePlan, type MergePlan } from '@/services/merge'
import { readFileAsText } from '@/utils/common'

const NARRATIONS = ['第三人称限知视角', '第三人称全知视角', '第一人称', '多视角', '其他']

function splitTags(text: string): string[] {
  return text
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 项目设置页（US-002：打开已有项目，编辑基础设置并保存） */
export default function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { getProject, updateProject } = useProjectStore()
  const project = getProject(projectId ?? '')

  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Project | null>(null)
  const [mergePlan, setMergePlan] = useState<MergePlan | null>(null) // US-1002
  const mergeFileRef = useRef<HTMLInputElement>(null)

  // 项目数据变化时同步到表单
  useEffect(() => {
    if (project) {
      setForm({ ...project, worldSetting: { ...project.worldSetting }, timeSetting: { ...project.timeSetting }, chapterDefaults: { ...project.chapterDefaults } })
      setSaved(false)
    }
  }, [project?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!project || !form) return null

  function set<K extends keyof Project>(key: K, value: Project[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!project || !form) return
    setSaving(true)
    try {
      const patch: Partial<Omit<Project, 'id'>> = {
        name: form.name.trim(),
        penName: form.penName?.trim() || undefined,
        genre: form.genre.trim() || '其他',
        tagline: form.tagline?.trim() || undefined,
        status: form.status,
        tags: splitTags((form.tags ?? []).join(',')),
        narration: form.narration,
        mode: form.mode,
        worldSetting: {
          freeText: form.worldSetting.freeText,
          tags: splitTags(form.worldSetting.tags.join(',')),
        },
        timeSetting: {
          start: form.timeSetting.start?.trim() || undefined,
          flowRate: form.timeSetting.flowRate,
          allowFuzzy: form.timeSetting.allowFuzzy,
        },
        chapterDefaults: {
          targetWords: Number(form.chapterDefaults.targetWords) || 0,
          namingRule: form.chapterDefaults.namingRule,
        },
      }
      await updateProject(project.id, patch)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  /** US-1002：选择他人/其它设备导出的项目 JSON，进入合并向导 */
  async function handleMergeFile(file: File) {
    if (!projectId) return
    try {
      const text = await readFileAsText(file)
      setMergePlan(await buildMergePlan(projectId, text))
    } catch (err) {
      window.alert(`无法解析该文件：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-900">项目设置</h1>
          <p className="mt-0.5 text-sm text-stone-500">修改内容实时保存到本地 IndexedDB</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle2 className="size-4" /> 已保存
            </span>
          )}
          <Button type="submit" variant="primary" loading={saving}>
            <Save className="size-4" /> 保存设置
          </Button>
        </div>
      </div>

      {/* 基本信息 */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-400">基本信息</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="书名" required>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </Field>
          <Field label="笔名 / 作者">
            <Input value={form.penName ?? ''} onChange={(e) => set('penName', e.target.value)} placeholder="可选" />
          </Field>
          <Field label="类型" hint="玄幻、都市、言情、悬疑……">
            <Input value={form.genre} onChange={(e) => set('genre', e.target.value)} list="genre-options" />
            <datalist id="genre-options">
              {PROJECT_GENRES.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
          <Field label="状态">
            <Select
              value={form.status}
              onChange={(e) => set('status', e.target.value as ProjectStatus)}
            >
              {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="一句话简介">
              <Textarea rows={2} value={form.tagline ?? ''} onChange={(e) => set('tagline', e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="项目标签" hint="逗号分隔，如：爽文,群像,复仇">
              <Input value={(form.tags ?? []).join(', ')} onChange={(e) => set('tags', splitTags(e.target.value))} />
            </Field>
          </div>
        </div>
      </section>

      {/* 创作模式 */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-400">创作模式与方法论</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="项目模板">
            <div className="flex h-9 items-center">
              <Badge color="violet">{PROJECT_TEMPLATE_LABELS[form.template]}</Badge>
            </div>
          </Field>
          <Field label="模式" hint="可随时切换，数据互通">
            <div className="flex gap-3">
              <ModeCard active={form.mode === 'guided'} title="引导模式" desc="结构化流程引导" onClick={() => set('mode', 'guided' as ProjectMode)} />
              <ModeCard active={form.mode === 'free'} title="自由模式" desc="隐藏结构化字段" onClick={() => set('mode', 'free' as ProjectMode)} />
            </div>
          </Field>
          <Field label="叙事视角">
            <Select value={form.narration ?? ''} onChange={(e) => set('narration', e.target.value || undefined)}>
              <option value="">未设置</option>
              {NARRATIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      {/* 世界观 */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-400">世界观设定</h2>
        <div className="space-y-4">
          <Field label="自由文本" hint="力量体系、社会规则、种族、魔法/科技水平、历史背景……">
            <Textarea
              rows={5}
              value={form.worldSetting.freeText}
              onChange={(e) => setForm((f) => (f ? { ...f, worldSetting: { ...f.worldSetting, freeText: e.target.value } } : f))}
              placeholder="例如：修炼境界分为炼气、筑基、金丹……"
            />
          </Field>
          <Field label="标签" hint="逗号分隔，如：修真体系,宗门制">
            <Input
              value={form.worldSetting.tags.join(', ')}
              onChange={(e) =>
                setForm((f) => (f ? { ...f, worldSetting: { ...f.worldSetting, tags: splitTags(e.target.value) } } : f))
              }
            />
          </Field>
        </div>
      </section>

      {/* 时间与章节预设 */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-400">时间与章节预设</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="故事起始时间" hint="如 2024-03-15">
            <Input
              value={form.timeSetting.start ?? ''}
              onChange={(e) => setForm((f) => (f ? { ...f, timeSetting: { ...f.timeSetting, start: e.target.value } } : f))}
            />
          </Field>
          <Field label="时间流速" hint="现实:故事，如 1:30 填 30">
            <Input
              type="number"
              min={1}
              placeholder="30"
              value={form.timeSetting.flowRate ?? ''}
              onChange={(e) =>
                setForm((f) => (f ? { ...f, timeSetting: { ...f.timeSetting, flowRate: e.target.value ? Number(e.target.value) : undefined } } : f))
              }
            />
          </Field>
          <Field label="每章目标字数">
            <Input
              type="number"
              min={0}
              step={500}
              value={form.chapterDefaults.targetWords}
              onChange={(e) =>
                setForm((f) => (f ? { ...f, chapterDefaults: { ...f.chapterDefaults, targetWords: Number(e.target.value) || 0 } } : f))
              }
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="章节命名规则" hint="支持 {X} 与 {标题} 占位符，如：第X章 {标题}">
              <Input
                value={form.chapterDefaults.namingRule}
                onChange={(e) => setForm((f) => (f ? { ...f, chapterDefaults: { ...f.chapterDefaults, namingRule: e.target.value } } : f))}
              />
            </Field>
          </div>
          <label className="flex items-start gap-2 pt-6 text-sm text-stone-700">
            <input
              type="checkbox"
              className="mt-0.5 accent-violet-600"
              checked={form.timeSetting.allowFuzzy}
              onChange={(e) => setForm((f) => (f ? { ...f, timeSetting: { ...f.timeSetting, allowFuzzy: e.target.checked } } : f))}
            />
            允许模糊时间（如“春天”“三年后”）
          </label>
        </div>
      </section>

      {/* AI 服务配置（US-801）与自动备份（US-702/703）：面板内按钮均为 type=button，不会提交项目表单 */}
      <AIConfigPanel />
      <BackupPanel projectId={projectId ?? ''} />

      {/* 协作与合并（US-1002）：交换项目 JSON 后逐项合并差异 */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-400">协作与合并（US-1002）</h2>
        <p className="mb-3 text-sm text-stone-500">
          数据全部在本地：与他人协作时交换导出的项目 JSON，可在此逐项比对并合并差异（默认勾选「远端新增 / 远端更新」，
          「本地更新」「远端缺失」需手动确认，避免误覆盖或误删）。
        </p>
        <input
          ref={mergeFileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void handleMergeFile(file)
          }}
        />
        <Button type="button" variant="secondary" onClick={() => mergeFileRef.current?.click()}>
          <GitMerge className="size-4" /> 选择项目文件合并…
        </Button>
      </section>

      {mergePlan && projectId && (
        <MergeWizardModal
          projectId={projectId}
          plan={mergePlan}
          onClose={() => setMergePlan(null)}
          onApplied={(count) => {
            setMergePlan(null)
            window.alert(`已合并 ${count} 项，切换到其它模块即可看到更新后的数据。`)
          }}
        />
      )}
    </form>
  )
}

function ModeCard({ active, title, desc, onClick }: { active: boolean; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl border p-3 text-left transition-colors cursor-pointer ${
        active ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-500/20' : 'border-stone-200 hover:border-stone-300'
      }`}
    >
      <span className="block text-sm font-medium text-stone-800">{title}</span>
      <span className="mt-0.5 block text-xs text-stone-500">{desc}</span>
    </button>
  )
}
