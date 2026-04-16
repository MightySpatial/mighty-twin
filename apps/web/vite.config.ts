import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), cesium()],
  resolve: {
    alias: {
      // Keep v1's `@mightydt/ui` and `@mightydt/types` import strings
      // working after the lift — the packages used to live in v1's
      // pnpm workspace, in v2 they're just folders under src/.
      '@mightydt/ui': path.resolve(__dirname, 'src/ui/index.ts'),
      '@mightydt/types': path.resolve(__dirname, 'src/types/index.ts'),
    },
  },
  server: {
    port: 3002,
    proxy: {
      '/api': { target: 'http://localhost:5003', changeOrigin: true },
    },
  },
})
