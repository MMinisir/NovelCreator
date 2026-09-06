import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Sprint 6 US-901：轻量 PWA（离线缓存 + 灵感速记），dev 不启用 SW 便于调试
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'NovelCreator · 小说创作工作台',
        short_name: 'NovelCreator',
        description: '本地优先的中文小说设定管理与 AI 辅助写作工作台',
        lang: 'zh-CN',
        display: 'standalone',
        start_url: '/',
        theme_color: '#7c3aed',
        background_color: '#fafaf9',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
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
