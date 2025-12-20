import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Loader2 } from 'lucide-react'

export default function ProtectedRoute({ children, requireProfile = false }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  // 1. Chargement
  if (loading) {
    return (
      <div className="min-h-screen bg-philo-dark flex items-center justify-center text-white">
        <Loader2 className="animate-spin w-10 h-10 text-philo-primary" />
      </div>
    )
  }

  // 2. Pas connecté -> Accueil
  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />
  }

  // 3. Connecté mais pas de profil -> Force Onboarding
  if (requireProfile && !profile && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }
  
  // 4. Connecté + Profil -> Empêche de refaire l'onboarding (sauf mode edit)
  if (profile && location.pathname === '/onboarding' && !location.state?.mode) {
      return <Navigate to="/app" replace />
  }

  return children
}