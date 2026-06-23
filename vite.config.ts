typescript
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'

export default defineConfig({
  plugins: [
    tanstackStart({
      // Wyłączenie prerenderowania naprawia błąd środowiska uruchomieniowego na serwerach Vercel
      prerender: {
        enabled: false
      }
    }),
    nitro({
      // Jeśli kod jest uruchamiany na serwerze Vercel, automatycznie włącz profil 'vercel'
      preset: process.env.VERCEL ? 'vercel' : undefined
    })
  ]
})
