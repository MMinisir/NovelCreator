import { exportProjectToJson, importProjectFromJson } from '@/services/exportImport'
import { loadBackupSettings, saveBackupSettings } from '@/db/repositories'
import type { BackupSettings } from '@/types/meta'

/**
 * 自动备份与恢复（Sprint 7 US-702 / US-703）。
 * 备份目标目录通过 File System Access API 选择并可持久化句柄；
 * 可选 AES-GCM（PBKDF2 派生）口令加密，口令仅存本机 localStorage（与 AI Key 同级风险）。
 * 不支持 FSA 的浏览器（Firefox/Safari）自动备份不可用，仍可手动导出 JSON。
 */

/* ---------------- File System Access API 最小类型 ---------------- */

export interface FsWritable {
  write(data: string): Promise<void>
  close(): Promise<void>
}
export interface FsFileHandle {
  createWritable(): Promise<FsWritable>
}
export interface FsDirectoryHandle {
  name: string
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandle>
  queryPermission?(opts: { mode?: string }): Promise<PermissionState>
  requestPermission?(opts: { mode?: string }): Promise<PermissionState>
}

export function isFileSystemAccessSupported(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
}

export async function pickBackupDirectory(): Promise<{ dirName: string; handle: FsDirectoryHandle }> {
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<FsDirectoryHandle> }).showDirectoryPicker
  if (!picker) {
    throw new Error('当前浏览器不支持选择本地目录（需 Chromium 内核浏览器，如 Chrome / Edge）')
  }
  const handle = await picker.call(window)
  return { dirName: handle.name, handle }
}

/* ---------------- 口令（本机 localStorage） ---------------- */

const PASSPHRASE_KEY = 'novel-creator.backup-passphrase.v1'

export function loadBackupPassphrase(): string | null {
  return localStorage.getItem(PASSPHRASE_KEY)
}

export function saveBackupPassphrase(passphrase: string): void {
  if (passphrase) localStorage.setItem(PASSPHRASE_KEY, passphrase)
  else localStorage.removeItem(PASSPHRASE_KEY)
}

/* ---------------- 加密 / 解密（AES-GCM + PBKDF2） ---------------- */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

function fromBase64(text: string): Uint8Array {
  const bin = atob(text)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

export interface EncryptedBackup {
  format: string
  encrypted: true
  alg: 'AES-GCM+PBKDF2'
  salt: string
  iv: string
  data: string
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** 加密导出文本为备份信封 JSON */
export async function encryptText(text: string, passphrase: string): Promise<string> {
  if (!passphrase) throw new Error('加密备份需要设置口令')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text))
  const envelope: EncryptedBackup = {
    format: 'novel-tool',
    encrypted: true,
    alg: 'AES-GCM+PBKDF2',
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(buf)),
  }
  return JSON.stringify(envelope)
}

/** 解密备份信封；口令错误会抛出 */
export async function decryptBackup(text: string, passphrase: string): Promise<string> {
  let env: EncryptedBackup
  try {
    env = JSON.parse(text) as EncryptedBackup
  } catch {
    throw new Error('备份文件不是有效的加密备份')
  }
  if (!env?.encrypted || !env.data || !env.salt || !env.iv) throw new Error('备份文件不是有效的加密备份')
  if (!passphrase) throw new Error('该备份已加密，请输入备份口令')
  const key = await deriveKey(passphrase, fromBase64(env.salt))
  try {
    const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(env.iv) }, key, fromBase64(env.data))
    return decoder.decode(buf)
  } catch {
    throw new Error('解密失败：口令可能不正确')
  }
}

export function isEncryptedBackup(text: string): boolean {
  try {
    const obj = JSON.parse(text) as { encrypted?: boolean }
    return obj?.encrypted === true
  } catch {
    return false
  }
}

/* ---------------- 备份写入 ---------------- */

function timestamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || 'project'
}

export function buildBackupFileName(projectName: string, encrypted: boolean): string {
  return `novel-backup-${safeName(projectName)}-${timestamp()}${encrypted ? '.enc' : ''}.json`
}

export interface BackupRunResult {
  fileName: string
  size: number
  at: string
}

async function ensureWritePermission(dir: FsDirectoryHandle): Promise<void> {
  if (!dir.queryPermission) return
  const state = await dir.queryPermission({ mode: 'readwrite' })
  if (state === 'granted') return
  const next = dir.requestPermission ? await dir.requestPermission({ mode: 'readwrite' }) : 'denied'
  if (next !== 'granted') throw new Error('备份目录的写入权限被拒绝，请重新选择目录')
}

/** 立即备份当前项目到已选目录 */
export async function writeBackup(
  projectId: string,
  projectName: string,
  options?: { passphrase?: string },
): Promise<BackupRunResult> {
  const settings = await loadBackupSettings()
  if (!settings?.handle) throw new Error('尚未选择备份目录')
  const dir = settings.handle as FsDirectoryHandle
  await ensureWritePermission(dir)

  const json = await exportProjectToJson(projectId)
  const useEncryption = settings.encrypted && Boolean(options?.passphrase)
  if (settings.encrypted && !options?.passphrase) throw new Error('已开启加密备份，但未提供口令（请在面板中填写并保存口令）')
  const payload = useEncryption ? await encryptText(json, options!.passphrase!) : json
  const fileName = buildBackupFileName(projectName, useEncryption)
  const fileHandle = await dir.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(payload)
  } finally {
    await writable.close()
  }
  const at = new Date().toISOString()
  const size = new Blob([payload]).size
  await saveBackupSettings({ lastBackupAt: at, lastResult: `已写入 ${fileName}（${(size / 1024).toFixed(1)} KB）` })
  return { fileName, size, at }
}

/** 到点自动备份（未启用 / 未到间隔 / 无目录时返回 null） */
export async function runAutoBackupIfDue(
  projectId: string,
  projectName: string,
  passphrase?: string,
): Promise<BackupRunResult | null> {
  const settings = await loadBackupSettings()
  if (!settings?.enabled || !settings.handle) return null
  const interval = Math.max(5, settings.intervalMinutes || 60) * 60_000
  if (settings.lastBackupAt) {
    const elapsed = Date.now() - new Date(settings.lastBackupAt).getTime()
    if (elapsed < interval) return null
  }
  return writeBackup(projectId, projectName, { passphrase })
}

/* ---------------- 恢复 ---------------- */

/** 从备份文本恢复：加密备份需口令；asNewProject=true 时作为副本导入 */
export async function restoreFromBackupText(
  text: string,
  passphrase: string,
  asNewProject = true,
): Promise<{ projectId: string; name: string; storeCounts: Record<string, number> }> {
  const json = isEncryptedBackup(text) ? await decryptBackup(text, passphrase) : text
  return importProjectFromJson(json, asNewProject)
}

/** 当前设置的摘要（面板展示用） */
export function describeSettings(settings: BackupSettings | null): string {
  if (!settings?.handle) return '未选择备份目录'
  const dir = `目录：${settings.dirName ?? '（已选）'}`
  const interval = `${settings.intervalMinutes} 分钟`
  return `${dir} · 每 ${interval}${settings.encrypted ? ' · 加密' : ''}`
}
