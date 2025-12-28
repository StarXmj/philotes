import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Loader2 } from 'lucide-react'

export default function ProtectedRoute({ children }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  // 1. Chargement en cours...
  if (loading) {
    return (
      <div className="min-h-screen bg-philo-dark flex items-center justify-center">
        <Loader2 className="animate-spin text-philo-primary w-10 h-10" />
      </div>
    )
  }

  // 2. Pas connecté -> Login
  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />
  }

  // 3. Connecté mais Profil vide -> Onboarding
  // NOUVELLE LOGIQUE : On vérifie si les champs clés sont là (SANS embedding)
  const isProfileComplete = 
      profile?.pseudo && 
      profile?.etudes_lieu && 
      profile?.dimensions && // On vérifie que le quiz est fait
      Object.keys(profile.dimensions).length > 0;

  if (!isProfileComplete) {
    // Si on est déjà sur /onboarding, on ne redirige pas (sinon boucle infinie)
    if (location.pathname.startsWith('/onboarding')) {
        return children
    }
    return <Navigate to="/onboarding" replace />
  }

  // 4. Tout est bon -> Accès autorisé
  return children
}