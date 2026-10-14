import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the API runs on :8000; the dev server forwards /api and /media to it.
const API = process.env.API_URL ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    proxy: {
      '/api': API,
      '/media': API,
    },
  },
  preview: {
    proxy: {
      '/api': API,
      '/media': API,
    },
  },
})
