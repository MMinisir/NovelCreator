import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/ui'
import {
  DEFAULT_PROMPT_CONTENT,
  PROMPT_TEMPLATE_DEFS,
  TASK_KEYS,
  TASK_LABELS,
  usePromptStore,
  type PromptTemplateKey,
  type TaskKind,
} from '@/services/ai/templates'

/** 覆盖展示顺序：系统提示在前，其后为各生成任务 */
const ORDERED_KEYS: PromptTemplateKey[] = ['system', ...TASK_KEYS]

/** 单条内置模板编辑卡（系统提示 / 生成任务） */
function BuiltinCard({ keyOf }: { keyOf: PromptTemplateKey }) {
  const def = PROMPT_TEMPLATE_DEFS[keyOf]
  const override = usePromptStore((s) => s.overrides[keyOf])
  const saveOverride = usePromptStore((s) => s.saveOverride)
  const restoreOverride = usePromptStore((s) => s.restoreOverride)
  const [draft, setDraft] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const base = DEFAULT_PROMPT_CONTENT[keyOf]
  const current = override ?? base
  const editing = draft ?? current
  const dirty = editing !== current

  async function handleSave() {
    setSaving(true)
    try {
      await saveOverride(keyOf, editing)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-stone-800">
          {def.label}
          {keyOf === 'system' && <span className="ml-2 text-xs font-normal text-stone-400">所有 AI 请求共用</span>}
        </h3>
        {override != null && <Badge color="violet">已自定义</Badge>}
        {dirty && <Badge color="amber">未保存修改</Badge>}
        <span className="ml-auto text-xs text-stone-400">{editing.length} 字</span>
      </div>
      <p className="mb-3 text-xs text-stone-500">{def.description}</p>
      <Textarea
        rows={keyOf === 'system' ? 6 : 9}
        value={editing}
        onChange={(e) => setDraft(e.target.value)}
        className="font-mono text-xs"
      />
      {def.variables.length > 0 && (
        <div className="mt-2.5 rounded-xl bg-stone-50 p-3">
          <p className="mb-1.5 text-[11px] font-medium text-stone-500">可用变量（生成时自动填充，勿删变量标记）</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {def.variables.map((v) => (
              <span key={v.name} className="text-[11px] text-stone-600" title={v.desc}>
                <code className="rounded bg-stone-200/70 px-1 py-0.5 font-mono text-violet-700">{`{{${v.name}}}`}</code>
                <span className="ml-1 text-stone-400">{v.desc}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        {dirty ? (
          <Button size="sm" variant="primary" loading={saving} onClick={() => void handleSave()}>
            {saved ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
            {saved ? '已保存' : '保存覆盖'}
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-stone-300">
            <Check className="size-3.5" /> {override != null ? '已应用自定义内容' : '使用内置默认'}
          </span>
        )}
        {override != null && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(null)
              void restoreOverride(keyOf)
            }}
            title="删除覆盖，恢复内置默认"
          >
            <RotateCcw className="size-3.5" /> 恢复默认
          </Button>
        )}
      </div>
    </section>
  )
}

/** 自定义模板卡 */
function CustomCard({ id }: { id: string }) {
  const item = usePromptStore((s) => s.customs.find((c) => c.id === id))
  const updateCustom = usePromptStore((s) => s.updateCustom)
  const removeCustom = usePromptStore((s) => s.removeCustom)
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState(item?.name ?? '')
  const [content, setContent] = useState(item?.content ?? '')
  const [saving, setSaving] = useState(false)

  if (!item) return null
  const target = item
  const def = PROMPT_TEMPLATE_DEFS[target.kind]
  const dirty = name !== target.name || content !== target.content

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await updateCustom(target.id, { name: name.trim(), content })
      setExpanded(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-stone-800">{item.name}</span>
        <Badge color="sky">{TASK_LABELS[item.kind]}</Badge>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
            编辑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            onClick={() => void removeCustom(item.id)}
          >
            <Trash2 className="size-3.5" /> 删除
          </Button>
        </div>
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-stone-500">{item.content}</p>
      {expanded && (
        <div className="mt-3 space-y-3 rounded-xl bg-stone-50 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="模板名称，如：侧重文笔的润色版" />
          </div>
          <div>
            <p className="mb-1 text-[11px] text-stone-500">
              可用变量（生成时自动填充，勿删标记）：{' '}
              {def.variables.map((v) => (
                <code key={v.name} className="mr-1 rounded bg-stone-200/70 px-1 font-mono text-[11px] text-violet-700" title={v.desc}>
                  {`{{${v.name}}}`}
                </code>
              ))}
            </p>
            <Textarea rows={10} value={content} onChange={(e) => setContent(e.target.value)} className="font-mono text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" disabled={!name.trim() || !dirty} loading={saving} onClick={() => void handleSave()}>
              <Save className="size-3.5" /> 保存
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setExpanded(false); setName(item.name); setContent(item.content) }}>
              取消
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** 提示词管理页（全局，路由 /prompts）：查看/覆盖全部内置提示词，维护自定义模板 */
export default function PromptTemplatesPage() {
  const hydrated = usePromptStore((s) => s.hydrated)
  const load = usePromptStore((s) => s.load)
  const customs = usePromptStore((s) => s.customs)
  const addCustom = usePromptStore((s) => s.addCustom)

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<TaskKind>('synopsis')
  const [content, setContent] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!hydrated) void load()
  }, [hydrated, load])

  async function handleCreate() {
    if (!name.trim()) {
      setFormError('请填写模板名称')
      return
    }
    if (!content.trim()) {
      setFormError('请填写模板内容（可留空变量由生成时自动填充）')
      return
    }
    setSaving(true)
    try {
      await addCustom({ name: name.trim(), kind, content })
      setName('')
      setContent('')
      setShowForm(false)
      setFormError('')
    } catch {
      setFormError('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const kindDef = PROMPT_TEMPLATE_DEFS[kind]

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6 lg:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">提示词管理</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            覆盖或新增所有 AI 提示词：修改立即对所有项目生效；生成/预览使用同一渲染（所见即所发）
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
          <Plus className="size-4" /> 新建自定义模板
        </Button>
      </div>

      <div className="mb-5 rounded-xl bg-violet-50 px-4 py-3 text-xs leading-relaxed text-violet-800">
        <p className="font-medium">使用说明</p>
        <p className="mt-1">
          · 模板支持 <code className="rounded bg-violet-100 px-1">{`{{变量}}`}</code> 插值；行内
          <code className="mx-1 rounded bg-violet-100 px-1">{`{{?变量}}…{{/变量}}`}</code> 为条件段：对应变量为空时整段不输出。
          <br />
          · 修改「系统提示」或内置任务提示 → 点「保存覆盖」即生效；「恢复默认」删除自定义内容。
          <br />
          · 新建的模板会出现在对应生成入口的「模板」下拉中（与内置默认并列），选中后生成与预览均使用该模板。
        </p>
      </div>

      {showForm && (
        <section className="mb-5 space-y-3 rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-800">新建自定义模板</h3>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
            <Field label="模板名称" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：强调冲突节奏的关系建议" />
            </Field>
            <Field label="作用任务" hint="出现在该任务的「模板」下拉">
              <Select value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
                {TASK_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {TASK_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            label="模板内容"
            hint={kindDef.variables.length ? `可用变量：${kindDef.variables.map((v) => `{{${v.name}}}（${v.desc}）`).join('、')}` : undefined}
          >
            <Textarea rows={10} value={content} onChange={(e) => setContent(e.target.value)} className="font-mono text-xs" />
          </Field>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" loading={saving} onClick={() => void handleCreate()}>
              <Plus className="size-3.5" /> 创建
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              取消
            </Button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {ORDERED_KEYS.map((keyOf) => (
          <BuiltinCard key={keyOf} keyOf={keyOf} />
        ))}
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-bold text-stone-900">自定义模板</h2>
          <Badge color="sky">{customs.length}</Badge>
          <Link to="/projects" className="ml-auto text-xs text-violet-700 hover:underline">
            回到项目列表
          </Link>
        </div>
        {customs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-400">
            还没有自定义模板。点右上角「新建自定义模板」，为某个人工智能任务准备多套提示词。
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {customs.map((c) => (
              <CustomCard key={c.id} id={c.id} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
