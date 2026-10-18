import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './state/AuthContext'
import { ConfirmProvider } from './state/ConfirmContext'
import { ProjectProvider } from './state/ProjectContext'
import { ThemeProvider } from './state/ThemeContext'
import './styles.css'
import './theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <ProjectProvider>
              <ConfirmProvider>
                <App />
              </ConfirmProvider>
            </ProjectProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
