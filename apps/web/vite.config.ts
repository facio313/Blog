import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/blog/',
  plugins: [react()],
  server: {
    port: 5176,
    strictPort: true,
    proxy: {
      '/blog/api': {
        target: 'http://127.0.0.1:9176',
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
