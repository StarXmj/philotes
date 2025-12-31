// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // --- CORRECTIF ICI ---
        // On augmente la limite de taille des fichiers mis en cache à 10 Mo (par défaut 2 Mo)
        // pour accepter tes avatars haute définition.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024 
      },
      
      manifest: {
        name: 'Philotès',
        short_name: 'Philotès',
        description: 'Le réseau social étudiant.',
        theme_color: '#8b5cf6',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})