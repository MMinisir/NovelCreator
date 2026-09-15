/**
 * 桌面版开发模式：一条命令同时启动 Vite dev server 与 Electron 桌面窗口。
 * - 前端改动由 Vite HMR 即时生效（无需重新构建）
 * - 主进程（electron/main.cjs）改动需重启本命令
 * - 主进程通过环境变量 VITE_DEV_SERVER_URL 加载 dev server，并自动打开 DevTools
 *
 * 用法：npm run dev:exe
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const NODE = process.execPath
const PORT = Number(process.env.NC_DEV_PORT ?? 5173)
const DEV_URL = `http://localhost:${PORT}`

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

console.log(`[dev:exe] 启动 Vite dev server（${DEV_URL}）…`)
const vite = spawn(NODE, [binEntry('vite', 'vite'), '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: 'inherit',
})

let electron = null
function shutdown(code = 0) {
  killTree(electron)
  killTree(vite)
  process.exit(code)
}

vite.on('exit', (code) => {
  if (!electron) {
    console.error('[dev:exe] dev server 启动失败或已退出，请检查端口占用')
    process.exit(code ?? 1)
  }
})

const ready = await waitForServer(DEV_URL)
if (!ready) {
  console.error('[dev:exe] 等待 dev server 超时')
  shutdown(1)
}

console.log('[dev:exe] dev server 就绪，正在打开桌面窗口…（前端改动热更新；Ctrl+C 退出）')
electron = spawn(NODE, [binEntry('electron', 'electron')], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: DEV_URL },
})

electron.on('exit', (code) => {
  console.log('[dev:exe] 桌面窗口已关闭，正在停止 dev server…')
  shutdown(code ?? 0)
})

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
