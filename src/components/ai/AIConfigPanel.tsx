import { useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, Save, Trash2, XCircle } from 'lucide-react'
import { Badge, Button, Field, Input, Select } from '@/components/ui'
import { AI_PROVIDER_PRESETS, clearAIConfig, loadAIConfig, matchPreset, saveAIConfig } from '@/services/ai/config'
import { createAIProvider } from '@/services/ai/openaiCompat'
import type { AIProviderConfig } from '@/services/ai/types'

/** AI 服务配置面板（Sprint 7 US-801）：API Key / 模型 / 端点 + 测试连接 */
export default function AIConfigPanel() {
  const [presetKey, setPresetKey] = useState('openai')
  const [baseURL, setBaseURL] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(2048)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    const cfg = loadAIConfig()
    if (!cfg) return
    setPresetKey(matchPreset(cfg))
    setBaseURL(cfg.baseURL ?? '')
    setModel(cfg.model)
    setApiKey(cfg.apiKey)
    setTemperature(cfg.temperature ?? 0.7)
    setMaxTokens(cfg.maxTokens ?? 2048)
  }, [])

  function applyPreset(key: string) {
    setPresetKey(key)
    const preset = AI_PROVIDER_PRESETS.find((p) => p.key === key)
    if (!preset) return
    if (preset.key !== 'custom') {
      setBaseURL(preset.baseURL)
      setModel(preset.model)
    }
    setResult(null)
  }

  function currentConfig(): AIProviderConfig {
    return {
      providerId: 'openai',
      baseURL: baseURL.trim(),
      apiKey: apiKey.trim(),
      model: model.trim() || 'gpt-4o-mini',
      temperature,
      maxTokens,
    }
  }

  function handleSave() {
    saveAIConfig(currentConfig())
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleTest() {
    if (!apiKey.trim()) {
      setResult({ ok: false, message: '请先填写 API Key' })
      return
    }
    setTesting(true)
    setResult(null)
    try {
      const res = await createAIProvider(currentConfig()).testConnection()
      setResult({ ok: res.ok, message: res.message ?? (res.ok ? '连接成功' : '连接失败') })
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setTesting(false)
    }
  }

  function handleClear() {
    clearAIConfig()
    setApiKey('')
    setResult(null)
    setSaved(false)
  }

  const preset = AI_PROVIDER_PRESETS.find((p) => p.key === presetKey)

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">AI 服务配置</h2>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle2 className="size-4" /> 已保存
            </span>
          )}
          <Button type="button" variant="secondary" loading={testing} onClick={() => void handleTest()}>
            测试连接
          </Button>
          <Button type="button" variant="primary" onClick={handleSave}>
            <Save className="size-4" /> 保存配置
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="服务商预设" hint={preset?.hint}>
          <Select value={presetKey} onChange={(e) => applyPreset(e.target.value)}>
            {AI_PROVIDER_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="API Key" required hint="仅保存在本机浏览器（localStorage），不会上传">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            autoComplete="off"
          />
        </Field>
        <Field label="接口地址 baseURL">
          <Input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://api.deepseek.com/v1" />
        </Field>
        <Field label="模型">
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-chat" />
        </Field>
        <Field label="温度" hint="0 更严谨，1 更发散">
          <Input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="最大输出 tokens">
          <Input
            type="number"
            min={256}
            step={256}
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value) || 2048)}
          />
        </Field>
      </div>

      {result && (
        <div
          className={`mt-4 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
            result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
          <span className="break-all">{result.message}</span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-3 text-xs text-stone-500">
        <span className="flex items-center gap-1.5">
          <KeyRound className="size-3.5" />
          浏览器直连第三方接口可能受 CORS 限制；如遇跨域失败，请自建代理并把 baseURL 指向代理地址。
        </span>
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="size-3.5" /> 清除本机配置
        </button>
      </div>
    </section>
  )
}

/** 未配置 AI 时的提示徽标（各生成入口复用） */
export function AIConfigMissingHint() {
  return (
    <Badge color="amber">请先在顶栏「设置 → AI 服务配置」填写 API Key</Badge>
  )
}
