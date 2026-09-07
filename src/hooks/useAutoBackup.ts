import { useEffect } from 'react'
import { loadBackupPassphrase, runAutoBackupIfDue } from '@/services/backup'

/**
 * 自动备份轮询（Sprint 7 US-702）：
 * 项目打开期间每 60 秒检查一次是否到达备份间隔，到点则写入已选目录。
 * 失败静默处理（不打断创作），结果记录在 backup_settings.lastResult 由设置面板展示。
 */
export function useAutoBackup(projectId?: string, projectName?: string): void {
  useEffect(() => {
    if (!projectId) return
    let stopped = false

    async function check() {
      if (stopped) return
      try {
        await runAutoBackupIfDue(projectId!, projectName ?? '未命名作品', loadBackupPassphrase() ?? undefined)
      } catch {
        // 静默：设置面板会展示上次结果
      }
    }

    void check()
    const timer = window.setInterval(check, 60_000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [projectId, projectName])
}
