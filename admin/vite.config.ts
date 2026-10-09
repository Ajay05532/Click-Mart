import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const api = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000'

// The dev server proxies the API so the refresh-token cookie stays same-origin (no CORS setup needed).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: {
    port: 5175,
    proxy: { '/api': api, '/uploads': api },
  },
})
