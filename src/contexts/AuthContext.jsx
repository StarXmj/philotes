import { createContext, useContext, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query' // <-- Nouveau standard
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const queryClient = useQueryClient()

  // 1. Gestion de la Session (Auth pure)
  // On garde useEffect ici car c'est un listener (abonnement) et non une simple requête
  useEffect(() => {
    let mounted = true

    const getSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) throw error // On capture l'erreur proprement
        
        if (mounted) {
           setUser(session?.user ?? null)
           setAuthLoading(false)
        }
      } catch (error) {
        console.error("Erreur session:", error)
        if (mounted) setAuthLoading(false)
      }
    }

    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
      
      // Si déconnexion, on vide le cache du profil immédiatement pour sécurité
      if (!session?.user) {
        queryClient.removeQueries(['profile'])
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [queryClient])

  // 2. Gestion du Profil avec TanStack Query (Le Correctif)
  // Remplace l'ancien useEffect et la gestion manuelle du localStorage
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', user?.id], // La requête dépend de l'ID user
    queryFn: async ({ signal }) => {
      if (!user?.id) return null
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
        .abortSignal(signal) // <--- CORRECTION MEMORY LEAK : Annule la requête si démonté

      if (error && error.code !== 'PGRST116') {
         throw error
      }
      return data || null
    },
    enabled: !!user?.id, // Ne lance la requête que si on a un user
    staleTime: 1000 * 60 * 5, // Le profil est considéré "frais" pendant 5 minutes
  })

  // 3. Helper pour mettre à jour le profil (Optimistic Update)
  const updateProfile = (newProfileData) => {
    // Au lieu d'écrire dans localStorage, on met à jour le cache React Query
    // Cela mettra à jour l'UI partout instantanément
    queryClient.setQueryData(['profile', user?.id], newProfileData)
  }

  // Calcul de l'état de chargement global
  // On charge si l'auth charge OU si l'utilisateur est connecté mais que son profil charge encore
  const loading = authLoading || (!!user && profileLoading)

  return (
    <AuthContext.Provider value={{ user, profile, updateProfile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}