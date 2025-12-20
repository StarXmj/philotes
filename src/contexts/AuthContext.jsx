import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // 1. Gère la session utilisateur (Auth pure)
  useEffect(() => {
    let mounted = true

    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (mounted) {
           setUser(session?.user ?? null)
           if (!session?.user) setLoading(false) // Si pas de user, on arrête de charger direct
        }
      } catch (error) {
        console.error("Erreur session:", error)
        if (mounted) setLoading(false)
      }
    }

    getSession()

    // Écouteur de changements (Login/Logout)
    // IMPORTANT : PAS d'async/await ici pour éviter le deadlock Supabase !
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null)
        if (!session?.user) {
            setProfile(null)
            setLoading(false)
        }
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // 2. Gère le profil (Séparé pour ne pas bloquer l'auth)
  useEffect(() => {
    let mounted = true
    
    const getProfile = async () => {
      if (!user) return

      try {
        // On ne met pas loading=true ici pour ne pas faire clignoter l'interface
        // si l'utilisateur est déjà là.
        
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') {
           console.error("Erreur chargement profil:", error)
        }
        
        if (mounted) setProfile(data)
      } catch (err) {
        console.error("Exception profil:", err)
      } finally {
        if (mounted) setLoading(false) // C'est ici qu'on libère l'application
      }
    }

    if (user) {
      getProfile()
    }
  }, [user]) // Se déclenche uniquement quand "user" change

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}