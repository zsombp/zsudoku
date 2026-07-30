import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves a project site from /<repo>/, so the built app needs
  // that prefix. Dev stays at the root so localhost URLs stay short.
  //
  // Keyed on mode, not command: `vite preview` runs as command 'serve', so
  // keying on command served the built app from the root while its HTML pointed
  // at /zsudoku/. Every asset then fell through to the SPA fallback, and the
  // service worker refused to register because sw.js came back as text/html.
  base: mode === 'development' ? '/' : '/zsudoku/',

  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['apple-touch-icon.png', 'favicon-32.png'],
      manifest: {
        name: 'Zsudoku',
        short_name: 'Zsudoku',
        description: 'Offline sudoku with honest difficulty.',
        theme_color: '#14161d',
        background_color: '#14161d',
        display: 'standalone',
        orientation: 'portrait',
        // Relative, so the same build works at any base path.
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The whole app is 320KB, so precache all of it. Offline is the point,
        // and there is no runtime caching to reason about because the app makes
        // no network requests at all once it is loaded.
        globPatterns: ['**/*.{js,css,html,woff,woff2,png,svg,webmanifest}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],

  server: { host: true },

  test: {
    include: ['src/**/*.test.js'],
    environment: 'node',
  },
}))
