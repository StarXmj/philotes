import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BrainCircuit, X, Unlink, Sparkles, Lock, MessageCircle, UserPlus, CheckCircle, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import ChatInterface from '../chat/ChatInterface'

export default function UserProfileSidebar({ userId, onClose, similarity, onChatStatusChange }) {
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

  useEffect(() => {
    return () => {
      if (onChatStatusChange) onChatStatusChange(userId, false)
    }
  }, [userId, onChatStatusChange])

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

  const handleSimpleLinkRequest = async () => {
    const { data: newConn, error } = await supabase
      .from('connections')
      .insert({
        sender_id: currentUser.id,
        receiver_id: userId,
        status: 'pending',
        message: "👋 Demande de connexion"
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

  const openChat = () => {
    setView('CHAT')
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
  const isReceiver = connection?.receiver_id === currentUser?.id

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
        <div className="flex flex-col h-full overflow-y-auto">
          <div className="sticky top-0 bg-slate-900/90 backdrop-blur-md border-b border-white/10 p-4 flex justify-between items-center z-10">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BrainCircuit className="text-philo-primary" /> 
              Vibe Check
            </h2>
            
            <div className="flex gap-2">
              {connection && connection.status === 'accepted' && (
                <button 
                  onClick={handleBreakLink} 
                  className="p-2 hover:bg-red-500/20 text-gray-400 hover:text-red-500 rounded-full transition"
                  title="Rompre le lien"
                >
                  <Unlink size={20} />
                </button>
              )}

              <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-full transition">
                <X size={24} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">Scan en cours...</div>
          ) : (
            <div className="p-6 space-y-8 pb-32">
              <div className="text-center relative">
                <div className="w-24 h-24 bg-gradient-to-br from-philo-primary to-philo-secondary rounded-full mx-auto flex items-center justify-center mb-3 shadow-lg shadow-purple-500/20">
                  <span className="text-4xl font-bold text-white">{profile?.pseudo?.substring(0,2).toUpperCase()}</span>
                </div>
                <h3 className="text-2xl font-bold text-white">{profile?.pseudo}</h3>
                
                <div className="mt-2 inline-flex items-center gap-1 bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-xs font-bold border border-green-500/30">
                  <Sparkles size={12}/> {Math.round(similarity * 100)}% Compatible
                </div>

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

              <div className="space-y-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Sa personnalité</h4>
                {answers.map((item, idx) => (
                  <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <p className="text-[10px] text-philo-secondary uppercase font-bold mb-1">{item.questions?.text}</p>
                    <p className="text-gray-200 text-sm font-medium">{item.options?.text}</p>
                  </motion.div>
                ))}
              </div>

              <div className="fixed bottom-0 right-0 w-full md:w-96 p-4 bg-slate-900 border-t border-white/10 backdrop-blur-xl flex flex-col gap-3">
                {!connection && (
                  <>
                     <button 
                      onClick={handleSimpleLinkRequest}
                      className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-white transition flex items-center justify-center gap-2 border border-white/10"
                    >
                      <UserPlus size={20} /> Demander un lien
                    </button>
                    <button 
                      onClick={openChat}
                      className="w-full py-3 bg-gradient-to-r from-philo-primary to-philo-secondary rounded-xl font-bold text-white hover:opacity-90 transition flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20"
                    >
                      <MessageCircle size={20} /> Envoyer un message
                    </button>
                  </>
                )}

                {connection && connection.status === 'pending' && !isReceiver && (
                  <div className="w-full py-3 bg-white/5 rounded-xl text-gray-400 font-bold flex items-center justify-center gap-2 border border-white/10 cursor-not-allowed">
                     <Clock size={20} /> En attente...
                  </div>
                )}

                {connection && connection.status === 'pending' && isReceiver && (
                  <button onClick={handleAccept} className="w-full py-3 bg-green-500 hover:bg-green-600 rounded-xl text-black font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-500/20">
                    <CheckCircle size={20} /> Accepter le lien
                  </button>
                )}

                {connection && connection.status === 'accepted' && (
                   <button 
                    onClick={openChat}
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