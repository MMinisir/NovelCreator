import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Download, FolderOpen, HardDriveDownload, ShieldCheck, Upload } from 'lucide-react'
import { Badge, Button, Field, Input, Select } from '@/components/ui'
import { loadBackupSettings, saveBackupSettings } from '@/db/repositories'
import {
  isEncryptedBackup,
  isFileSystemAccessSupported,
  loadBackupPassphrase,
  pickBackupDirectory,
  restoreFromBackupText,
  saveBackupPassphrase,
  writeBackup,
} from '@/services/backup'
import { useProjectStore } from '@/stores/projectStore'
import type { BackupSettings } from '@/types/meta'

const INTERVALS = [15, 30, 60, 120, 360]

/** 自动备份与恢复面板（Sprint 7 US-702 / US-703） */
export default function BackupPanel({ projectId }: { projectId: string }) {
  const project = useProjectStore((s) => s.getProject(projectId))
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const [settings, setSettings] = useState<BackupSettings | null>(null)
  const [dirName, setDirName] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [interval, setInterval] = useState(60)
  const [encrypted, setEncrypted] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const supported = isFileSystemAccessSupported()

  useEffect(() => {
    void loadBackupSettings().then((s) => {
      setSettings(s)
      setDirName(s?.dirName ?? '')
      setEnabled(Boolean(s?.enabled))
      setInterval(s?.intervalMinutes || 60)
      setEncrypted(Boolean(s?.encrypted))
    })
    setPassphrase(loadBackupPassphrase() ?? '')
  }, [])

  async function persist(patch: Partial<BackupSettings>) {
    const next = await saveBackupSettings(patch)
    setSettings(next)
    return next
  }

  async function handlePickDir() {
    setBusy(true)
    setMessage(null)
    try {
      const { dirName: name, handle } = await pickBackupDirectory()
      setDirName(name)
      await persist({ dirName: name, handle })
      setMessage({ ok: true, text: `已选择备份目录：${name}` })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  async function handleBackupNow() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await writeBackup(projectId, project?.name ?? '未命名作品', { passphrase })
      setSettings(await loadBackupSettings())
      setMessage({ ok: true, text: `已备份：${res.fileName}（${(res.size / 1024).toFixed(1)} KB）` })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  async function handleRestoreFile(file: File) {
    setBusy(true)
    setMessage(null)
    try {
      const text = await file.text()
      if (isEncryptedBackup(text) && !passphrase) {
        setMessage({ ok: false, text: '该备份已加密，请先填写备份口令' })
        return
      }
      const res = await restoreFromBackupText(text, passphrase, true)
      await loadProjects()
      setMessage({
        ok: true,
        text: `已从备份导入副本《${res.name}》（记录 ${Object.values(res.storeCounts).reduce((a, b) => a + b, 0)} 条）`,
      })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">自动备份与恢复</h2>
        <Badge color={supported ? (enabled ? 'green' : 'slate') : 'amber'}>
          {supported ? (enabled ? '自动备份已启用' : '未启用') : '浏览器不支持自动备份'}
        </Badge>
      </div>

      {!supported ? (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          当前浏览器不支持 File System Access API，无法自动写入本地目录。建议使用 Chrome / Edge；仍可通过项目列表页的「导出 JSON / 导入」手动备份，或在此处从备份文件恢复。
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="备份目录" hint="浏览器会记住该目录，重开页面后可能需要再次授权写入">
            <div className="flex items-center gap-2">
              <Input value={dirName} readOnly placeholder="尚未选择" className="bg-stone-50" />
              <Button type="button" variant="secondary" loading={busy} onClick={() => void handlePickDir()}>
                <FolderOpen className="size-4" /> 选择
              </Button>
            </div>
          </Field>
          <Field label="备份间隔">
            <div className="flex items-center gap-2">
              <Select
                value={interval}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setInterval(v)
                  void persist({ intervalMinutes: v })
                }}
              >
                {INTERVALS.map((m) => (
                  <option key={m} value={m}>
                    每 {m} 分钟
                  </option>
                ))}
              </Select>
              <Button type="button" variant="primary" loading={busy} disabled={!settings?.handle} onClick={() => void handleBackupNow()}>
                <HardDriveDownload className="size-4" /> 立即备份
              </Button>
            </div>
          </Field>

          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              className="accent-violet-600"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked)
                void persist({ enabled: e.target.checked })
              }}
            />
            启用自动备份（应用打开期间按间隔写入目录）
          </label>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              className="accent-violet-600"
              checked={encrypted}
              onChange={(e) => {
                setEncrypted(e.target.checked)
                void persist({ encrypted: e.target.checked })
              }}
            />
            备份文件加密（AES-GCM）
          </label>

          {encrypted && (
            <div className="sm:col-span-2">
              <Field label="备份口令" hint="口令仅保存在本机浏览器（localStorage），用于加密备份与自动备份；丢失将无法恢复加密文件">
                <div className="flex items-center gap-2">
                  <Input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="设置一个备份口令" autoComplete="new-password" />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      saveBackupPassphrase(passphrase)
                      setMessage({ ok: true, text: '口令已保存到本机浏览器' })
                    }}
                  >
                    <ShieldCheck className="size-4" /> 保存口令
                  </Button>
                </div>
              </Field>
            </div>
          )}

          {settings?.lastBackupAt && (
            <p className="text-xs text-stone-500 sm:col-span-2">
              上次备份：{new Date(settings.lastBackupAt).toLocaleString('zh-CN', { hour12: false })}
              {settings.lastResult ? ` · ${settings.lastResult}` : ''}
            </p>
          )}
        </div>
      )}

      {/* 恢复 */}
      <div className="mt-5 border-t border-stone-100 pt-4">
        <h3 className="mb-2 text-sm font-medium text-stone-700">从备份恢复</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="text-sm text-stone-600 file:mr-2 file:cursor-pointer file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:text-stone-700 hover:file:bg-stone-200"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleRestoreFile(file)
            }}
          />
          <span className="text-xs text-stone-400">导入为副本项目（不会覆盖现有数据）</span>
          <Link to="/projects" className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-violet-600 hover:text-violet-800">
            查看项目列表 <Download className="size-3.5 rotate-180" />
          </Link>
        </div>
      </div>

      {message && (
        <div
          className={`mt-4 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
            message.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <Upload className="mt-0.5 size-4 shrink-0" />}
          <span className="break-all">{message.text}</span>
        </div>
      )}
    </section>
  )
}
