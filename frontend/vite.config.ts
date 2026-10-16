import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// В dev запросы /api проксируются на бэкенд (в проде это делает nginx)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': process.env.VITE_API_PROXY ?? 'http://localhost:8000' },
  },
  test: { environment: 'jsdom' },
})
