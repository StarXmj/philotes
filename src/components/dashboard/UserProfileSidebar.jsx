// src/components/dashboard/UserProfileSidebar.jsx
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { X, Unlink, Sparkles, GraduationCap, MessageCircle, UserPlus, CheckCircle, Clock, ShieldCheck, UserX, HeartHandshake, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import ChatInterface from '../chat/ChatInterface'

export default function UserProfileSidebar({ userId, onClose, similarity, unreadCount, onChatStatusChange, initialProfile, scoreMode }) {
  const [view, setView] = useState('PROFILE')
  // On fusionne les infos reçues du parent (qui contiennent les scores et points communs)
  const [profile, setProfile] = useState(initialProfile || null)
  const [answers, setAnswers] = useState([])
  const [connection, setConnection] = useState(initialProfile?.connection || null)
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(!initialProfile)

  // Gestion du pourcentage d'affichage (Gère le cas 0-1 vs 0-100)
  const displayPercentage = similarity > 1 ? Math.round(similarity) : Math.round(similarity * 100)

  // 1. CHARGEMENT
  useEffect(() => {
    const init = async () => {
      // Si on n'a pas le profil complet, on charge
      if (!profile) setLoading(true)
      
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)

      // On fetch quand même pour avoir les infos fraîches (bio, etc), 
      // MAIS on merge avec les scores existants de initialProfile pour ne pas les perdre
      const { data: fetchedProf } = await supabase.from('profiles').select('*').eq('id', userId).single()
      
      if (fetchedProf) {
        setProfile(prev => ({
           ...fetchedProf,
           // On préserve les scores calculés à la volée s'ils étaient présents dans initialProfile
           personality_score: prev?.personality_score || initialProfile?.personality_score,
           profile_score: prev?.profile_score || initialProfile?.profile_score,
           common_points: prev?.common_points || initialProfile?.common_points
        }))
      }

      // Récupération des réponses au quiz
      const { data: ans } = await supabase.from('user_answers').select('question_id, questions(text), options(text)').eq('user_id', userId)
      setAnswers(ans || [])

      // Si la connexion n'était pas passée via initialProfile, on la cherche
      if (!initialProfile?.connection) {
          const { data: conn } = await supabase
            .from('connections')
            .select('*')
            .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`)
            .maybeSingle()
          setConnection(conn)
      }
      
      setLoading(false)
    }
    if (userId) init()
  }, [userId, initialProfile])

  // 2. REALTIME (Connexions)
  useEffect(() => {
    if (!currentUser || !userId) return
    const channel = supabase.channel(`sidebar-${userId}`)
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, (payload) => {
        if (payload.eventType === 'DELETE') {
             if (connection && payload.old.id === connection.id) setConnection(null)
        } 
        else if (payload.new) {
             const isRelevant = 
               (payload.new.sender_id === currentUser.id && payload.new.receiver_id === userId) || 
               (payload.new.receiver_id === currentUser.id && payload.new.sender_id === userId)
             if (isRelevant) setConnection(payload.new)
        }
    }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, currentUser, connection])

  // --- HANDLERS ---
  const handleClose = () => { if (onChatStatusChange) onChatStatusChange(userId, false); onClose() }

  const openChat = () => { setView('CHAT'); if (onChatStatusChange) onChatStatusChange(userId, true) }
  
  const handleBackToProfile = () => { setView('PROFILE'); if (onChatStatusChange) onChatStatusChange(userId, false) }

  const handleCreateConnection = async (firstMessage) => {
    const tempConn = { status: 'pending', sender_id: currentUser.id, receiver_id: userId }
    setConnection(tempConn)
    const { data: newConn, error: connError } = await supabase
      .from('connections')
      .insert({ sender_id: currentUser.id, receiver_id: userId, status: 'pending', message: firstMessage })
      .select().single()
    if (connError) throw connError
    
    await supabase.from('messages').insert({ 
        connection_id: newConn.id, 
        sender_id: currentUser.id, 
        receiver_id: userId,
        content: firstMessage 
    })
    setConnection(newConn)
    return newConn
  }

  const handleSimpleLinkRequest = async () => {
    setConnection({ status: 'pending', sender_id: currentUser.id, receiver_id: userId })
    const { data: newConn, error } = await supabase
      .from('connections')
      .insert({ sender_id: currentUser.id, receiver_id: userId, status: 'pending', message: "👋 Demande de connexion" })
      .select().single()
    if (!error) setConnection(newConn)
  }

  const handleAccept = async () => {
    setConnection(prev => ({ ...prev, status: 'accepted' }))
    const { data } = await supabase.from('connections').update({ status: 'accepted' }).eq('id', connection.id).select().single()
    setConnection(data)
  }

  const handleBreakLink = async () => {
    if (window.confirm("Es-tu sûr de vouloir couper le lien ?")) {
      const connId = connection.id
      setConnection(null)
      setView('PROFILE')
      if (onChatStatusChange) onChatStatusChange(userId, false) 
      await supabase.from('connections').delete().eq('id', connId)
    }
  }

  const isAccepted = connection?.status === 'accepted'
  const isPending = connection?.status === 'pending'
  const isReceiver = connection?.receiver_id === currentUser?.id

  const getStatusBadge = () => {
    if (isAccepted) return { color: "bg-green-500/20 text-green-400 border-green-500/50", icon: <ShieldCheck size={14} />, text: "Lien Confirmé" }
    if (isPending) return { color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50", icon: <Clock size={14} />, text: "En Attente" }
    return { color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: <UserX size={14} />, text: "Aucun Lien" }
  }
  const statusBadge = getStatusBadge()

  return (
    <motion.div
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed inset-y-0 right-0 w-full md:w-96 bg-slate-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 overflow-hidden flex flex-col"
    >
      {view === 'CHAT' ? (
        <ChatInterface 
          currentUser={currentUser} 
          targetUser={profile} 
          connection={connection}
          onBack={handleBackToProfile} 
          onCreateConnection={handleCreateConnection}
        />
      ) : (
        <div className="flex flex-col h-full overflow-y-auto relative">
          
          {/* HEADER FIXE */}
          <div className="sticky top-0 bg-slate-900/90 backdrop-blur-md border-b border-white/10 p-4 flex justify-between items-center z-10">
            <div className={`px-2 py-1 rounded-full border flex items-center gap-1.5 text-xs font-bold transition-all duration-300 ${statusBadge.color}`}>
               {statusBadge.icon} {statusBadge.text}
            </div>
            
            <div className="flex gap-2">
              {isAccepted && (
                <button onClick={handleBreakLink} className="p-2 hover:bg-red-500/20 text-gray-400 hover:text-red-500 rounded-full transition" title="Rompre le lien">
                  <Unlink size={20} />
                </button>
              )}
              <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-full transition"><X size={24} /></button>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">Scan en cours...</div>
          ) : (
            <div className="p-6 space-y-8 pb-32">
              {/* SECTION IDENTITÉ */}
              <div className="text-center relative">
                <div className="w-24 h-24 bg-gradient-to-br from-philo-primary to-philo-secondary rounded-full mx-auto flex items-center justify-center mb-3 shadow-lg shadow-purple-500/20 relative">
                   {unreadCount > 0 && (
                     <div className="absolute top-0 right-0 w-6 h-6 bg-red-500 rounded-full border-2 border-slate-900 flex items-center justify-center text-white text-[10px] font-bold animate-bounce z-20">
                       {unreadCount}
                     </div>
                   )}
                   {profile?.avatar_public ? <img src={`/avatars/${profile.avatar_public}`} className="w-full h-full object-cover rounded-full" /> : <span className="text-4xl font-bold text-white">{profile?.pseudo?.substring(0,2).toUpperCase()}</span>}
                </div>
                
                <h3 className="text-2xl font-bold text-white">{profile?.pseudo}</h3>
                
                {/* WIDGET SCORE & POINTS COMMUNS */}
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {/* Badge Score */}
                    <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${scoreMode === 'VIBES' ? 'bg-philo-primary/20 text-philo-primary border-philo-primary/30' : 'bg-philo-secondary/20 text-philo-secondary border-philo-secondary/30'}`}>
                        {scoreMode === 'VIBES' ? <Sparkles size={12}/> : <GraduationCap size={12}/>} 
                        {displayPercentage}% {scoreMode === 'VIBES' ? 'Vibes' : 'Profil'}
                    </div>

                    {/* Badge Points Communs */}
                    {profile?.common_points > 0 && (
                        <div className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold border border-emerald-500/30">
                            <HeartHandshake size={12}/> {profile.common_points} Points communs
                        </div>
                    )}
                </div>

                {/* GRILLE INFOS */}
                <div className="mt-6 grid grid-cols-2 gap-2 text-sm">
                  <div className={`p-3 rounded-xl border border-white/5 transition-colors duration-500 ${isAccepted ? 'bg-white/5' : 'bg-black/40'}`}>
                    <span className="block text-gray-500 text-[10px] uppercase">Campus</span>
                    <div className={!isAccepted ? "blur-sm select-none" : ""}>{profile?.etudes_lieu || "???"}</div>
                  </div>
                  <div className={`p-3 rounded-xl border border-white/5 transition-colors duration-500 ${isAccepted ? 'bg-white/5' : 'bg-black/40'}`}>
                    <span className="block text-gray-500 text-[10px] uppercase">Filière</span>
                    <div className={!isAccepted ? "blur-sm select-none" : ""}>{profile?.intitule || "???"}</div>
                  </div>
                  <div className={`p-3 rounded-xl border border-white/5 transition-colors duration-500 ${isAccepted ? 'bg-white/5' : 'bg-black/40'}`}>
                    <span className="block text-gray-500 text-[10px] uppercase">Genre</span>
                    <div className={!isAccepted ? "blur-sm select-none" : ""}>{profile?.sexe || "???"}</div>
                  </div>
                  <div className={`p-3 rounded-xl border border-white/5 transition-colors duration-500 ${isAccepted ? 'bg-white/5' : 'bg-black/40'}`}>
                    <span className="block text-gray-500 text-[10px] uppercase">Age</span>
                    <div className={!isAccepted ? "blur-sm select-none" : ""}>Dévoilé</div>
                  </div>
                </div>
                
                {!isAccepted && (
                  <div className="mt-4 flex justify-center">
                    <span className="bg-black/80 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1 border border-white/20 shadow-xl">
                      <Lock size={12}/> Créer un lien pour voir
                    </span>
                  </div>
                )}
              </div>

              <div className="h-px bg-white/10 w-full" />

              {/* SECTION RÉPONSES */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Sa personnalité</h4>
                {answers.map((item, idx) => (
                  <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <p className="text-[10px] text-philo-secondary uppercase font-bold mb-1">{item.questions?.text}</p>
                    <p className="text-gray-200 text-sm font-medium">{item.options?.text}</p>
                  </motion.div>
                ))}
              </div>

              {/* ACTION BAR */}
              <div className="fixed bottom-0 right-0 w-full md:w-96 p-4 bg-slate-900 border-t border-white/10 backdrop-blur-xl flex flex-col gap-3 z-30">
                {!connection && (
                  <>
                     <button onClick={handleSimpleLinkRequest} className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-white transition flex items-center justify-center gap-2 border border-white/10">
                      <UserPlus size={20} /> Demander un lien
                    </button>
                    <button onClick={openChat} className="w-full py-3 bg-gradient-to-r from-philo-primary to-philo-secondary rounded-xl font-bold text-white hover:opacity-90 transition flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 relative">
                       {unreadCount > 0 && (
                          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center border-2 border-slate-900 animate-bounce z-40">
                            {unreadCount}
                          </span>
                       )}
                      <MessageCircle size={20} /> Envoyer un message
                    </button>
                  </>
                )}

                {isPending && !isReceiver && (
                  <div className="w-full py-3 bg-yellow-500/10 rounded-xl text-yellow-400 font-bold flex items-center justify-center gap-2 border border-yellow-500/20 cursor-not-allowed">
                     <Clock size={20} /> En attente de réponse...
                  </div>
                )}

                {isPending && isReceiver && (
                  <button onClick={handleAccept} className="w-full py-3 bg-green-500 hover:bg-green-600 rounded-xl text-black font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 animate-pulse">
                    <CheckCircle size={20} /> Accepter la demande !
                  </button>
                )}

                {isAccepted && (
                   <button onClick={openChat} className="w-full py-3 bg-philo-primary rounded-xl font-bold text-white hover:opacity-90 transition flex items-center justify-center gap-2 relative">
                    {unreadCount > 0 && (
                        <span className="absolute -top-3 -right-2 bg-red-500 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center border-2 border-slate-900 animate-bounce z-40 shadow-lg">
                          {unreadCount}
                        </span>
                    )}
                    <MessageCircle size={20} /> Discuter
                  </button>
                )}
              </div>

            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}