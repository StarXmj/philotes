import { useEffect, useState, useRef, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Send, Check, X, Pencil, Trash2, Clock, Loader2, Smile, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import EmojiPicker from 'emoji-picker-react'

const MESSAGE_LIFETIME_HOURS = 24
const PAGE_SIZE = 20

// --- SOUS-COMPOSANTS ---

const TypingIndicator = () => (
  <div className="flex items-center gap-1 p-3 bg-white/10 rounded-2xl rounded-tl-none w-fit">
    <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
    <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
    <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
  </div>
)

const MessageTimer = ({ createdAt, currentTick }) => {
  const created = new Date(createdAt).getTime()
  const expire = created + MESSAGE_LIFETIME_HOURS * 60 * 60 * 1000
  const diff = expire - currentTick
  
  let timeLeftLabel = ""

  if (diff <= 0) {
    timeLeftLabel = "Expiré"
  } else {
    const h = Math.floor(diff / (1000 * 60 * 60))
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    timeLeftLabel = `${h}h ${m}m`
  }

  return (
    <div className="text-[9px] opacity-60 flex items-center justify-end gap-1 mt-1 font-mono">
      <Clock size={10} /> {timeLeftLabel}
    </div>
  )
}

// --- COMPOSANT PRINCIPAL ---

export default function ChatInterface({ currentUser, targetUser, connection, onBack, onCreateConnection }) {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [isRemoteTyping, setIsRemoteTyping] = useState(false)
  
  // --- GLOBAL TICK ---
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 60000) 
    return () => clearInterval(interval)
  }, [])
  
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [errorToast, setErrorToast] = useState(null)

  const messagesEndRef = useRef(null)
  const containerRef = useRef(null)
  const channelRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const scrollHeightRef = useRef(0)

  let statusLabel = "Aucun lien"
  if (connection?.status === 'pending') statusLabel = "En attente"
  if (connection?.status === 'accepted') statusLabel = "Lien actif ✨"

  const canChat = !connection || connection.status === 'accepted'

  const showToast = (msg) => {
    setErrorToast(msg)
    setTimeout(() => setErrorToast(null), 4000)
  }

  // --- FONCTION CRITIQUE : MARQUER COMME LU ---
  // Cette fonction nettoie la DB, ce qui fera disparaître la notif via le hook global
  const markAsRead = async () => {
    if (!connection?.id || !currentUser?.id) return

    // On update SEULEMENT les messages qui me sont destinés (receiver = moi) et qui sont non lus
    const { error } = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('connection_id', connection.id)
      .eq('receiver_id', currentUser.id) 
      .is('read_at', null)

    if (error) console.error("Erreur markAsRead:", error)
  }

  // 1. CHARGEMENT DES MESSAGES
  const fetchMessages = async (offset = 0) => {
    if (!connection?.id) return
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('connection_id', connection.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) throw error
      if (data.length < PAGE_SIZE) setHasMore(false)

      const newMessages = data.reverse()

      if (offset === 0) {
        setMessages(newMessages)
        setTimeout(() => scrollToBottom(), 100)
        
        // --- ACTION : On marque comme lu dès l'ouverture du chat ---
        markAsRead()
      } else {
        setMessages(prev => [...newMessages, ...prev])
      }
    } catch (err) {
      console.error("Erreur chargement messages:", err)
      showToast("Erreur de chargement des messages")
    } finally {
      setIsLoadingMore(false)
    }
  }

  // 2. INITIALISATION & REALTIME
  useEffect(() => {
    setMessages([])
    setHasMore(true)
    fetchMessages(0)

    if (!connection?.id) return

    channelRef.current = supabase.channel(`room:${connection.id}`)
    channelRef.current
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `connection_id=eq.${connection.id}` }, (payload) => {
          setMessages((current) => {
            if (current.find(m => m.id === payload.new.id)) return current
            return [...current, payload.new]
          })
          setIsRemoteTyping(false)
          setTimeout(() => scrollToBottom(), 100)

          // --- ACTION : Si je reçois un message PENDANT que je regarde le chat ---
          // On vérifie que le message est pour moi avant de le marquer comme lu
          if (payload.new.receiver_id === currentUser.id) {
              markAsRead()
          }
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `connection_id=eq.${connection.id}` }, (payload) => {
          setMessages((current) => current.map(m => m.id === payload.new.id ? payload.new : m))
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
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

  // 3. SCROLL & UI
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight } = e.target
    if (scrollTop === 0 && hasMore && !isLoadingMore && messages.length >= PAGE_SIZE) {
      setIsLoadingMore(true)
      scrollHeightRef.current = scrollHeight
      fetchMessages(messages.length)
    }
  }

  useLayoutEffect(() => {
    if (isLoadingMore) return
    if (scrollHeightRef.current > 0 && containerRef.current) {
      const newScrollHeight = containerRef.current.scrollHeight
      const diff = newScrollHeight - scrollHeightRef.current
      containerRef.current.scrollTop = diff
      scrollHeightRef.current = 0
    }
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // 4. ACTIONS
  const handleDelete = async (msgId) => {
    if (!window.confirm("Supprimer ce message ?")) return
    const msgToDelete = messages.find(m => m.id === msgId)
    if (!msgToDelete) return

    setMessages((current) => current.filter((msg) => msg.id !== msgId))

    try {
      const { error } = await supabase.from('messages').delete().eq('id', msgId)
      if (error) throw error
    } catch (err) {
      console.error("Erreur suppression:", err)
      showToast("Impossible de supprimer le message.")
      setMessages(prev => {
        const restored = [...prev, msgToDelete]
        return restored.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      })
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
    const originalMessage = messages.find(m => m.id === targetId)
    const oldContent = originalMessage?.content

    setMessages((current) => current.map(m => m.id === targetId ? { ...m, content: newContent } : m))
    setEditingId(null)
    setEditText('')

    try {
      const { error } = await supabase.from('messages').update({ content: newContent }).eq('id', targetId)
      if (error) throw error
    } catch (err) {
      console.error("Erreur édition:", err)
      showToast("Échec de la modification.")
      if (oldContent) {
        setMessages((current) => current.map(m => m.id === targetId ? { ...m, content: oldContent } : m))
      }
    }
  }

  const handleTyping = (e) => {
    setInputText(e.target.value)
    if (connection?.id && channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { userId: currentUser.id } })
    }
  }

  const onEmojiClick = (emojiObject) => {
    setInputText(prev => prev + emojiObject.emoji)
    setShowEmojiPicker(false)
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!inputText.trim()) return
    const text = inputText
    setInputText('')
    setShowEmojiPicker(false)
    
    try {
      let currentConn = connection
      if (!currentConn) {
        currentConn = await onCreateConnection(text)
      } else {
        const { error } = await supabase.from('messages').insert({
          connection_id: currentConn.id,
          sender_id: currentUser.id,
          content: text
        })
        if (error) throw error
      }
      scrollToBottom()
    } catch (error) { 
        console.error(error)
        showToast("Erreur d'envoi.")
        setInputText(text)
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 relative">
      
      <AnimatePresence>
        {errorToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-50 bg-red-500/90 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm backdrop-blur-sm"
          >
            <AlertCircle size={16} />
            <span>{errorToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

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

      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/20 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
      >
        {isLoadingMore && <div className="flex justify-center py-2"><Loader2 className="animate-spin text-philo-primary w-5 h-5" /></div>}
        {!hasMore && messages.length > 0 && <div className="text-center text-gray-500 text-xs py-4 opacity-50">— Début de l'historique —</div>}
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
                    <input autoFocus type="text" value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} className="flex-1 bg-black/50 border border-philo-primary rounded-xl px-3 py-2 text-sm text-white outline-none" />
                    <button onClick={saveEdit} className="p-2 bg-green-500/20 text-green-400 rounded-full hover:bg-green-500/40"><Check size={14}/></button>
                    <button onClick={cancelEdit} className="p-2 bg-red-500/20 text-red-400 rounded-full hover:bg-red-500/40"><X size={14}/></button>
                  </div>
                ) : (
                  <div className={`p-3 rounded-2xl text-sm break-words relative ${isMe ? 'bg-philo-primary text-white rounded-tr-none' : 'bg-white/10 text-gray-200 rounded-tl-none'}`}>
                    {msg.content}
                    <MessageTimer createdAt={msg.created_at} currentTick={now} />
                  </div>
                )}
                {isMe && !isEditing && (
                  <div className="absolute top-0 -left-16 h-full flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity px-2">
                    <button onClick={() => startEdit(msg)} className="p-1.5 bg-slate-800 text-gray-400 hover:text-white rounded-full hover:bg-white/10"><Pencil size={12} /></button>
                    <button onClick={() => handleDelete(msg.id)} className="p-1.5 bg-slate-800 text-red-400 hover:text-red-300 rounded-full hover:bg-red-900/30"><Trash2 size={12} /></button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {isRemoteTyping && <div className="flex justify-start"><TypingIndicator /></div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 bg-slate-800 border-t border-white/10 flex gap-2 items-end relative">
        {showEmojiPicker && (
          <div className="absolute bottom-16 left-2 z-50 shadow-2xl rounded-2xl overflow-hidden border border-white/10">
            <EmojiPicker 
              onEmojiClick={onEmojiClick}
              theme="dark"
              width={300}
              height={400}
              lazyLoadEmojis={true}
            />
          </div>
        )}

        <button 
          onClick={() => setShowEmojiPicker(!showEmojiPicker)} 
          className={`p-3 rounded-full transition ${showEmojiPicker ? 'bg-philo-primary text-white' : 'bg-black/30 text-gray-400 hover:text-white'}`}
        >
          <Smile size={20} />
        </button>

        <form onSubmit={sendMessage} className="flex-1 flex gap-2">
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
    </div>
  )
}