// src/App.jsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { OnboardingProvider } from './contexts/OnboardingContext'
import ProtectedRoute from './components/ProtectedRoute'

// Pages
import HomePage from './pages/HomePage' // <--- NOUVEL IMPORT
import Landing from './pages/Landing'   // <--- C'est ton Auth/Login
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import UpdatePassword from './pages/UpdatePassword'
import RandomChatMode from './pages/RandomChatMode'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Routes>
            {/* 1. La Racine devient la page de présentation */}
            <Route path="/" element={<HomePage />} />

            {/* 2. L'ancienne page Landing devient /auth */}
            <Route path="/auth" element={<Landing />} />

            {/* Redirection de confort : si qqun tape /login, il va sur /auth */}
            <Route path="/login" element={<Navigate to="/auth" replace />} />

            {/* Le reste ne change pas */}
            <Route path="/update-password" element={<UpdatePassword />} />
            
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