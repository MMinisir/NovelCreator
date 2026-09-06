/**
 * AI 服务层抽象（Sprint 5 技术预研，执行案：AI Provider 抽象与上下文构建器）。
 * 只定义骨架与数据形态，US-801 配置界面与 US-802+ 功能在 Sprint 7 开放。
 * 浏览器直连第三方 LLM 存在 CORS/密钥暴露风险，正式版建议经本地代理转发（本层接口不变）。
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIChatOptions {
  messages: ChatMessage[]
  /** 取消请求 */
  signal?: AbortSignal
}

export interface TestConnectionResult {
  ok: boolean
  message?: string
}

/** Provider 创建配置（由调用方持有，不落库；Sprint 7 再做配置管理） */
export interface AIProviderConfig {
  /** 'openai'（OpenAI 兼容），后续可扩展 'deepseek' / 'ollama' 等 */
  providerId: string
  /** 展示名，缺省按 providerId 推导 */
  name?: string
  /** OpenAI 兼容端点，如 https://api.openai.com/v1 或 https://api.deepseek.com/v1 */
  baseURL?: string
  apiKey: string
  model: string
  temperature?: number
  maxTokens?: number
}

/** 所有 Provider 的统一面 */
export interface AIProvider {
  readonly id: string
  readonly displayName: string
  chat(options: AIChatOptions): Promise<string>
  testConnection(): Promise<TestConnectionResult>
}
