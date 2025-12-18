import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { Loader2 } from 'lucide-react'
import Profile from './pages/Profile' // <-- Import
// Tes pages
import Landing from './pages/Landing'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'

// --- LE COMPOSANT INTELLIGENT (COMPLET) ---
function AuthManager({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Vérification initiale
    checkSession()

    // 2. Écoute des changements (Login/Logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setLoading(false)
        navigate('/') 
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        checkProfile(session?.user?.id)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        // --- CAS : PAS CONNECTÉ ---
        // Si on n'est pas sur la page d'accueil, on renvoie à l'accueil
        if (location.pathname !== '/') {
          navigate('/')
        }
        setLoading(false) // IMPORTANT : On arrête de charger
      } else {
        // --- CAS : CONNECTÉ ---
        // On vérifie le profil
        await checkProfile(session.user.id)
      }
    } catch (error) {
      console.error("Erreur session:", error)
      setLoading(false)
    }
  }

  const checkProfile = async (userId) => {
    if (!userId) return

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('pseudo')
        .eq('id', userId)
        .single()

      // --- LOGIQUE DE ROUTAGE ---
      if (profile && profile.pseudo) {
        // CAS 1 : IL A UN PROFIL
        // On le laisse aller sur /app OU /onboarding (pour modifier)
        // Mais s'il est sur l'accueil (/), on l'envoie sur l'app
        if (location.pathname === '/') {
          navigate('/app')
        }
      } else {
        // CAS 2 : PAS DE PROFIL -> On force l'Onboarding
        if (location.pathname !== '/onboarding') {
          navigate('/onboarding')
        }
      }
    } catch (error) {
      console.error("Erreur profil:", error)
    } finally {
      setLoading(false) // CRUCIAL : On arrête de charger quoi qu'il arrive
    }
  }

  // --- L'ÉCRAN DE CHARGEMENT ---
  if (loading) {
    return (
      <div className="min-h-screen bg-philo-dark flex items-center justify-center text-white">
        <Loader2 className="animate-spin w-10 h-10 text-philo-primary" />
      </div>
    )
  }

  return children
}

// --- L'APP PRINCIPALE ---
function App() {
  return (
    <Router>
      <AuthManager>
        <div className="min-h-screen bg-philo-dark text-white font-sans antialiased">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/app" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} /> {/* <-- Nouvelle route */}
          </Routes>
        </div>
      </AuthManager>
    </Router>
  )
}

export default App