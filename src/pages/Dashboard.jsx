import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { motion, AnimatePresence } from 'framer-motion'
import { User, MessageCircle, LogOut, UserCircle, X, BrainCircuit, Sparkles, Send, ArrowLeft, Clock, Lock, CheckCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// Ajoute useRef dans les imports si ce n'est pas déjà fait
import { useEffect, useState, useRef } from 'react'

// ... (Gardez les autres imports)

// --- PETIT COMPOSANT : LES 3 POINTS QUI BOUGENT ---
const TypingIndicator = () => (
  <div className="flex items-center gap-1 p-3 bg-white/10 rounded-2xl rounded-tl-none w-fit">
    <motion.div
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
      className="w-1.5 h-1.5 bg-gray-400 rounded-full"
    />
    <motion.div
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
      className="w-1.5 h-1.5 bg-gray-400 rounded-full"
    />
    <motion.div
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
      className="w-1.5 h-1.5 bg-gray-400 rounded-full"
    />
  </div>
)

// --- COMPOSANT CHAT AVEC REALTIME ---
const ChatInterface = ({ currentUser, targetUser, connection, onBack, onCreateConnection }) => {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [isRemoteTyping, setIsRemoteTyping] = useState(false) // Est-ce que l'autre écrit ?
  
  const messagesEndRef = useRef(null)
  const channelRef = useRef(null) // Pour garder la connexion ouverte
  const typingTimeoutRef = useRef(null) // Pour arrêter l'animation si ça s'arrête

  // 1. CHARGEMENT INITIAL + TEMPS RÉEL
  useEffect(() => {
    if (!connection?.id) return

    // A. Charger l'historique
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('connection_id', connection.id)
        .order('created_at', { ascending: true })
      setMessages(data || [])
    }
    fetchMessages()

    // B. Mettre en place le canal Temps Réel (Supabase Realtime)
    // On crée un canal unique pour cette conversation
    channelRef.current = supabase.channel(`room:${connection.id}`)

    channelRef.current
      // 1. Écouter les nouveaux messages (INSERT dans la DB)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `connection_id=eq.${connection.id}`
        },
        (payload) => {
          // On ajoute le message seulement si on ne l'a pas déjà (pour éviter les doublons avec l'ajout optimiste)
          setMessages((current) => {
            const exists = current.find(m => m.id === payload.new.id)
            if (exists) return current
            return [...current, payload.new]
          })
          // Si on reçoit un message, l'autre a fini d'écrire
          setIsRemoteTyping(false)
        }
      )
      // 2. Écouter le signal "Typing..." (Broadcast éphémère)
      .on('broadcast', { event: 'typing' }, (payload) => {
        // On vérifie que ce n'est pas moi qui écris (au cas où)
        if (payload.userId !== currentUser.id) {
          setIsRemoteTyping(true)
          
          // On efface les points après 3 secondes sans nouveau signal
          clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = setTimeout(() => {
            setIsRemoteTyping(false)
          }, 3000)
        }
      })
      .subscribe()

    // Nettoyage quand on quitte le chat
    return () => {
      supabase.removeChannel(channelRef.current)
    }
  }, [connection, currentUser.id])

  // Scroll auto vers le bas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isRemoteTyping]) // On scroll aussi quand "..." apparait

  // Fonction pour dire "J'écris..."
  const handleTyping = (e) => {
    setInputText(e.target.value)

    if (connection?.id && channelRef.current) {
      // On envoie un signal léger aux autres abonnés du canal
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUser.id }
      })
    }
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!inputText.trim()) return

    const text = inputText
    setInputText('') // Clear immédiat
    // On arrête d'envoyer le signal typing (optionnel, le timeout gérera)
    
    // Logique d'envoi (inchangée)
    try {
      let currentConn = connection
      if (!currentConn) {
        currentConn = await onCreateConnection(text)
      } else {
        await supabase.from('messages').insert({
          connection_id: currentConn.id,
          sender_id: currentUser.id,
          content: text
        })
      }
    } catch (error) {
      console.error("Erreur envoi:", error)
    }
  }

  // (Fonction calculateTimeLeft inchangée...)
  const calculateTimeLeft = () => {
    if (!connection) return "24h 00m"
    if (connection.status === 'accepted') return "Illimité"
    const created = new Date(connection.created_at)
    const expire = new Date(created.getTime() + 24 * 60 * 60 * 1000)
    const now = new Date()
    const diff = expire - now
    if (diff <= 0) return "Expiré"
    const h = Math.floor(diff / (1000 * 60 * 60))
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    return `${h}h ${m}m`
  }

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* HEADER */}
      <div className="flex items-center gap-3 p-4 bg-slate-800 border-b border-white/10 shadow-md z-10">
        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition text-gray-300">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h3 className="font-bold text-white">{targetUser.pseudo}</h3>
          <div className="flex items-center gap-1 text-xs text-yellow-400 font-mono">
            <Clock size={12} />
            {calculateTimeLeft()} avant disparition
          </div>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/20">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 text-sm mt-10 p-4">
            <p>C'est le début d'un nouveau lien. ✨</p>
          </div>
        )}

        {messages.map((msg) => {
          const isMe = msg.sender_id === currentUser.id
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                isMe 
                  ? 'bg-philo-primary text-white rounded-tr-none' 
                  : 'bg-white/10 text-gray-200 rounded-tl-none'
              }`}>
                {msg.content}
              </div>
            </div>
          )
        })}

        {/* INDICATEUR DE FRAPPE (Apparaît si l'autre écrit) */}
        {isRemoteTyping && (
          <div className="flex justify-start">
            <TypingIndicator />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}
      <form onSubmit={sendMessage} className="p-3 bg-slate-800 border-t border-white/10 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={handleTyping} // <-- On a changé onChange ici
          placeholder="Ton message..."
          className="flex-1 bg-black/30 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:border-philo-primary outline-none"
        />
        <button 
          disabled={!inputText.trim()}
          type="submit" 
          className="p-3 bg-philo-primary hover:bg-philo-secondary rounded-full text-white transition disabled:opacity-50"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  )
}


// --- SIDEBAR INTELLIGENTE (Gère Profil OU Chat) ---
const UserProfileSidebar = ({ userId, onClose, similarity }) => {
  const [view, setView] = useState('PROFILE') // 'PROFILE' ou 'CHAT'
  const [profile, setProfile] = useState(null)
  const [answers, setAnswers] = useState([])
  const [connection, setConnection] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)

      // 1. Profil Cible
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single()
      setProfile(prof)

      // 2. Vibe
      const { data: ans } = await supabase.from('user_answers').select('question_id, questions(text), options(text)').eq('user_id', userId)
      setAnswers(ans || [])

      // 3. Connexion existante ?
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

  // Création de la connexion lors du premier message
  // Création de la connexion lors du premier message
  const handleCreateConnection = async (firstMessage) => {
    // 1. Créer la connexion
    const { data: newConn, error: connError } = await supabase
      .from('connections')
      .insert({
        sender_id: currentUser.id,
        receiver_id: userId,
        status: 'pending',
        message: firstMessage // <--- C'EST LA LIGNE QUI MANQUAIT !
      })
      .select()
      .single()

    if (connError) throw connError

    // 2. Insérer le premier message dans la table messages
    await supabase.from('messages').insert({
      connection_id: newConn.id,
      sender_id: currentUser.id,
      content: firstMessage
    })

    setConnection(newConn)
    return newConn
  }

  // Accepter la demande
  const handleAccept = async () => {
    const { data } = await supabase.from('connections').update({ status: 'accepted' }).eq('id', connection.id).select().single()
    setConnection(data)
  }

  const isAccepted = connection?.status === 'accepted'
  const isReceiver = connection?.receiver_id === currentUser?.id

  return (
    <motion.div
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed inset-y-0 right-0 w-full md:w-96 bg-slate-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 overflow-hidden flex flex-col"
    >
      {/* --- VUE CHAT --- */}
      {view === 'CHAT' ? (
        <ChatInterface 
          currentUser={currentUser} 
          targetUser={profile} 
          connection={connection}
          onBack={() => setView('PROFILE')} // Retour au profil
          onCreateConnection={handleCreateConnection}
        />
      ) : (
        
        /* --- VUE PROFIL --- */
        <div className="flex flex-col h-full overflow-y-auto">
          {/* Header Profil */}
          <div className="sticky top-0 bg-slate-900/90 backdrop-blur-md border-b border-white/10 p-4 flex justify-between items-center z-10">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BrainCircuit className="text-philo-primary" /> Vibe Check
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition"><X size={24} /></button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">Scan en cours...</div>
          ) : (
            <div className="p-6 space-y-8 pb-20">
              
              {/* IDENTITÉ */}
              <div className="text-center relative">
                <div className="w-24 h-24 bg-gradient-to-br from-philo-primary to-philo-secondary rounded-full mx-auto flex items-center justify-center mb-3 shadow-lg shadow-purple-500/20">
                  <span className="text-4xl font-bold text-white">{profile?.pseudo?.substring(0,2).toUpperCase()}</span>
                </div>
                <h3 className="text-2xl font-bold text-white">{profile?.pseudo}</h3>
                
                <div className="mt-2 inline-flex items-center gap-1 bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-xs font-bold border border-green-500/30">
                  <Sparkles size={12}/> {Math.round(similarity * 100)}% Compatible
                </div>

                {/* INFOS FLOUTÉES */}
                <div className="mt-6 grid grid-cols-2 gap-2 text-sm">
                  <div className={`p-3 rounded-xl border border-white/5 ${isAccepted ? 'bg-white/5' : 'bg-black/40 blur-sm select-none'}`}>
                    <span className="block text-gray-500 text-[10px] uppercase">Campus</span>
                    {isAccepted ? profile?.etudes_lieu : "???"}
                  </div>
                  <div className={`p-3 rounded-xl border border-white/5 ${isAccepted ? 'bg-white/5' : 'bg-black/40 blur-sm select-none'}`}>
                    <span className="block text-gray-500 text-[10px] uppercase">Filière</span>
                    {isAccepted ? profile?.intitule : "???"}
                  </div>
                  <div className={`p-3 rounded-xl border border-white/5 ${isAccepted ? 'bg-white/5' : 'bg-black/40 blur-sm select-none'}`}>
                    <span className="block text-gray-500 text-[10px] uppercase">Genre</span>
                    {isAccepted ? profile?.sexe : "???"}
                  </div>
                  <div className={`p-3 rounded-xl border border-white/5 ${isAccepted ? 'bg-white/5' : 'bg-black/40 blur-sm select-none'}`}>
                    <span className="block text-gray-500 text-[10px] uppercase">Age</span>
                    {isAccepted ? "Dévoilé" : "???"} 
                  </div>
                </div>
                
                {!isAccepted && (
                  <div className="absolute top-40 left-0 w-full flex justify-center">
                    <span className="bg-black/80 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1 border border-white/20">
                      <Lock size={12}/> Créer un lien pour voir
                    </span>
                  </div>
                )}
              </div>

              <div className="h-px bg-white/10 w-full" />

              {/* LA VIBE */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Sa personnalité</h4>
                {answers.map((item, idx) => (
                  <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <p className="text-[10px] text-philo-secondary uppercase font-bold mb-1">{item.questions?.text}</p>
                    <p className="text-gray-200 text-sm font-medium">{item.options?.text}</p>
                  </motion.div>
                ))}
              </div>

              {/* BARRE D'ACTION (FIXE EN BAS) */}
              <div className="fixed bottom-0 right-0 w-full md:w-96 p-4 bg-slate-900 border-t border-white/10 backdrop-blur-xl">
                {connection && !isAccepted && isReceiver ? (
                  // CAS : Demande reçue
                  <button onClick={handleAccept} className="w-full py-3 bg-green-500 hover:bg-green-600 rounded-xl text-black font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-500/20">
                    <CheckCircle size={20} /> Accepter le lien ({profile?.pseudo})
                  </button>
                ) : (
                  // CAS : Pas de lien ou déjà accepté ou envoyé par moi
                  <button 
                    onClick={() => setView('CHAT')}
                    className="w-full py-3 bg-gradient-to-r from-philo-primary to-philo-secondary rounded-xl font-bold text-white hover:opacity-90 transition flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20"
                  >
                    <MessageCircle size={20} />
                    {connection ? "Ouvrir la discussion" : "Envoyer un signal"}
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

// --- DASHBOARD (Inchangé) ---
export default function Dashboard() {
  const navigate = useNavigate()
  const [matches, setMatches] = useState([])
  const [myProfile, setMyProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null) 

  useEffect(() => {
    const fetchMatches = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return navigate('/')

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setMyProfile(profile)

      if (profile && profile.embedding) {
        const { data: matchedUsers } = await supabase.rpc('match_students', {
          query_embedding: profile.embedding,
          match_threshold: 0.5,
          match_count: 6
        })
        setMatches(matchedUsers ? matchedUsers.filter(p => p.id !== user.id) : [])
      }
      setLoading(false)
    }
    fetchMatches()
  }, [navigate])

  const handleLogout = async () => await supabase.auth.signOut() 

  if (loading) return <div className="min-h-screen bg-philo-dark flex items-center justify-center text-white">Chargement...</div>

  return (
    <div className="min-h-screen bg-philo-dark text-white p-4 relative overflow-hidden">
      
      <div className="flex justify-between items-center z-20 w-full max-w-4xl mx-auto py-4 px-4">
        <h1 className="text-2xl font-bold">Philotès<span className="text-philo-primary">.</span></h1>
        <div className="flex gap-2">
          <button onClick={() => navigate('/profile')} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition"><UserCircle size={20} /></button>
          <button onClick={handleLogout} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition"><LogOut size={20} /></button>
        </div>
      </div>

      <div className="relative h-[600px] w-full flex items-center justify-center">
        {/* MOI */}
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="z-20 w-24 h-24 rounded-full bg-gradient-to-br from-philo-primary to-philo-secondary flex flex-col items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.5)] border-4 border-philo-dark">
          <span className="text-2xl">😎</span>
          <span className="text-xs font-bold mt-1">{myProfile?.pseudo || 'Moi'}</span>
        </motion.div>

        {/* ORBITE */}
        {matches.map((match, index) => {
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
                onClick={() => setSelectedUser(match)}
              >
                <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center group-hover:bg-philo-primary/20 group-hover:border-philo-primary transition-colors relative">
                  <User className="text-gray-300 group-hover:text-white" />
                  <div className="absolute -top-2 -right-2 bg-green-500 text-black text-xs font-bold px-2 py-1 rounded-full">{Math.round(match.similarity * 100)}%</div>
                </div>
                <div className="mt-2 text-center">
                  <p className="font-bold text-sm">{match.pseudo}</p>
                  <p className="text-[10px] text-gray-400">{match.domaine || 'Étudiant'}</p>
                </div>
              </motion.div>
            )
          })}
      </div>

      <AnimatePresence>
        {selectedUser && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedUser(null)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
            <UserProfileSidebar userId={selectedUser.id} similarity={selectedUser.similarity} onClose={() => setSelectedUser(null)} />
          </>
        )}
      </AnimatePresence>
    </div>
  )
}