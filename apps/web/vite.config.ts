import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), cesium()],
  resolve: {
    alias: {
      '@mightydt/ui': path.resolve(__dirname, 'src/ui/index.ts'),
      '@mightydt/types': path.resolve(__dirname, 'src/types/index.ts'),
    },
  },
  server: {
    port: 3002,
    proxy: {
      '/api': {
        // Local apps/api FastAPI on port 5003. Twin uses 5003 to coexist
        // with MightyDT on 5001 (DT runs natively at the same time).
        // Phase A wired /api/sites against real Postgres; auth + settings
        // are stub responses from twin_api.dev_stubs until Phase B/C land.
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:5003',
        changeOrigin: true,
        timeout: 5000,
        proxyTimeout: 5000,
      },
    },
  },
})
