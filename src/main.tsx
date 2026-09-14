import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Electron 桌面版以 file:// 加载页面，history 路由会 404，故桌面版改用 hash 路由；
// Web 版（http/https）保持 BrowserRouter，URL 形式不变。
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter

// 注：未启用 React StrictMode —— TipTap v2 编辑器在 React 18 StrictMode
// 的双挂载（mount→unmount→mount）流程下存在兼容性缺陷（编辑器重复创建/内容丢失）。
// 其余状态库（Zustand/Dexie）不依赖 StrictMode 语义，后续升级 TipTap v3 后可重新启用。
createRoot(document.getElementById('root')!).render(
  <Router>
    <App />
  </Router>,
)
