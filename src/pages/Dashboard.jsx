import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { motion, AnimatePresence } from 'framer-motion'
import { User, MessageCircle, LogOut, UserCircle, X, BrainCircuit, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// --- 1. LE COMPOSANT SIDEBAR (Détails du profil) ---
const UserProfileSidebar = ({ userId, onClose, similarity }) => {
  const [profile, setProfile] = useState(null)
  const [answers, setAnswers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUserDetails = async () => {
      setLoading(true)
      
      // A. Récupérer le pseudo (On masque intentionnellement le reste)
      const { data: prof } = await supabase
        .from('profiles')
        .select('pseudo, id') 
        .eq('id', userId)
        .single()
      
      setProfile(prof)

      // B. Récupérer les Réponses au Quiz (La "Vibe")
      const { data: ans } = await supabase
        .from('user_answers')
        .select(`
          question_id,
          questions ( text ),
          options ( text )
        `)
        .eq('user_id', userId)

      if (ans) setAnswers(ans)
      setLoading(false)
    }

    if (userId) fetchUserDetails()
  }, [userId])

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed inset-y-0 right-0 w-full md:w-96 bg-slate-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 overflow-y-auto"
    >
      {/* Header Sidebar */}
      <div className="sticky top-0 bg-slate-900/90 backdrop-blur-md border-b border-white/10 p-4 flex justify-between items-center z-10">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <BrainCircuit className="text-philo-primary" /> 
          Analyse Vibe
        </h2>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition">
          <X size={24} />
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Décryptage du profil...</div>
      ) : (
        <div className="p-6 space-y-8">
          
          {/* PSEUDO & MATCH */}
          <div className="text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-philo-primary to-philo-secondary rounded-full mx-auto flex items-center justify-center mb-3 shadow-lg shadow-purple-500/20">
              <span className="text-3xl font-bold text-white">{profile?.pseudo?.substring(0,2).toUpperCase()}</span>
            </div>
            <h3 className="text-2xl font-bold text-white">{profile?.pseudo}</h3>
            
            {/* Badge de compatibilité */}
            <div className="mt-2 inline-flex items-center gap-1 bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm font-bold border border-green-500/30">
              <Sparkles size={14}/> {Math.round(similarity * 100)}% Compatible
            </div>
          </div>

          <div className="h-px bg-white/10 w-full" />

          {/* LISTE DES QUESTIONS / RÉPONSES */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Sa personnalité</h4>
            
            {answers.length > 0 ? (
              answers.map((item, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-white/5 p-3 rounded-xl border border-white/5 hover:border-philo-primary/30 transition-colors"
                >
                  <p className="text-[10px] text-philo-secondary uppercase font-bold mb-1">
                    {item.questions?.text}
                  </p>
                  <p className="text-gray-200 text-sm font-medium">
                    {item.options?.text}
                  </p>
                </motion.div>
              ))
            ) : (
              <p className="text-gray-500 italic text-center text-sm">Ce profil n'a pas encore répondu au quiz détaillé.</p>
            )}
          </div>

          {/* ACTIONS */}
          <button className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition flex items-center justify-center gap-2 mt-8">
            <MessageCircle size={20} />
            Envoyer un message
          </button>

        </div>
      )}
    </motion.div>
  )
}


// --- 2. LE DASHBOARD PRINCIPAL ---
export default function Dashboard() {
  const navigate = useNavigate()
  const [matches, setMatches] = useState([])
  const [myProfile, setMyProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  
  // État pour gérer le profil ouvert (Sidebar)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [selectedSimilarity, setSelectedSimilarity] = useState(0)

  useEffect(() => {
    fetchMatches()
  }, [])

  const fetchMatches = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return navigate('/')

      // Récupérer MON profil
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      setMyProfile(profile)

      if (profile && profile.embedding) {
        // Recherche Vectorielle (IA)
        const { data: matchedUsers, error } = await supabase.rpc('match_students', {
          query_embedding: profile.embedding,
          match_threshold: 0.5,
          match_count: 6
        })

        if (error) console.error('Erreur matching:', error)
        
        const others = matchedUsers ? matchedUsers.filter(p => p.id !== user.id) : []
        setMatches(others)
      }
    } catch (error) {
      console.error("Erreur:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut() 
  }

  // Fonction pour ouvrir la sidebar
  const openProfile = (user) => {
    setSelectedUserId(user.id)
    setSelectedSimilarity(user.similarity)
  }

  if (loading) return <div className="min-h-screen bg-philo-dark flex items-center justify-center text-white">Chargement de la constellation...</div>

  return (
    <div className="min-h-screen bg-philo-dark text-white p-4 relative overflow-hidden">
      
      {/* Header */}
      <div className="flex justify-between items-center z-20 w-full max-w-4xl mx-auto py-4 px-4">
        <h1 className="text-2xl font-bold">Philotès<span className="text-philo-primary">.</span></h1>
        
        <div className="flex gap-2">
          <button onClick={() => navigate('/profile')} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition" title="Mon Profil">
             <UserCircle size={20} />
          </button>
          <button onClick={handleLogout} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition" title="Déconnexion">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* LA CONSTELLATION (Zone centrale) */}
      <div className="relative h-[600px] w-full flex items-center justify-center">
        
        {/* MOI (Au centre) */}
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="z-20 w-24 h-24 rounded-full bg-gradient-to-br from-philo-primary to-philo-secondary flex flex-col items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.5)] border-4 border-philo-dark"
        >
          <span className="text-2xl">😎</span>
          <span className="text-xs font-bold mt-1">{myProfile?.pseudo || 'Moi'}</span>
        </motion.div>

        {/* LES MATCHS (En orbite) */}
        {matches.length === 0 ? (
          <p className="absolute mt-32 text-gray-400">Aucun profil compatible trouvé pour l'instant...</p>
        ) : (
          matches.map((match, index) => {
            const angle = (index / matches.length) * 2 * Math.PI
            const radius = 160 
            const x = Math.cos(angle) * radius
            const y = Math.sin(angle) * radius

            return (
              <motion.div
                key={match.id}
                initial={{ opacity: 0, x: 0, y: 0 }}
                animate={{ opacity: 1, x: x, y: y }}
                transition={{ delay: index * 0.1, type: 'spring' }}
                className="absolute z-10 flex flex-col items-center cursor-pointer group"
                whileHover={{ scale: 1.1 }}
                onClick={() => openProfile(match)} // <--- CLIC ICI OUVRE LA SIDEBAR
              >
                {/* La Bulle du Match */}
                <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center group-hover:bg-philo-primary/20 group-hover:border-philo-primary transition-colors relative">
                  <User className="text-gray-300 group-hover:text-white" />
                  
                  {/* Badge de pourcentage */}
                  <div className="absolute -top-2 -right-2 bg-green-500 text-black text-xs font-bold px-2 py-1 rounded-full">
                    {Math.round(match.similarity * 100)}%
                  </div>
                </div>

                {/* Info sous la bulle */}
                <div className="mt-2 text-center">
                  <p className="font-bold text-sm">{match.pseudo}</p>
                  {/* On affiche le domaine pour donner une petite idée sans tout dire */}
                  <p className="text-[10px] text-gray-400">{match.domaine || 'Étudiant'}</p>
                </div>
              </motion.div>
            )
          })
        )}
      </div>

      {/* Info contextuelle */}
      <div className="absolute bottom-6 left-0 w-full text-center text-sm text-gray-500">
        Clique sur une planète pour analyser la vibe 🪐
      </div>

      {/* --- SIDEBAR INTELLIGENTE --- */}
      <AnimatePresence>
        {selectedUserId && (
          <>
            {/* Overlay sombre */}
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedUserId(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            
            {/* Le panneau latéral */}
            <UserProfileSidebar 
              userId={selectedUserId}
              similarity={selectedSimilarity}
              onClose={() => setSelectedUserId(null)} 
            />
          </>
        )}
      </AnimatePresence>

    </div>
  )
}