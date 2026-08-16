import { cloudflare } from '@cloudflare/vite-plugin'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vuetify from 'vite-plugin-vuetify'

export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true }), cloudflare()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
