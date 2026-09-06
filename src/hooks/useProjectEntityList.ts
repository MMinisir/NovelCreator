import { useCallback, useEffect, useState } from 'react'
import type { BaseEntity } from '@/types'

/** Repository 需为模块单例（引用稳定），避免 loader 变化引起重复加载 */
type EntityListRepo<T extends BaseEntity> = { byProject: (projectId: string) => Promise<T[]> }

/**
 * 项目域实体列表 Hook：按 projectId 加载并本地管理列表。
 * 数据变更后调用 refresh() 重新拉取。
 */
export function useProjectEntityList<T extends BaseEntity>(
  repo: EntityListRepo<T>,
  projectId: string | undefined,
) {
  const [items, setItems] = useState<T[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!projectId) {
      setItems([])
      setLoaded(true)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await repo.byProject(projectId)
      setItems(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [repo, projectId])

  useEffect(() => {
    void reload()
  }, [reload])

  /** 数据变更后重新拉取 */
  const refresh = useCallback(async () => {
    await reload()
  }, [reload])

  return { items, setItems, loaded, loading, error, refresh }
}
