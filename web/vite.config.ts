import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'

// Get git hash at build time
const getGitHash = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch (e) {
    return 'unknown'
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __GIT_HASH__: JSON.stringify(getGitHash()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:10002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2020',
  },
})