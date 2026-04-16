import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'

export default defineConfig({
  plugins: [react(), cesium()],
  server: {
    port: 3002,
    proxy: {
      '/api': { target: 'http://localhost:5003', changeOrigin: true },
    },
  },
})
