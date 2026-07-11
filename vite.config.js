import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectRegister: 'auto',
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      manifest: {
        name:             'DeFi Tanda',
        short_name:       'DeFi Tanda',
        description:      'Rotating savings tandas on the XRP Ledger.',
        start_url:        '/app',
        scope:             '/',
        display:          'standalone',
        background_color: '#091318',
        theme_color:      '#006aff',
        icons: [
          { src: '/pwa-192.png',          sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png',          sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: {
      '/.netlify/functions': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor':  ['react', 'react-dom', 'react-router-dom'],
          'motion':        ['framer-motion'],
          'charts':        ['recharts'],
          'i18n':          ['i18next', 'react-i18next'],
        },
      },
    },
  },
})
