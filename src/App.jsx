// src/App.jsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { OnboardingProvider } from './contexts/OnboardingContext'
import ProtectedRoute from './components/ProtectedRoute'

// --- IMPORT DE LA GESTION PWA ---
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useEffect } from 'react'

// Pages
import HomePage from './pages/HomePage'
import Landing from './pages/Landing'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import UpdatePassword from './pages/UpdatePassword'
import RandomChatMode from './pages/RandomChatMode'

const queryClient = new QueryClient()

export default function App() {
  
  // --- LOGIQUE DE MISE À JOUR AUTO (PWA) ---
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered')
      // Vérifier les mises à jour toutes les heures (optionnel)
      r && setInterval(() => {
        r.update()
      }, 60 * 60 * 1000)
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  })

  // Dès qu'une mise à jour est prête (needRefresh), on force le reload
  useEffect(() => {
    if (needRefresh) {
      updateServiceWorker(true)
    }
  }, [needRefresh, updateServiceWorker])
  // -----------------------------------

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Routes>
             {/* 1. La Racine devient la page de présentation (Vitrine) */}
             <Route path="/" element={<HomePage />} />

             {/* 2. L'ancienne page Landing devient /auth (Connexion/Inscription) */}
             <Route path="/auth" element={<Landing />} />

             {/* Redirection de confort : si qqun tape /login, il va sur /auth */}
             <Route path="/login" element={<Navigate to="/auth" replace />} />

             {/* Réinitialisation de mot de passe */}
             <Route path="/update-password" element={<UpdatePassword />} />
             
             {/* Routes Protégées (Nécessite connexion) */}
             <Route path="/onboarding" element={
                <ProtectedRoute>
                    <OnboardingProvider>
                        <Onboarding />
                    </OnboardingProvider>
                </ProtectedRoute>
             } />

             <Route path="/app" element={
                <ProtectedRoute>
                    <Dashboard />
                </ProtectedRoute>
             } />

             <Route path="/profile" element={
                <ProtectedRoute>
                    <Profile />
                </ProtectedRoute>
             } />

             <Route path="/random" element={
                <ProtectedRoute>
                    <RandomChatMode />
                </ProtectedRoute>
             } />

          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  )
}