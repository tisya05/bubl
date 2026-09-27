import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Frontend-only mock preview. Never starts a worker, requests auth, or deploys.
export default defineConfig({
  plugins: [react(), { name: 'frontend-entry', transformIndexHtml: { order: 'pre', handler: html => html.replace('/src/main.tsx', '/src/ui-main.tsx') } }],
  define: {
    'import.meta.env.VITE_UI_ONLY': 'true',
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: 'dist-ui' },
  preview: { host: '0.0.0.0', port: 5175, strictPort: true },
})
