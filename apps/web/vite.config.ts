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
        // VM where MightyTwin v1's FastAPI runs. When the VM is down,
        // the TCP connection attempt hangs for 30+ seconds at the OS
        // level. The timeout below cuts that to 5s so the dev-mode
        // mock auth in useAuth can kick in quickly.
        target: 'http://192.168.64.3:5003',
        changeOrigin: true,
        timeout: 5000,
        proxyTimeout: 5000,
      },
    },
  },
})
