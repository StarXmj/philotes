import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  
  // 1. OPTIMISATION : On tente de récupérer le profil en cache immédiatement
  // Cela évite l'écran blanc/loading si l'utilisateur revient sur le site
  const [profile, setProfile] = useState(() => {
    try {
      const cached = localStorage.getItem('philotes_profile')
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  })
  
  const [loading, setLoading] = useState(true)

  // 2. Gestion de la Session (Auth pure)
  useEffect(() => {
    let mounted = true

    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (mounted) {
           setUser(session?.user ?? null)
           // Si pas d'user, on arrête le chargement tout de suite
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

  // 3. Gestion du Profil (Avec stratégie "Stale-While-Revalidate")
  useEffect(() => {
    let mounted = true
    
    const getProfile = async () => {
      if (!user) return

      try {
        // Note : On ne remet PAS loading=true ici si on a déjà un profil (Optimistic UI)
        // L'interface reste affichée avec les vieilles données pendant qu'on cherche les nouvelles.
        
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') {
           console.error("Erreur chargement profil:", error)
        }
        
        if (mounted && data) {
            setProfile(data)
            // Mise à jour du cache pour la prochaine fois
            localStorage.setItem('philotes_profile', JSON.stringify(data))
        }
      } catch (err) {
        console.error("Exception profil:", err)
      } finally {
        if (mounted) setLoading(false) // On libère l'application
      }
    }

    if (user) {
      getProfile()
    }
  }, [user])

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}