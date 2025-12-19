import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { motion, AnimatePresence } from 'framer-motion'
import {User,MessageCircle,LogOut,UserCircle,X,BrainCircuit,Sparkles,Send,ArrowLeft,Clock,Lock,CheckCircle,Pencil,Trash2,Check,Unlink, UserPlus} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const MESSAGE_LIFETIME_HOURS = 24; 

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

// --- COMPOSANT : COMPTE À REBOURS PAR MESSAGE ---
const MessageTimer = ({ createdAt }) => {
  const [timeLeft, setTimeLeft] = useState("")

  useEffect(() => {
    const updateTimer = () => {
      const created = new Date(createdAt).getTime()
      const expire = created + MESSAGE_LIFETIME_HOURS * 60 * 60 * 1000;
      const now = new Date().getTime()
      const diff = expire - now

      if (diff <= 0) {
        setTimeLeft("Expiré")
      } else {
        const h = Math.floor(diff / (1000 * 60 * 60))
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        setTimeLeft(`${h}h ${m}m`)
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 60000)
    return () => clearInterval(interval)
  }, [createdAt])

  return (
    <div className="text-[9px] opacity-60 flex items-center justify-end gap-1 mt-1 font-mono">
      <Clock size={10} /> {timeLeft}
    </div>
  )
}

// --- COMPOSANT CHAT AVEC REALTIME ---
const ChatInterface = ({ currentUser, targetUser, connection, onBack, onCreateConnection }) => {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [isRemoteTyping, setIsRemoteTyping] = useState(false)
  
  // --- ÉTATS POUR L'ÉDITION ---
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  
  const messagesEndRef = useRef(null)
  const channelRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  // Calcul du statut pour l'affichage header
  let statusLabel = "Aucun lien";
  if (connection?.status === 'pending') statusLabel = "En attente";
  if (connection?.status === 'accepted') statusLabel = "Lien actif ✨";

  // Peut-on discuter ? (Oui si accepté, ou si pas de connexion du tout pour envoyer le 1er msg)
  // Si c'est "pending", on bloque.
  const canChat = !connection || connection.status === 'accepted';

  useEffect(() => {
    if (!connection?.id) return

    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('connection_id', connection.id)
        .order('created_at', { ascending: true })
      setMessages(data || [])
    }
    fetchMessages()

    channelRef.current = supabase.channel(`room:${connection.id}`)

    channelRef.current
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `connection_id=eq.${connection.id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMessages((current) => {
              if (current.find(m => m.id === payload.new.id)) return current
              return [...current, payload.new]
            })
            setIsRemoteTyping(false)
          } 
          else if (payload.eventType === 'UPDATE') {
            setMessages((current) => 
              current.map(m => m.id === payload.new.id ? payload.new : m)
            )
          }
          else if (payload.eventType === 'DELETE') {
            setMessages((current) => 
              current.filter(m => m.id !== payload.old.id)
            )
          }
        }
      )
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.userId !== currentUser.id) {
          setIsRemoteTyping(true)
          clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = setTimeout(() => setIsRemoteTyping(false), 3000)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channelRef.current) }
  }, [connection, currentUser.id])

  useEffect(() => {
    if (!editingId) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, isRemoteTyping, editingId])

  const handleDelete = async (msgId) => {
    if (window.confirm("Supprimer ce message ?")) {
      setMessages((currentMessages) => 
        currentMessages.filter((msg) => msg.id !== msgId)
      )
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', msgId)
      if (error) console.error("Erreur suppression:", error)
    }
  }

  const startEdit = (msg) => {
    setEditingId(msg.id)
    setEditText(msg.content)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditText('')
  }

  const saveEdit = async () => {
    if (!editText.trim()) return handleDelete(editingId)
    await supabase
      .from('messages')
      .update({ content: editText })
      .eq('id', editingId)
    setEditingId(null)
    setEditText('')
  }

  const handleTyping = (e) => {
    setInputText(e.target.value)
    if (connection?.id && channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { userId: currentUser.id } })
    }
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!inputText.trim()) return
    const text = inputText
    setInputText('')
    
    try {
      let currentConn = connection
      if (!currentConn) {
        // C'est ici que l'envoi d'un message crée la demande de lien automatiquement
        currentConn = await onCreateConnection(text)
      } else {
        await supabase.from('messages').insert({
          connection_id: currentConn.id,
          sender_id: currentUser.id,
          content: text
        })
      }
    } catch (error) { console.error(error) }
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
          <div className={`text-xs flex items-center gap-1 ${connection?.status === 'accepted' ? 'text-green-400' : 'text-gray-400'}`}>
             {statusLabel}
          </div>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/20">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 text-sm mt-10 p-4">
             {!connection ? "Envoyer un message créera automatiquement une demande de lien." : "Début de la conversation."}
          </div>
        )}

        {messages.map((msg) => {
          const isMe = msg.sender_id === currentUser.id
          const isEditing = editingId === msg.id

          return (
            <div key={msg.id} className={`group flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] relative ${isEditing ? 'w-full' : ''}`}>
                
                {isEditing ? (
                  <div className="flex gap-2 w-full">
                    <input 
                      autoFocus
                      type="text" 
                      value={editText} 
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                      className="flex-1 bg-black/50 border border-philo-primary rounded-xl px-3 py-2 text-sm text-white outline-none"
                    />
                    <button onClick={saveEdit} className="p-2 bg-green-500/20 text-green-400 rounded-full hover:bg-green-500/40"><Check size={14}/></button>
                    <button onClick={cancelEdit} className="p-2 bg-red-500/20 text-red-400 rounded-full hover:bg-red-500/40"><X size={14}/></button>
                  </div>
                ) : (
                  <div className={`p-3 rounded-2xl text-sm break-words relative ${
                    isMe 
                      ? 'bg-philo-primary text-white rounded-tr-none' 
                      : 'bg-white/10 text-gray-200 rounded-tl-none'
                  }`}>
                    {msg.content}
                    <MessageTimer createdAt={msg.created_at} />
                  </div>
                )}

                {isMe && !isEditing && (
                  <div className="absolute top-0 -left-16 h-full flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity px-2">
                    <button onClick={() => startEdit(msg)} className="p-1.5 bg-slate-800 text-gray-400 hover:text-white rounded-full hover:bg-white/10" title="Modifier">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => handleDelete(msg.id)} className="p-1.5 bg-slate-800 text-red-400 hover:text-red-300 rounded-full hover:bg-red-900/30" title="Supprimer">
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {isRemoteTyping && <div className="flex justify-start"><TypingIndicator /></div>}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}
      <form onSubmit={sendMessage} className="p-3 bg-slate-800 border-t border-white/10 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={handleTyping}
          // On désactive l'input si le lien est en attente (on ne peut pas discuter sans acceptation)
          // SAUF si !connection (car c'est le moment d'envoyer le premier message)
          disabled={!canChat} 
          placeholder={!canChat ? "En attente d'acceptation..." : "Ton message..."}
          className="flex-1 bg-black/30 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:border-philo-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button disabled={!inputText.trim() || !canChat} type="submit" className="p-3 bg-philo-primary hover:bg-philo-secondary rounded-full text-white transition disabled:opacity-50">
          <Send size={18} />
        </button>
      </form>
    </div>
  )
}


// --- SIDEBAR INTELLIGENTE ---
const UserProfileSidebar = ({ userId, onClose, similarity }) => {
  const [view, setView] = useState('PROFILE')
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

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single()
      setProfile(prof)

      const { data: ans } = await supabase.from('user_answers').select('question_id, questions(text), options(text)').eq('user_id', userId)
      setAnswers(ans || [])

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

  // Fonction utilisée par le ChatInterface pour créer le lien via message
  const handleCreateConnection = async (firstMessage) => {
    const { data: newConn, error: connError } = await supabase
      .from('connections')
      .insert({
        sender_id: currentUser.id,
        receiver_id: userId,
        status: 'pending',
        message: firstMessage 
      })
      .select()
      .single()

    if (connError) throw connError

    await supabase.from('messages').insert({
      connection_id: newConn.id,
      sender_id: currentUser.id,
      content: firstMessage
    })

    setConnection(newConn)
    return newConn
  }

  // Fonction pour le bouton "Demander un lien" (sans message texte explicite)
  const handleSimpleLinkRequest = async () => {
    const { data: newConn, error } = await supabase
      .from('connections')
      .insert({
        sender_id: currentUser.id,
        receiver_id: userId,
        status: 'pending',
        message: "👋 Demande de connexion" // Message système par défaut
      })
      .select()
      .single()

    if (!error) {
       setConnection(newConn)
    }
  }

  const handleAccept = async () => {
    const { data } = await supabase.from('connections').update({ status: 'accepted' }).eq('id', connection.id).select().single()
    setConnection(data)
  }

  const isAccepted = connection?.status === 'accepted'
  const isReceiver = connection?.receiver_id === currentUser?.id

  // Rompre le lien (Uniquement si accepté)
  const handleBreakLink = async () => {
    if (window.confirm("Es-tu sûr de vouloir couper le lien ? L'historique et les infos seront perdus.")) {
      const { error } = await supabase
        .from('connections')
        .delete()
        .eq('id', connection.id)

      if (!error) {
        setConnection(null)
        setView('PROFILE')
      } else {
        alert("Impossible de rompre le lien.")
      }
    }
  }

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
          onBack={() => setView('PROFILE')}
          onCreateConnection={handleCreateConnection}
        />
      ) : (
        
        <div className="flex flex-col h-full overflow-y-auto">
          {/* Header Profil */}
          <div className="sticky top-0 bg-slate-900/90 backdrop-blur-md border-b border-white/10 p-4 flex justify-between items-center z-10">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BrainCircuit className="text-philo-primary" /> 
              Vibe Check
            </h2>
            
            <div className="flex gap-2">
              {/* BOUTON ROMPRE LE LIEN : Visible SEULEMENT si accepté */}
              {connection && connection.status === 'accepted' && (
                <button 
                  onClick={handleBreakLink} 
                  className="p-2 hover:bg-red-500/20 text-gray-400 hover:text-red-500 rounded-full transition"
                  title="Rompre le lien"
                >
                  <Unlink size={20} />
                </button>
              )}

              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition">
                <X size={24} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">Scan en cours...</div>
          ) : (
            <div className="p-6 space-y-8 pb-32"> {/* pb-32 pour laisser la place aux boutons en bas */}
              
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
              <div className="fixed bottom-0 right-0 w-full md:w-96 p-4 bg-slate-900 border-t border-white/10 backdrop-blur-xl flex flex-col gap-3">
                
                {/* CAS 1 : AUCUN LIEN (Montrer les 2 boutons) */}
                {!connection && (
                  <>
                     <button 
                      onClick={handleSimpleLinkRequest}
                      className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-white transition flex items-center justify-center gap-2 border border-white/10"
                    >
                      <UserPlus size={20} /> Demander un lien
                    </button>
                    <button 
                      onClick={() => setView('CHAT')}
                      className="w-full py-3 bg-gradient-to-r from-philo-primary to-philo-secondary rounded-xl font-bold text-white hover:opacity-90 transition flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20"
                    >
                      <MessageCircle size={20} /> Envoyer un message
                    </button>
                  </>
                )}

                {/* CAS 2 : DEMANDE ENVOYÉE (Pending) PAR MOI */}
                {connection && connection.status === 'pending' && !isReceiver && (
                  <div className="w-full py-3 bg-white/5 rounded-xl text-gray-400 font-bold flex items-center justify-center gap-2 border border-white/10 cursor-not-allowed">
                     <Clock size={20} /> En attente...
                  </div>
                )}

                {/* CAS 3 : DEMANDE REÇUE (Pending) PAR L'AUTRE */}
                {connection && connection.status === 'pending' && isReceiver && (
                  <button onClick={handleAccept} className="w-full py-3 bg-green-500 hover:bg-green-600 rounded-xl text-black font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-500/20">
                    <CheckCircle size={20} /> Accepter le lien
                  </button>
                )}

                {/* CAS 4 : LIEN ACCEPTÉ */}
                {connection && connection.status === 'accepted' && (
                   <button 
                    onClick={() => setView('CHAT')}
                    className="w-full py-3 bg-philo-primary rounded-xl font-bold text-white hover:opacity-90 transition flex items-center justify-center gap-2"
                  >
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