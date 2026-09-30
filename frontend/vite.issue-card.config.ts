import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Builds the issue card MCP App resource the same way as the app: one
// self-contained HTML file next to the Go package that embeds it.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: '../backend/internal/httpapi/mcpapi/app',
    emptyOutDir: false,
    rollupOptions: { input: 'issue-card.html' },
  },
})
