import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the build works on GitHub Pages (/running-coach/) and locally.
export default defineConfig({
  base: './',
  plugins: [react()],
})
