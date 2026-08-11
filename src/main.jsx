import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Self-hosted, so the app never asks Google for a font and works in airplane
// mode. Latin subset only, and only the three weights the design uses: the
// service worker precaches every font file, and the cyrillic, greek and
// vietnamese subsets would be a few hundred KB of download to render nine
// digits and one word of chrome.
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-600.css'

import './styles/app.css'
import App from './App.jsx'
import { takeUpdates } from './lib/updates.js'

takeUpdates()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
