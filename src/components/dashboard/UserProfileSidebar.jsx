import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { BrainCircuit, X, Unlink, Sparkles, Lock, MessageCircle, UserPlus, CheckCircle, Clock, ShieldCheck, UserX } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import ChatInterface from '../chat/ChatInterface'

export default function UserProfileSidebar({ userId, onClose, similarity, onChatStatusChange, initialUnreadCount = 0 }) {
  const [view, setView] = useState('PROFILE')
  const [profile, setProfile] = useState(null)
  const [answers, setAnswers] = useState([])
  const [connection, setConnection] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount) 

  // --- REFS CRITIQUES POUR LE TEMPS RÉEL ---
  // Ces refs permettent au Realtime d'accéder aux valeurs "fraîches" sans redémarrer l'écouteur
  const connectionRef = useRef(null)
  const viewRef = useRef(view)
  
  // On synchronise les refs à chaque changement d'état
  useEffect(() => { connectionRef.current = connection }, [connection])
  useEffect(() => { viewRef.current = view }, [view])
  // Synchronisation du compteur si le parent le met à jour
  useEffect(() => { if (view === 'PROFILE') setUnreadCount(initialUnreadCount) }, [initialUnreadCount])

  // 1. CHARGEMENT INITIAL DES DONNÉES
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)

      // Charger Profil
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single()
      setProfile(prof)

      // Charger Réponses (Vibe)
      const { data: ans } = await supabase.from('user_answers').select('question_id, questions(text), options(text)').eq('user_id', userId)
      setAnswers(ans || [])

      // Charger Connexion
      const { data: conn } = await supabase
        .from('connections')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`)
        .maybeSingle()
      
      setConnection(conn)
      setLoading(false)
    }
    if (userId) init()
  }, [userId])

  // 2. ABONNEMENT TEMPS RÉEL (ROBUSTE)
  useEffect(() => {
    // On ne s'abonne que si on sait QUI on est et QUI on regarde
    if (!currentUser || !userId) return

    const myId = currentUser.id
    const channel = supabase.channel(`sidebar-${userId}`)

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, (payload) => {
        // CAS : SUPPRESSION (Rupture)
        if (payload.eventType === 'DELETE') {
             // On vérifie si l'ID supprimé correspond à notre connexion actuelle (via la Ref)
             if (connectionRef.current && payload.old.id === connectionRef.current.id) {
                 setConnection(null) // On casse le lien immédiatement
             }
        } 
        // CAS : INSERTION (Demande) ou UPDATE (Acceptation)
        else if (payload.new) {
             const isRelevant = 
               (payload.new.sender_id === myId && payload.new.receiver_id === userId) || 
               (payload.new.receiver_id === myId && payload.new.sender_id === userId)
             
             if (isRelevant) {
                 setConnection(payload.new) // On met à jour (En attente -> Accepté, ou Nouveau lien)
             }
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
         // Notification message
         if (payload.new.sender_id === userId && viewRef.current === 'PROFILE') {
            setUnreadCount(prev => prev + 1)
         }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, currentUser]) // <-- IMPORTANT : Dépend de currentUser pour avoir le bon ID

  useEffect(() => {
    return () => { if (onChatStatusChange) onChatStatusChange(userId, false) }
  }, [userId, onChatStatusChange])

  // --- ACTIONS ---

  const handleCreateConnection = async (firstMessage) => {
    const tempConn = { status: 'pending', sender_id: currentUser.id, receiver_id: userId }
    setConnection(tempConn)

    const { data: newConn, error: connError } = await supabase
      .from('connections')
      .insert({ sender_id: currentUser.id, receiver_id: userId, status: 'pending', message: firstMessage })
      .select().single()

    if (connError) throw connError

    await supabase.from('messages').insert({ connection_id: newConn.id, sender_id: currentUser.id, content: firstMessage })
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
      // On supprime localement tout de suite (optimiste)
      const connId = connection.id
      setConnection(null)
      setView('PROFILE')
      // Puis on supprime en base
      await supabase.from('connections').delete().eq('id', connId)
    }
  }

  const openChat = () => {
    setView('CHAT')
    setUnreadCount(0)
    if (onChatStatusChange) onChatStatusChange(userId, true)
  }

  const handleBackToProfile = () => {
    setView('PROFILE')
    if (onChatStatusChange) onChatStatusChange(userId, false)
  }

  const handleClose = () => {
    if (onChatStatusChange) onChatStatusChange(userId, false)
    onClose()
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
              
              <div className="text-center relative">
                <div className="w-24 h-24 bg-gradient-to-br from-philo-primary to-philo-secondary rounded-full mx-auto flex items-center justify-center mb-3 shadow-lg shadow-purple-500/20 relative">
                   {unreadCount > 0 && (
                     <div className="absolute top-0 right-0 w-6 h-6 bg-red-500 rounded-full border-2 border-slate-900 flex items-center justify-center text-white text-[10px] font-bold animate-bounce z-20">
                       {unreadCount}
                     </div>
                   )}
                  <span className="text-4xl font-bold text-white">{profile?.pseudo?.substring(0,2).toUpperCase()}</span>
                </div>
                <h3 className="text-2xl font-bold text-white">{profile?.pseudo}</h3>
                
                <div className="mt-2 inline-flex items-center gap-1 bg-philo-primary/20 text-philo-primary px-3 py-1 rounded-full text-xs font-bold border border-philo-primary/30">
                  <Sparkles size={12}/> {Math.round(similarity * 100)}% Compatible
                </div>

                <div className="mt-6 grid grid-cols-2 gap-2 text-sm">
                  <motion.div animate={{ filter: isAccepted ? "blur(0px)" : "blur(0px)" }} className={`p-3 rounded-xl border border-white/5 transition-colors duration-500 ${isAccepted ? 'bg-white/5' : 'bg-black/40'}`}>
                    <span className="block text-gray-500 text-[10px] uppercase">Campus</span>
                    <div className={!isAccepted ? "blur-sm select-none" : ""}>{profile?.etudes_lieu || "???"}</div>
                  </motion.div>
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
                  <div className="absolute top-44 left-0 w-full flex justify-center pointer-events-none">
                    <span className="bg-black/80 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1 border border-white/20 shadow-xl">
                      <Lock size={12}/> Créer un lien pour voir
                    </span>
                  </div>
                )}
              </div>

              <div className="h-px bg-white/10 w-full" />

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