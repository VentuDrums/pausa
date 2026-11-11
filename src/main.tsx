import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuentes alojadas en la propia web (no en Google Fonts): así nadie fuera de Pausa ve quién la abre.
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/400-italic.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
