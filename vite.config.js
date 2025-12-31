import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa' // <--- Import

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Philotès',
        short_name: 'Philotès',
        description: 'Le réseau social étudiant basé sur la personnalité.',
        theme_color: '#8b5cf6', // Ta couleur primaire (philo-primary)
        background_color: '#0f172a', // Ta couleur de fond (slate-900)
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png', // Tu devras ajouter ces images dans /public
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png', // Tu devras ajouter ces images dans /public
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})