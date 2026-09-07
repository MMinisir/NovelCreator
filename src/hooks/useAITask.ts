import { useCallback, useEffect, useRef, useState } from 'react'
import { loadAIConfig } from '@/services/ai/config'

/**
 * AI 生成任务通用状态机（Sprint 7）：
 * 统一 loading / error / result / 取消（AbortController）与配置读取，
 * 供五句话梗概、人物小传、关系建议等弹窗复用。
 */
export function useAITask<T>() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<T | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setLoading(false)
  }, [])

  const reset = useCallback(() => {
    setError('')
    setResult(null)
  }, [])

  const run = useCallback(async (task: (signal: AbortSignal) => Promise<T>) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    setError('')
    try {
      const data = await task(controller.signal)
      if (!controller.signal.aborted) setResult(data)
      return data
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return undefined
      setError(err instanceof Error ? err.message : String(err))
      return undefined
    } finally {
      if (controllerRef.current === controller) {
        setLoading(false)
        controllerRef.current = null
      }
    }
  }, [])

  return { loading, error, result, setResult, setError, run, cancel, reset, hasConfig: Boolean(loadAIConfig()) }
}
