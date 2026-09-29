import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const api = process.env.JAZ_TASKS_API ?? 'http://localhost:7400'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: {
    port: 7401,
    strictPort: true,
    proxy: { '/graphql': api, '/mcp': api },
  },
  plugins: [tailwindcss(), tanstackStart({ spa: { enabled: true, prerender: { outputPath: '/index.html' } } }), viteReact()],
})
