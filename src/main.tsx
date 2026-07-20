import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Toaster } from 'sonner'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster
      position="top-center"
      richColors
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
