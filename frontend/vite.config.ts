import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Without this value a deployed site would call localhost from each visitor's own computer.
  const apiBaseUrl = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE_URL || ''
  if (process.env.VERCEL && !/^https:\/\/.+\/api\/v1\/?$/.test(apiBaseUrl)) {
    throw new Error('Set VITE_API_BASE_URL to https://YOUR-BACKEND.vercel.app/api/v1 in the Vercel project settings, then redeploy.')
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      proxy: {
        '/api/v1': {
          target: process.env.API_PROXY_TARGET || 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
  }
})
