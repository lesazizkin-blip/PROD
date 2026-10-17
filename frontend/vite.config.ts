import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// В dev запросы /api проксируются на бэкенд (в проде сайт и API отдаёт один сервер)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': process.env.VITE_API_PROXY ?? 'http://localhost:8000' },
  },
  test: {
    environment: 'jsdom',
    // npm run test:ci: отчёт о покрытии (cobertura для GitLab, html) и junit со списком сценариев
    coverage: { provider: 'v8', include: ['src/**/*.{ts,tsx}'], exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.worker.ts'], reporter: ['text-summary', 'cobertura', 'html'] },
  },
})
