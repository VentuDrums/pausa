import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// base './' permite publicar la carpeta dist en cualquier hosting estático gratuito
// (GitHub Pages, Netlify, Vercel...) sin configurar rutas.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
})
