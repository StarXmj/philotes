import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  
  // 1. OPTIMISATION : On tente de récupérer le profil en cache immédiatement
  const [profile, setProfile] = useState(() => {
    try {
      const cached = localStorage.getItem('philotes_profile')
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  })
  
  const [loading, setLoading] = useState(true)

  // --- NOUVELLE FONCTION POUR METTRE À JOUR LE PROFIL MANUELLEMENT ---
  const updateProfile = (newProfileData) => {
    // 1. Mise à jour de l'état React (l'interface change tout de suite)
    setProfile(newProfileData)
    // 2. Mise à jour du cache local (pour le prochain rechargement)
    localStorage.setItem('philotes_profile', JSON.stringify(newProfileData))
  }
  // -------------------------------------------------------------------

  // 2. Gestion de la Session (Auth pure)
  useEffect(() => {
    let mounted = true

    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (mounted) {
           setUser(session?.user ?? null)
           if (!session?.user) setLoading(false) 
        }
      } catch (error) {
        console.error("Erreur session:", error)
        if (mounted) setLoading(false)
      }
    }

    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null)
        if (!session?.user) {
            setProfile(null)
            localStorage.removeItem('philotes_profile') // Nettoyage cache
            setLoading(false)
        }
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // 3. Gestion du Profil
  useEffect(() => {
    let mounted = true
    
    const getProfile = async () => {
      if (!user) return

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') {
           console.error("Erreur chargement profil:", error)
        }
        
        if (mounted && data) {
            // On utilise notre nouvelle fonction interne pour tout synchroniser
            updateProfile(data) 
        }
      } catch (err) {
        console.error("Exception profil:", err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    if (user) {
      getProfile()
    }
  }, [user])

  return (
    // On expose 'updateProfile' ici pour pouvoir l'utiliser ailleurs
    <AuthContext.Provider value={{ user, profile, updateProfile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}