import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path for GitHub Pages: change to match your repo name if different.
// Set VITE_BASE env var to override (e.g. VITE_BASE=/ for custom domain).
const base = process.env.VITE_BASE ?? '/learning-map/'

export default defineConfig({
  plugins: [react()],
  base,
})
