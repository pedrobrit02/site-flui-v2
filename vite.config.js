import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'docs',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        uso: resolve(__dirname, 'uso.html'),
        emprestimo: resolve(__dirname, 'emprestimo.html')
      }
    }
  }
})