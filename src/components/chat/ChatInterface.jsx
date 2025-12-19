import { useEffect, useState, useRef, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Send, Check, X, Pencil, Trash2, Clock, Loader2, Smile, SmilePlus } from 'lucide-react'
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

const MessageTimer = ({ createdAt }) => {
  const [timeLeft, setTimeLeft] = useState("")
  useEffect(() => {
    const updateTimer = () => {
      const created = new Date(createdAt).getTime()
      const expire = created + MESSAGE_LIFETIME_HOURS * 60 * 60 * 1000
      const now = new Date().getTime()
      const diff = expire - now
      if (diff <= 0) setTimeLeft("Expiré")
      else {
        const h = Math.floor(diff / (1000 * 60 * 60))
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        setTimeLeft(`${h}h ${m}m`)
      }
    }
    updateTimer()
    const interval = setInterval(updateTimer, 60000)
    return () => clearInterval(interval)
  }, [createdAt])
  return <div className="text-[9px] opacity-60 flex items-center justify-end gap-1 mt-1 font-mono"><Clock size={10} /> {timeLeft}</div>
}

// --- LOGIQUE DE RÉACTIONS (Corrigée et Agrandie) ---
const ReactionPills = ({ reactions, currentUserId, onToggle }) => {
  if (!reactions || reactions.length === 0) return null

  // On groupe par emoji
  const groups = reactions.reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, hasReacted: false }
    acc[r.emoji].count++
    if (r.user_id === currentUserId) acc[r.emoji].hasReacted = true
    return acc
  }, {})

  return (
    <div className="flex flex-wrap gap-1 mt-1 justify-end relative z-10">
      {Object.entries(groups).map(([emoji, data]) => (
        <button
          key={emoji}
          onClick={(e) => {
            e.stopPropagation(); // Empêche d'ouvrir le message ou autre
            onToggle(emoji);
          }}
          className={`text-sm px-2 py-1 rounded-full border flex items-center justify-center transition-all ${
            data.hasReacted 
              ? 'bg-philo-primary/20 border-philo-primary text-white scale-105' 
              : 'bg-black/30 border-white/10 text-gray-400 hover:bg-white/10 hover:border-white/30'
          }`}
        >
          {/* JUSTE L'EMOJI, Bien visible */}
          <span className="leading-none">{emoji}</span>
        </button>
      ))}
    </div>
  )
}

// --- COMPOSANT PRINCIPAL ---

export default function ChatInterface({ currentUser, targetUser, connection, onBack, onCreateConnection }) {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [isRemoteTyping, setIsRemoteTyping] = useState(false)
  
  // --- ÉTATS PICKER ---
  const [showMainPicker, setShowMainPicker] = useState(false)
  const [reactingToMsgId, setReactingToMsgId] = useState(null)
  
  // --- ÉTATS PAGINATION & ÉDITION ---
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  
  const messagesEndRef = useRef(null)
  const containerRef = useRef(null)
  const channelRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const scrollHeightRef = useRef(0)
  const inputRef = useRef(null) // Pour remettre le focus

  let statusLabel = "Aucun lien"
  if (connection?.status === 'pending') statusLabel = "En attente"
  if (connection?.status === 'accepted') statusLabel = "Lien actif ✨"
  const canChat = !connection || connection.status === 'accepted'

  // 1. CHARGEMENT
  const fetchMessages = async (offset = 0) => {
    if (!connection?.id) return
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*, message_reactions(*)')
        .eq('connection_id', connection.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) throw error
      if (data.length < PAGE_SIZE) setHasMore(false)

      const newMessages = data.reverse()

      if (offset === 0) {
        setMessages(newMessages)
        setTimeout(() => scrollToBottom(), 100)
      } else {
        setMessages(prev => [...newMessages, ...prev])
      }
    } catch (err) {
      console.error("Erreur chargement messages:", err)
    } finally {
      setIsLoadingMore(false)
    }
  }

  // 2. REALTIME
  useEffect(() => {
    setMessages([])
    setHasMore(true)
    fetchMessages(0)

    if (!connection?.id) return

    channelRef.current = supabase.channel(`room:${connection.id}`)
    channelRef.current
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `connection_id=eq.${connection.id}` }, (payload) => {
          const newMsg = { ...payload.new, message_reactions: [] }
          setMessages((current) => {
            if (current.find(m => m.id === newMsg.id)) return current
            return [...current, newMsg]
          })
          setIsRemoteTyping(false)
          setTimeout(() => scrollToBottom(), 100)
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `connection_id=eq.${connection.id}` }, (payload) => {
          setMessages((current) => current.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m))
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
          setMessages((current) => current.filter(m => m.id !== payload.old.id))
        }
      )
      // ÉCOUTE DES RÉACTIONS (INSERT)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' }, (payload) => {
          setMessages((current) => current.map(m => {
            if (m.id === payload.new.message_id) {
               const exists = m.message_reactions?.find(r => r.id === payload.new.id)
               if (exists) return m
               return { ...m, message_reactions: [...(m.message_reactions || []), payload.new] }
            }
            return m
          }))
      })
      // ÉCOUTE DES RÉACTIONS (DELETE)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, (payload) => {
          setMessages((current) => current.map(m => {
             if (m.message_reactions?.some(r => r.id === payload.old.id)) {
                return { ...m, message_reactions: m.message_reactions.filter(r => r.id !== payload.old.id) }
             }
             return m
          }))
      })
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

  // 3. ACTIONS
  const handleReactionClick = async (emoji, msgId) => {
    setReactingToMsgId(null) // Ferme le picker réaction

    const message = messages.find(m => m.id === msgId)
    if (!message) return

    const existingReaction = message.message_reactions?.find(
      r => r.user_id === currentUser.id && r.emoji === emoji
    )

    if (existingReaction) {
      setMessages(current => current.map(m => {
        if (m.id === msgId) return { ...m, message_reactions: m.message_reactions.filter(r => r.id !== existingReaction.id) }
        return m
      }))
      await supabase.from('message_reactions').delete().eq('id', existingReaction.id)

    } else {
      const tempReaction = {
        id: Date.now(), // ID temporaire
        message_id: msgId,
        user_id: currentUser.id,
        emoji: emoji,
        created_at: new Date().toISOString()
      }
      
      setMessages(current => current.map(m => {
        if (m.id === msgId) return { ...m, message_reactions: [...(m.message_reactions || []), tempReaction] }
        return m
      }))

      const { data } = await supabase.from('message_reactions').insert({
        message_id: msgId,
        user_id: currentUser.id,
        emoji: emoji
      }).select().single()

      if (data) {
        setMessages(current => current.map(m => {
            if (m.id === msgId) {
                return { 
                    ...m, 
                    message_reactions: m.message_reactions.map(r => r.id === tempReaction.id ? data : r)
                }
            }
            return m
        }))
      }
    }
  }

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

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }

  const handleDelete = async (msgId) => {
    if (window.confirm("Supprimer ce message ?")) {
      setMessages((current) => current.filter((msg) => msg.id !== msgId))
      await supabase.from('messages').delete().eq('id', msgId)
    }
  }

  const startEdit = (msg) => { setEditingId(msg.id); setEditText(msg.content); }
  const cancelEdit = () => { setEditingId(null); setEditText(''); }
  
  const saveEdit = async () => {
    if (!editText.trim()) return handleDelete(editingId)
    const targetId = editingId
    const newContent = editText
    setMessages((current) => current.map(m => m.id === targetId ? { ...m, content: newContent } : m))
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

  // --- GESTION EMOJI PRINCIPAL (INPUT) ---
  const onMainEmojiClick = (emojiObject) => {
    // Ajout direct au texte
    setInputText(prev => prev + emojiObject.emoji)
    // On garde le picker ouvert ou fermé selon préférence ? Ici on ferme pour valider l'action visuellement
    setShowMainPicker(false) 
    // On remet le focus dans l'input pour continuer à écrire
    setTimeout(() => inputRef.current?.focus(), 10)
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!inputText.trim()) return
    const text = inputText
    setInputText('')
    setShowMainPicker(false)
    try {
      let currentConn = connection
      if (!currentConn) { currentConn = await onCreateConnection(text) } 
      else {
        await supabase.from('messages').insert({
          connection_id: currentConn.id,
          sender_id: currentUser.id,
          content: text
        })
      }
      scrollToBottom()
    } catch (error) { console.error(error) }
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 relative">
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
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/20 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent relative"
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
            <div key={msg.id} className={`group flex flex-col ${isMe ? 'items-end' : 'items-start'} mb-2`}>
              <div className={`max-w-[85%] relative ${isEditing ? 'w-full' : ''}`}>
                
                {/* BULLE MESSAGE */}
                {isEditing ? (
                  <div className="flex gap-2 w-full">
                    <input autoFocus type="text" value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} className="flex-1 bg-black/50 border border-philo-primary rounded-xl px-3 py-2 text-sm text-white outline-none" />
                    <button onClick={saveEdit} className="p-2 bg-green-500/20 text-green-400 rounded-full hover:bg-green-500/40"><Check size={14}/></button>
                    <button onClick={cancelEdit} className="p-2 bg-red-500/20 text-red-400 rounded-full hover:bg-red-500/40"><X size={14}/></button>
                  </div>
                ) : (
                  <div className={`p-3 rounded-2xl text-sm break-words relative transition-all ${isMe ? 'bg-philo-primary text-white rounded-tr-none' : 'bg-white/10 text-gray-200 rounded-tl-none'}`}>
                    {msg.content}
                    <MessageTimer createdAt={msg.created_at} />
                  </div>
                )}

                {/* PILLULES DE RÉACTION (Visibles & Sans Chiffres) */}
                <ReactionPills 
                  reactions={msg.message_reactions} 
                  currentUserId={currentUser.id}
                  onToggle={(emoji) => handleReactionClick(emoji, msg.id)}
                />

                {/* BOUTONS ACTIONS (Hover) */}
                {!isEditing && (
                  <div className={`absolute -top-6 ${isMe ? 'right-0' : 'left-0'} flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity px-2 z-10`}>
                    
                    {/* Bouton RÉACTION */}
                    <button 
                      onClick={(e) => {
                         e.stopPropagation()
                         setReactingToMsgId(msg.id)
                         setShowMainPicker(false) // Ferme l'autre picker si ouvert
                      }} 
                      className="p-1.5 bg-slate-800 text-yellow-400 hover:text-yellow-200 rounded-full hover:bg-white/10 border border-white/5 shadow-lg" 
                      title="Réagir"
                    >
                      <SmilePlus size={14} />
                    </button>

                    {isMe && (
                      <>
                        <button onClick={() => startEdit(msg)} className="p-1.5 bg-slate-800 text-gray-400 hover:text-white rounded-full hover:bg-white/10 border border-white/5 shadow-lg"><Pencil size={14} /></button>
                        <button onClick={() => handleDelete(msg.id)} className="p-1.5 bg-slate-800 text-red-400 hover:text-red-300 rounded-full hover:bg-red-900/30 border border-white/5 shadow-lg"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {isRemoteTyping && <div className="flex justify-start"><TypingIndicator /></div>}
        <div ref={messagesEndRef} />
      </div>

      {/* --- MODALE PICKER (RÉACTION) --- */}
      <AnimatePresence>
        {reactingToMsgId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                {/* Backdrop invisible pour fermer */}
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setReactingToMsgId(null)} />
                
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                    className="relative z-50 shadow-2xl rounded-2xl overflow-hidden border border-white/20"
                >
                    <EmojiPicker 
                        onEmojiClick={(emoji) => handleReactionClick(emoji.emoji, reactingToMsgId)}
                        theme="dark"
                        lazyLoadEmojis={true}
                        searchDisabled={false}
                        skinTonesDisabled
                    />
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* --- PICKER FLOTTANT (INPUT PRINCIPAL) --- */}
      {showMainPicker && (
         <>
           {/* Backdrop invisible pour fermer proprement */}
           <div className="fixed inset-0 z-40" onClick={() => setShowMainPicker(false)} />
           <div className="absolute bottom-20 left-4 z-50 shadow-2xl rounded-2xl overflow-hidden border border-white/10 bg-slate-900">
             <EmojiPicker onEmojiClick={onMainEmojiClick} theme="dark" width={300} height={400} lazyLoadEmojis={true} />
           </div>
         </>
      )}

      {/* INPUT ZONE */}
      <div className="p-3 bg-slate-800 border-t border-white/10 flex gap-2 items-end relative z-30">
        <button 
          onClick={() => { 
             setShowMainPicker(!showMainPicker); 
             setReactingToMsgId(null); 
          }} 
          className={`p-3 rounded-full transition ${showMainPicker ? 'bg-philo-primary text-white' : 'bg-black/30 text-gray-400 hover:text-white'}`}
        >
          <Smile size={20} />
        </button>

        <form onSubmit={sendMessage} className="flex-1 flex gap-2">
          <input
            ref={inputRef}
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