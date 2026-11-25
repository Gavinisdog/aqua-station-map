import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@tests': fileURLToPath(new URL('./tests', import.meta.url)),
      '@scripts': fileURLToPath(new URL('./scripts', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/wra-rain': {
        target: 'https://opendata.wra.gov.tw',
        changeOrigin: true,
        rewrite: () =>
          '/api/v2/a3c4b6e0-7a21-4d8f-9c3b-2e5f6a1b8c77?format=JSON&page=1&size=5000',
        headers: {
          'User-Agent': UA,
          Accept: 'application/json',
        },
      },
    },
  },
})
