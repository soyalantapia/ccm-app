import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
// Sistema visual CCM 2026 (mockups aprobados): Playfair Display (display/editorial)
// + Montserrat (UI). Auto-hospedadas vía fontsource (bundle offline, sin Google Fonts).
import '@fontsource-variable/playfair-display/index.css'
import '@fontsource-variable/montserrat/index.css'
import './index.css'
import App from './App'
import { queryClient } from './lib/queryClient'
import { initTheme } from './lib/theme'
import { ensureDevice } from './lib/identity'
import { instalarDropGuard } from './lib/dropGuard'

// El service worker lo registra <UpdatePrompt/> (useRegisterSW) para poder
// avisar "nueva versión disponible" en vez de dejar un build viejo en pantalla.
initTheme()
ensureDevice()
// Soltar una foto encima del formulario hacía que el navegador navegara al archivo y se
// llevara puesto todo lo cargado. Ver src/lib/dropGuard.ts.
instalarDropGuard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
