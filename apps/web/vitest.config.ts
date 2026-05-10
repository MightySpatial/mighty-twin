/**
 * Vitest config for the web app.
 *
 * Cesium is aliased to a tiny stub during tests because the real
 * Cesium module can't initialise outside the bundler runtime
 * (vite-plugin-cesium injects the runtime in dev/build, but
 * vitest doesn't load that plugin). The stub provides just enough
 * of the surface to satisfy `import { Cartesian3, ... }` for the
 * pure helpers our tests touch.
 */
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/__tests__/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      cesium: path.resolve(__dirname, 'src/test/cesium-stub.ts'),
    },
  },
})
