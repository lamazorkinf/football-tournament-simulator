import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
import App from './App.tsx'
import { Toaster } from 'sonner'
import { clearLegacyTournamentStorage } from './lib/hydrateSettings'

// La app ya no persiste torneos en localStorage: Supabase es la única fuente de
// verdad. Se borra la copia que dejó el `persist` viejo (las preferencias se
// migran aparte, en hydrateSettings, antes de borrarse).
clearLegacyTournamentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
    <Toaster
      position="top-center"
      theme="dark"
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            'bg-grass-dark border-4 border-line shadow-hard-panel font-terminal text-white rounded-none',
          title: 'font-terminal text-white',
          description: 'font-terminal text-grass-soft',
          actionButton: 'font-arcade text-[10px] uppercase bg-gold text-night border-2 border-white',
          cancelButton: 'font-arcade text-[10px] uppercase bg-transparent text-grass-soft border-2 border-line',
          closeButton: 'bg-grass-dark border-2 border-line text-white',
        },
      }}
    />
  </StrictMode>,
)
