import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import vuetify from 'vite-plugin-vuetify'

export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  ssr: {
    noExternal: ['vuetify'],
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/admin-spa.test.ts'],
  },
})
