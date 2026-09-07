import type { AIProviderConfig } from './types'

/**
 * AI 配置持久化（Sprint 7 US-801）。
 * 配置属用户级（跨项目共享），存 localStorage；API Key 仅保存在本机浏览器，
 * 前端直连第三方 LLM 有密钥暴露与 CORS 风险，生产建议自建代理并将 baseURL 指向代理地址。
 */

const STORAGE_KEY = 'novel-creator.ai-config.v1'

/** 常用 OpenAI 兼容服务预设（providerId 统一走 openai 兼容实现） */
export interface AIProviderPreset {
  key: string
  name: string
  baseURL: string
  model: string
  hint: string
}

export const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
  {
    key: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    hint: '官方接口，需科学上网环境',
  },
  {
    key: 'deepseek',
    name: 'DeepSeek（深度求索）',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    hint: '国产高性价比，直连可用',
  },
  {
    key: 'moonshot',
    name: 'Moonshot（月之暗面）',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    hint: '长文本中文创作',
  },
  {
    key: 'ollama',
    name: 'Ollama（本地）',
    baseURL: 'http://localhost:11434/v1',
    model: 'qwen2.5:7b',
    hint: '本地模型，无需联网（需先安装 Ollama）',
  },
  {
    key: 'custom',
    name: '自定义（OpenAI 兼容）',
    baseURL: '',
    model: '',
    hint: '自建代理或任意 OpenAI 兼容端点',
  },
]

export function loadAIConfig(): AIProviderConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw) as AIProviderConfig
    if (!cfg?.apiKey || !cfg?.baseURL) return null
    return { ...cfg, providerId: cfg.providerId || 'openai' }
  } catch {
    return null
  }
}

export function saveAIConfig(config: AIProviderConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearAIConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/** 是否与某个预设一致（用于 UI 选中态） */
export function matchPreset(config: AIProviderConfig): string {
  const hit = AI_PROVIDER_PRESETS.find((p) => p.baseURL && p.baseURL === config.baseURL)
  return hit?.key ?? 'custom'
}
