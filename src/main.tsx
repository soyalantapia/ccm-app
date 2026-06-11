import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/fraunces/opsz-italic.css'
import '@fontsource-variable/archivo/index.css'
import './index.css'
import App from './App'
import { initTheme } from './lib/theme'
import { ensureDevice } from './lib/identity'
import { registerSW } from 'virtual:pwa-register'

initTheme()
ensureDevice()
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
