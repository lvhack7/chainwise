import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), 'PORT')
  const port = process.env.PORT ?? env.PORT ?? '3100'
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid backend PORT')
  const target = `http://127.0.0.1:${port}`
  return {
    envDir: '..', plugins: [react()],
    server: { proxy: { '/api': {
      target, changeOrigin: true,
      configure(proxy) {
        proxy.on('proxyReq', (outgoing, incoming) => {
          // Forward only the dev app's own loopback origin. Other origins stay
          // unchanged and are rejected by the backend's existing CSRF guard.
          const origin = incoming.headers.origin
          if (origin === `http://${incoming.headers.host}` && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) outgoing.setHeader('origin', target)
        })
      },
    } } },
  }
})
