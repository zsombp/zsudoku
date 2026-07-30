import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The PWA plugin gets wired in at Phase 1. Phase 0 is a plain Vite app.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
  test: {
    include: ['src/**/*.test.js'],
    environment: 'node',
  },
})
