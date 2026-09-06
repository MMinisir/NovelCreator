import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// 注：未启用 React StrictMode —— TipTap v2 编辑器在 React 18 StrictMode
// 的双挂载（mount→unmount→mount）流程下存在兼容性缺陷（编辑器重复创建/内容丢失）。
// 其余状态库（Zustand/Dexie）不依赖 StrictMode 语义，后续升级 TipTap v3 后可重新启用。
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
)
