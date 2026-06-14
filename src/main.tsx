import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/archivo/index.css'
import './index.css'
import App from './App'
import { initTheme } from './lib/theme'
import { ensureDevice } from './lib/identity'

// El service worker lo registra <UpdatePrompt/> (useRegisterSW) para poder
// avisar "nueva versión disponible" en vez de dejar un build viejo en pantalla.
initTheme()
ensureDevice()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
