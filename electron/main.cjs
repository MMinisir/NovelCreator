/**
 * Electron 主进程（桌面版）：
 * - 生产：`loadFile(dist/index.html)`（file:// 协议，前端已按此切换到 HashRouter）
 * - 开发（npm run dev:exe，默认）：Vite `build --watch` 持续重建 dist + 本进程监听产物变化自动刷新
 *   —— 与打包版同为 file:// 协议，因此共用同一份 IndexedDB 数据，能直接看到真实项目
 * - 开发（npm run dev:exe -- --hmr）：设置环境变量 VITE_DEV_SERVER_URL 后加载 vite dev server（真 HMR，数据独立）
 * - 前端不启用 nodeIntegration（保持沙箱），因此主进程无需额外 IPC
 * - 外链一律交给系统浏览器打开；单实例锁避免多窗口并发写 IndexedDB
 */
const { app, BrowserWindow, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const DEV_URL = process.env.VITE_DEV_SERVER_URL
/** 桌面开发模式：dist 产物变化时自动刷新窗口 */
const RELOAD_ON_BUILD = process.env.NC_RELOAD_ON_BUILD === '1'
/** 仅用于 UI 自动化检查：设置该环境变量后，窗口渲染完成即截图保存并退出 */
const SCREENSHOT_PATH = process.env.NC_SCREENSHOT

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#faf8f5',
    autoHideMenuBar: true,
    title: 'NovelCreator · 小说创作工作台',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  // 新窗口（target=_blank 等）：仅放行外部 http(s) 到系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 页面内跳转到外部站点时也用系统浏览器打开（file:// 与 dev server 同源放行）
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) return
    if (DEV_URL && url.startsWith(new URL(DEV_URL).origin)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  if (DEV_URL) {
    void win.loadURL(DEV_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // UI 自动化检查（不影响正常使用）：截图当前窗口后退出
  if (SCREENSHOT_PATH) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        win.webContents
          .capturePage()
          .then((image) => {
            fs.writeFileSync(SCREENSHOT_PATH, image.toPNG())
            console.log(`[screenshot] saved: ${SCREENSHOT_PATH}`)
          })
          .catch((err) => console.error(`[screenshot] failed: ${err}`))
          .finally(() => app.quit())
      }, 3000)
    })
  }

  // 桌面开发模式（默认）：vite build --watch 持续重建 dist，这里监听产物变化自动刷新窗口。
  // 之所以不用 dev server：dev server 是 http://localhost origin，IndexedDB 与打包版（file://）不互通，
  // 会看不到真实项目数据；走 file:// 才能与桌面版共用同一份数据。
  if (RELOAD_ON_BUILD) {
    let timer = null
    try {
      fs.watch(path.join(__dirname, '..', 'dist'), { recursive: true }, () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          for (const w of BrowserWindow.getAllWindows()) {
            if (!w.isDestroyed()) w.webContents.reloadIgnoringCache()
          }
        }, 500)
      })
    } catch {
      // 监听失败不影响开发（窗口内手动刷新即可）
    }
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(() => {
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
