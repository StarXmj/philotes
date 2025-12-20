// src/App.jsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext' // <-- Import
import ProtectedRoute from './components/ProtectedRoute' // <-- Import

import Profile from './pages/Profile'
import UpdatePassword from './pages/UpdatePassword'
import Landing from './pages/Landing'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'

// Petit wrapper pour rediriger automatiquement depuis la Landing si déjà connecté
const PublicOnlyRoute = ({ children }) => {
  const { user, loading } = useAuth()
  if (loading) return null // ou un spinner
  if (user) return <Navigate to="/app" replace />
  return children
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-philo-dark text-white font-sans antialiased">
          <Routes>
            {/* Route Publique (Landing) */}
            <Route path="/" element={
              <PublicOnlyRoute>
                <Landing />
              </PublicOnlyRoute>
            } />

            {/* Route Semi-Privée (Onboarding) : Nécessite Auth, mais pas forcément de profil */}
            <Route path="/onboarding" element={
              <ProtectedRoute requireProfile={false}>
                <Onboarding />
              </ProtectedRoute>
            } />

            {/* Routes Privées (App) : Nécessitent Auth ET Profil complet */}
            <Route path="/app" element={
              <ProtectedRoute requireProfile={true}>
                <Dashboard />
              </ProtectedRoute>
            } />
            
            <Route path="/profile" element={
              <ProtectedRoute requireProfile={true}>
                <Profile />
              </ProtectedRoute>
            } />
            
            <Route path="/update-password" element={
              <ProtectedRoute requireProfile={false}>
                <UpdatePassword />
              </ProtectedRoute>
            } />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  )
}

export default App