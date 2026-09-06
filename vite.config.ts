import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 基础分包：框架 / 编辑器 / 数据层 / 图标 与业务代码分离，利于长期缓存
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor'
          if (id.includes('react') || id.includes('react-router') || id.includes('scheduler')) return 'react'
          if (id.includes('lucide')) return 'icons'
          return undefined
        },
      },
    },
  },
})
