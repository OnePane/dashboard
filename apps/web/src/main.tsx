import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthGate } from './AuthGate'
import { isDemoMode } from './mode'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDemoMode ? <App /> : <AuthGate><App /></AuthGate>}
  </StrictMode>,
)
