import type { AIProvider, AIProviderConfig, AIChatOptions, TestConnectionResult } from './types'

export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1'
export const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini'

/** OpenAI 兼容 Provider 配置（providerId 固定 'openai'） */
export interface OpenAICompatConfig extends AIProviderConfig {
  providerId: 'openai'
}

/**
 * OpenAI 兼容 Provider（/chat/completions）。
 * 覆盖 OpenAI / DeepSeek / Moonshot / Ollama(openai 兼容层) 等绝大多数服务。
 * 浏览器直连受 CORS 限制，本地开发常用 Vite proxy 或本地代理转发。
 */
export class OpenAICompatProvider implements AIProvider {
  readonly id = 'openai' as const
  readonly displayName: string
  private readonly baseURL: string
  private readonly apiKey: string
  private readonly model: string
  private readonly temperature: number
  private readonly maxTokens: number

  constructor(config: OpenAICompatConfig) {
    if (!config.apiKey.trim()) throw new Error('缺少 API Key')
    this.baseURL = (config.baseURL ?? OPENAI_DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.apiKey = config.apiKey.trim()
    this.model = config.model || OPENAI_DEFAULT_MODEL
    this.temperature = config.temperature ?? 0.7
    this.maxTokens = config.maxTokens ?? 2048
    this.displayName = config.name || `OpenAI 兼容（${this.model}）`
  }

  private endpoint(): string {
    return `${this.baseURL}/chat/completions`
  }

  async chat(options: AIChatOptions): Promise<string> {
    let res: Response
    try {
      res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: this.temperature,
          max_tokens: this.maxTokens,
          messages: options.messages,
        }),
        signal: options.signal,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      throw new Error(`AI 请求失败：${err instanceof Error ? err.message : String(err)}`)
    }
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 300)
      throw new Error(`AI 请求失败（HTTP ${res.status}）：${body}`)
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const text = data.choices?.[0]?.message?.content
    if (typeof text !== 'string') throw new Error('AI 响应缺少文本内容')
    return text
  }

  async testConnection(): Promise<TestConnectionResult> {
    try {
      const text = await this.chat({ messages: [{ role: 'user', content: '你好，请回复“连接成功”。' }] })
      return { ok: true, message: text.slice(0, 120) }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }
}

/** 工厂：按配置创建 Provider（暂仅 openai，后续注册表扩展） */
export function createAIProvider(config: AIProviderConfig): AIProvider {
  if (config.providerId === 'openai') return new OpenAICompatProvider(config as OpenAICompatConfig)
  throw new Error(`未知 AI Provider：${config.providerId}`)
}
