import { useEffect, useState, useRef, useLayoutEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Send, Check, X, Pencil, Trash2, Clock, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

const MESSAGE_LIFETIME_HOURS = 24
const PAGE_SIZE = 20 // Nombre de messages par "page"

// --- SOUS-COMPOSANTS ---

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

const MessageTimer = ({ createdAt }) => {
  const [timeLeft, setTimeLeft] = useState("")

  useEffect(() => {
    const updateTimer = () => {
      const created = new Date(createdAt).getTime()
      const expire = created + MESSAGE_LIFETIME_HOURS * 60 * 60 * 1000
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

// --- COMPOSANT PRINCIPAL ---

export default function ChatInterface({ currentUser, targetUser, connection, onBack, onCreateConnection }) {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [isRemoteTyping, setIsRemoteTyping] = useState(false)
  
  // --- ÉTATS PAGINATION ---
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  
  // --- ÉTATS POUR L'ÉDITION ---
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  
  const messagesEndRef = useRef(null)
  const containerRef = useRef(null)
  const channelRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  
  // Pour gérer le scroll lors du chargement des anciens messages
  const scrollHeightRef = useRef(0)

  let statusLabel = "Aucun lien"
  if (connection?.status === 'pending') statusLabel = "En attente"
  if (connection?.status === 'accepted') statusLabel = "Lien actif ✨"

  const canChat = !connection || connection.status === 'accepted'

  // 1. CHARGEMENT DES MESSAGES (PAGINÉ)
  const fetchMessages = async (offset = 0) => {
    if (!connection?.id) return

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('connection_id', connection.id)
        .order('created_at', { ascending: false }) // On prend les plus récents d'abord
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) throw error

      if (data.length < PAGE_SIZE) {
        setHasMore(false)
      }

      // Important : on remet les messages dans l'ordre chronologique pour l'affichage
      const newMessages = data.reverse()

      if (offset === 0) {
        setMessages(newMessages)
        // Au premier chargement, on scrolle tout en bas
        setTimeout(() => scrollToBottom(), 100)
      } else {
        // Chargement précédent : on ajoute au DÉBUT de la liste (prepend)
        setMessages(prev => [...newMessages, ...prev])
      }
    } catch (err) {
      console.error("Erreur chargement messages:", err)
    } finally {
      setIsLoadingMore(false)
    }
  }

  // 2. INITIALISATION
  useEffect(() => {
    setMessages([])
    setHasMore(true)
    fetchMessages(0)

    // S'abonner aux changements (Realtime)
    if (!connection?.id) return

    channelRef.current = supabase.channel(`room:${connection.id}`)
    channelRef.current
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `connection_id=eq.${connection.id}` 
        },
        (payload) => {
          // On ajoute le message à la FIN
          setMessages((current) => {
            if (current.find(m => m.id === payload.new.id)) return current
            return [...current, payload.new]
          })
          setIsRemoteTyping(false)
          // Si on reçoit un message, on scrolle en bas
          setTimeout(() => scrollToBottom(), 100)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `connection_id=eq.${connection.id}`
        },
        (payload) => {
          setMessages((current) => 
            current.map(m => m.id === payload.new.id ? payload.new : m)
          )
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          setMessages((current) => current.filter(m => m.id !== payload.old.id))
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
  }, [connection?.id, currentUser.id])


  // 3. GESTION DU SCROLL INFINI (Vers le haut)
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight } = e.target
    
    // Si on est tout en haut (scrollTop === 0) et qu'il reste des messages
    if (scrollTop === 0 && hasMore && !isLoadingMore && messages.length >= PAGE_SIZE) {
      setIsLoadingMore(true)
      // On sauvegarde la hauteur actuelle pour recalculer la position après
      scrollHeightRef.current = scrollHeight
      fetchMessages(messages.length)
    }
  }

  // Astuce : useLayoutEffect pour ajuster le scroll AVANT que l'utilisateur ne le voie
  useLayoutEffect(() => {
    if (isLoadingMore) return // On attend que le chargement soit fini
    if (scrollHeightRef.current > 0 && containerRef.current) {
      // La nouvelle hauteur totale
      const newScrollHeight = containerRef.current.scrollHeight
      // La différence (ce qu'on vient d'ajouter en haut)
      const diff = newScrollHeight - scrollHeightRef.current
      
      // On déplace le scroll pour que l'utilisateur reste au même endroit visuel
      containerRef.current.scrollTop = diff
      
      // Reset
      scrollHeightRef.current = 0
    }
  }, [messages]) // Se déclenche quand 'messages' change

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // --- ACTIONS (Delete, Edit, Send...) inchangées ---
  const handleDelete = async (msgId) => {
    if (window.confirm("Supprimer ce message ?")) {
      setMessages((current) => current.filter((msg) => msg.id !== msgId))
      const { error } = await supabase.from('messages').delete().eq('id', msgId)
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
    
    const targetId = editingId
    const newContent = editText

    setMessages((current) => 
      current.map(m => m.id === targetId ? { ...m, content: newContent } : m)
    )

    setEditingId(null)
    setEditText('')

    await supabase.from('messages').update({ content: newContent }).eq('id', targetId)
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
        currentConn = await onCreateConnection(text)
      } else {
        await supabase.from('messages').insert({
          connection_id: currentConn.id,
          sender_id: currentUser.id,
          content: text
        })
      }
      scrollToBottom() // Scroll auto à l'envoi
    } catch (error) { console.error(error) }
  }

  return (
    <div className="flex flex-col h-full bg-slate-900">
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

      {/* ZONE MESSAGES */}
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/20 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
      >
        {/* Loader chargement infini (en haut) */}
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="animate-spin text-philo-primary w-5 h-5" />
          </div>
        )}

        {/* Message début conversation */}
        {!hasMore && messages.length > 0 && (
          <div className="text-center text-gray-500 text-xs py-4 opacity-50">
             — Début de l'historique —
          </div>
        )}

        {messages.length === 0 && !hasMore && (
          <div className="text-center text-gray-500 text-sm mt-10 p-4">
             {!connection ? "Envoyer un message créera automatiquement une demande de lien." : "Aucun message."}
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

      <form onSubmit={sendMessage} className="p-3 bg-slate-800 border-t border-white/10 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={handleTyping}
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