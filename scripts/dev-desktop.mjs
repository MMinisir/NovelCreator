/**
 * 桌面版开发模式：一条命令启动「持续构建 + Electron 桌面窗口」。
 *
 * 默认（推荐）：
 *   `vite build --watch` 持续重建 dist → Electron 以 **file://** 加载 dist，并在产物变化时自动刷新窗口。
 *   与打包版同为 file:// 协议、同一 userData，因此**直接看到你的真实项目数据**；
 *   保存代码后约 1~2 秒自动重建 + 刷新。
 *   命令：npm run dev:exe
 *
 * --hmr：
 *   启动 Vite dev server，Electron 加载 http://localhost:5173（真正的秒级 HMR + DevTools）。
 *   注意该 origin 的 IndexedDB 与打包版隔离（是另一份空数据），适合纯前端 UI 调试。
 *   命令：npm run dev:exe -- --hmr
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const NODE = process.execPath
const useHmr = process.argv.includes('--hmr')
const PORT = Number(process.env.NC_DEV_PORT ?? 5173)
const DEV_URL = `http://localhost:${PORT}`
const DIST_INDEX = path.join(root, 'dist', 'index.html')

/** 解析依赖包的可执行入口（node_modules/<pkg>/<bin>） */
function binEntry(pkgName, binName) {
  const dir = path.join(root, 'node_modules', pkgName)
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
  const bin = pkg.bin
  const rel = typeof bin === 'string' ? bin : (bin?.[binName] ?? Object.values(bin ?? {})[0])
  if (!rel) throw new Error(`无法解析 ${pkgName} 的可执行入口`)
  return path.join(dir, rel)
}

/** Windows 下需要杀进程树，否则会残留 Electron 子进程 */
function killTree(child) {
  if (!child || !child.pid || child.killed) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {
      // 忽略清理失败
    }
  } else {
    try {
      child.kill()
    } catch {
      // 忽略清理失败
    }
  }
}

const children = []
function track(child) {
  children.push(child)
  return child
}

function shutdown(code = 0) {
  for (const c of children) killTree(c)
  process.exit(code)
}

async function waitForBuild(prevMtime, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (existsSync(DIST_INDEX)) {
      const mtime = statSync(DIST_INDEX).mtimeMs
      if (mtime > prevMtime) return true
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

async function waitForServer(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' })
      if (res.ok || res.status === 404) return true
    } catch {
      // 还没起来，继续等
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

let electronStarted = false

function launchElectron(env) {
  const electron = track(
    spawn(NODE, [binEntry('electron', 'electron')], { cwd: root, stdio: 'inherit', env }),
  )
  electronStarted = true
  electron.on('exit', (code) => {
    console.log('[dev:exe] 桌面窗口已关闭，正在停止构建进程…')
    shutdown(code ?? 0)
  })
  return electron
}

/** 默认模式：持续构建 dist + file:// 加载（与打包版共用同一份数据） */
async function runWatchMode() {
  console.log('[dev:exe] 类型检查（tsc -b）…')
  const tsc = spawn(NODE, [binEntry('typescript', 'tsc'), '-b'], { cwd: root, stdio: 'inherit' })
  const tscCode = await new Promise((resolve) => tsc.on('exit', (code) => resolve(code ?? 1)))
  if (tscCode !== 0) throw new Error('TypeScript 类型检查未通过，请先修复报错')

  const beforeMtime = existsSync(DIST_INDEX) ? statSync(DIST_INDEX).mtimeMs : 0
  console.log('[dev:exe] 启动持续构建（vite build --watch --mode electron）…')
  track(spawn(NODE, [binEntry('vite', 'vite'), 'build', '--watch', '--mode', 'electron'], { cwd: root, stdio: 'inherit' }))

  if (!(await waitForBuild(beforeMtime))) throw new Error('首次构建等待超时')

  console.log('[dev:exe] 构建就绪 → 打开桌面窗口')
  console.log('[dev:exe] 与打包版共用 file:// 数据（能看到真实项目）；保存代码后自动重建并刷新；Ctrl+C 退出')
  launchElectron({ ...process.env, NC_RELOAD_ON_BUILD: '1' })
}

/** --hmr 模式：Vite dev server + 真 HMR（数据与打包版隔离） */
async function runHmrMode() {
  console.log(`[dev:exe] --hmr：启动 Vite dev server（${DEV_URL}）…`)
  const vite = track(spawn(NODE, [binEntry('vite', 'vite'), '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'inherit' }))
  vite.on('exit', (code) => {
    if (electronStarted) return
    console.error('[dev:exe] dev server 启动失败或已退出（端口可能被占用）')
    process.exit(code ?? 1)
  })

  if (!(await waitForServer(DEV_URL))) throw new Error('等待 dev server 超时')

  console.log('[dev:exe] dev server 就绪 → 打开桌面窗口（DevTools 自动打开）')
  console.log('[dev:exe] 注意：此模式数据与桌面版隔离（localhost origin，为独立空库），适合纯 UI 调试')
  launchElectron({ ...process.env, VITE_DEV_SERVER_URL: DEV_URL })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

try {
  if (useHmr) await runHmrMode()
  else await runWatchMode()
} catch (err) {
  console.error(`[dev:exe] ${err?.message ?? err}`)
  shutdown(1)
}
