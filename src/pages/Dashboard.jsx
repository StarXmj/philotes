import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { motion, AnimatePresence } from 'framer-motion'
import { User, LogOut, UserCircle, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import UserProfileSidebar from '../components/dashboard/UserProfileSidebar'

export default function Dashboard() {
  const navigate = useNavigate()
  const [matches, setMatches] = useState([])
  const [myProfile, setMyProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)
  const [unreadCounts, setUnreadCounts] = useState({})
  
  const activeChatRef = useRef(null) 
  const myProfileRef = useRef(null)

  useEffect(() => {
    myProfileRef.current = myProfile
  }, [myProfile])

  // 1. CHARGEMENT
  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return navigate('/')

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setMyProfile(profile)
    myProfileRef.current = profile

    if (profile && profile.embedding) {
      // On récupère les matches
      const { data: matchedUsers } = await supabase.rpc('match_students', {
        query_embedding: profile.embedding,
        match_threshold: 0.5,
        match_count: 8
      })

      if (matchedUsers) {
        // On récupère l'état des connexions
        const { data: allMyConnections } = await supabase
          .from('connections')
          .select('*')
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)

        const matchesWithStatus = matchedUsers
          .filter(p => p.id !== user.id)
          .map(match => {
            const conn = allMyConnections?.find(c => 
              (c.sender_id === user.id && c.receiver_id === match.id) ||
              (c.receiver_id === user.id && c.sender_id === match.id)
            )
            return { ...match, connection: conn || null }
          })
        
        // Tri : Amis proches d'abord
        matchesWithStatus.sort((a, b) => {
           const aIsFriend = a.connection?.status === 'accepted' ? 1 : 0
           const bIsFriend = b.connection?.status === 'accepted' ? 1 : 0
           return bIsFriend - aIsFriend
        })

        setMatches(matchesWithStatus)
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [navigate])

  // 2. TEMPS RÉEL
  useEffect(() => {
    const channel = supabase.channel('dashboard-room')

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, (payload) => {
          const me = myProfileRef.current
          if (!me) return

          const isInvolved = (payload.new && (payload.new.sender_id === me.id || payload.new.receiver_id === me.id)) ||
                             (payload.old && (payload.old.sender_id === me.id || payload.old.receiver_id === me.id))

          if (!isInvolved) return

          setMatches(currentMatches => {
            return currentMatches.map(match => {
              if (payload.new && (payload.new.sender_id === match.id || payload.new.receiver_id === match.id)) {
                return { ...match, connection: payload.new }
              }
              if (payload.eventType === 'DELETE' && (payload.old.sender_id === match.id || payload.old.receiver_id === match.id)) {
                 return { ...match, connection: null }
              }
              return match
            })
          })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          const me = myProfileRef.current
          if (!me) return

          if (payload.new.sender_id === me.id) return

          const senderId = String(payload.new.sender_id)
          const currentActiveChat = activeChatRef.current ? String(activeChatRef.current) : null

          if (currentActiveChat === senderId) return 

          setUnreadCounts(prev => ({ ...prev, [senderId]: (prev[senderId] || 0) + 1 }))
      })
      .subscribe()

    return () => { 
        supabase.removeChannel(channel)
    }
  }, [])

  const handleChatStatusChange = useCallback((userId, isChatting) => {
    if (isChatting) {
      activeChatRef.current = String(userId) 
      setUnreadCounts(prev => ({ ...prev, [userId]: 0 }))
    } else {
      if (activeChatRef.current === String(userId)) {
        activeChatRef.current = null
      }
    }
  }, [])

  const handleLogout = async () => await supabase.auth.signOut() 

  if (loading) return <div className="min-h-screen bg-philo-dark flex items-center justify-center text-white">Chargement...</div>

  return (
    <div className="min-h-screen bg-philo-dark text-white p-4 relative overflow-hidden">
      
      {/* Navbar */}
      <div className="flex justify-between items-center z-20 w-full max-w-4xl mx-auto py-4 px-4 relative">
        <h1 className="text-2xl font-bold">Philotès<span className="text-philo-primary">.</span></h1>
        <div className="flex gap-2 items-center">
          {/* Avatar de l'utilisateur connecté dans la navbar */}
          <button onClick={() => navigate('/profile')} className="rounded-full hover:opacity-80 transition overflow-hidden border border-white/20 w-10 h-10">
             {myProfile?.avatar_prive ? (
               <img src={myProfile.avatar_prive} alt="Moi" className="w-full h-full object-cover" />
             ) : myProfile?.avatar_public ? (
               <img src={`/avatars/${myProfile.avatar_public}`} alt="Moi" className="w-full h-full object-cover" />
             ) : (
               <UserCircle size={38} className="text-gray-300 w-full h-full p-1" />
             )}
          </button>
          <button onClick={handleLogout} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition"><LogOut size={20} /></button>
        </div>
      </div>

      {/* Constellation */}
      <div className="relative h-[600px] w-full flex items-center justify-center mt-10">
        
        {/* Orbites */}
        <div className="absolute rounded-full border border-white/5 w-[260px] h-[260px]" />
        <div className="absolute rounded-full border border-white/5 w-[480px] h-[480px]" />

        {/* Moi (Centre) */}
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="z-20 w-24 h-24 rounded-full bg-gradient-to-br from-philo-primary to-philo-secondary flex flex-col items-center justify-center shadow-[0_0_40px_rgba(139,92,246,0.6)] border-4 border-philo-dark relative overflow-hidden">
           {myProfile?.avatar_prive ? (
               <img src={myProfile.avatar_prive} alt="Moi" className="w-full h-full object-cover" />
           ) : myProfile?.avatar_public ? (
               <img src={`/avatars/${myProfile.avatar_public}`} alt="Moi" className="w-full h-full object-cover" />
           ) : (
               <span className="text-2xl">😎</span>
           )}
        </motion.div>
        <div className="absolute mt-32 z-20 bg-black/50 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm">
            {myProfile?.pseudo || 'Moi'}
        </div>

        {/* Les Autres Planètes */}
        {matches.map((match, index) => {
            const conn = match.connection
            const isAccepted = conn?.status === 'accepted'
            
            const radius = isAccepted ? 130 : 240
            const angle = (index / matches.length) * 2 * Math.PI
            const x = Math.cos(angle) * radius
            const y = Math.sin(angle) * radius

            let containerClass = "border-white/20 bg-white/10"
            let badge = null
            
            const unread = unreadCounts[match.id] || 0
            const hasNotif = unread > 0

            // LOGIQUE D'AFFICHAGE DE L'AVATAR
            // 1. Si on est amis (accepted) ET qu'il a une vraie photo => Vraie photo
            // 2. Sinon => Avatar public
            // 3. Sinon => Icône par défaut
            let avatarSrc = null
            if (isAccepted && match.avatar_prive) {
                avatarSrc = match.avatar_prive
            } else if (match.avatar_public) {
                avatarSrc = `/avatars/${match.avatar_public}`
            }

            if (isAccepted) {
                containerClass = "border-philo-primary bg-philo-primary/10 shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                if (hasNotif) {
                    containerClass = "border-red-500 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.6)] animate-pulse"
                }
            } else if (conn?.status === 'pending') {
                const isMeSender = conn.sender_id === myProfile?.id
                if (isMeSender) {
                    containerClass = "border-white/30 border-dashed bg-white/5"
                    badge = <div className="absolute -top-1 -right-1 bg-gray-600 p-1 rounded-full"><Clock size={10}/></div>
                } else {
                    containerClass = "border-green-500 bg-green-500/10 shadow-[0_0_15px_rgba(34,197,94,0.4)]"
                    badge = <div className="absolute -top-2 -right-2 bg-green-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-bounce">NEW</div>
                }
            }

            return (
              <motion.div
                key={match.id}
                initial={{ opacity: 0, x: 0, y: 0 }}
                animate={{ 
                    opacity: 1, 
                    x: x, 
                    y: y,
                    scale: hasNotif ? [1, 1.1, 1] : 1 
                }}
                transition={{ 
                    type: 'spring', 
                    scale: { repeat: hasNotif ? Infinity : 0, duration: 1.5 }
                }}
                className="absolute z-10 flex flex-col items-center cursor-pointer group"
                onClick={() => setSelectedUser(match)}
              >
                <div className={`w-20 h-20 rounded-full backdrop-blur-md border-2 flex items-center justify-center transition-all relative overflow-hidden ${containerClass}`}>
                  
                  {avatarSrc ? (
                      <img src={avatarSrc} alt={match.pseudo} className="w-full h-full object-cover" />
                  ) : (
                      <User className="text-gray-200" />
                  )}
                  
                  <div className="absolute -bottom-2 bg-slate-900 border border-white/10 text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10">
                    {Math.round(match.similarity * 100)}%
                  </div>

                  {badge}

                  {/* Compteur Non-lus */}
                  {hasNotif && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center font-bold text-xs shadow-lg animate-bounce z-20 border-2 border-slate-900">
                          {unread > 9 ? '+9' : unread}
                      </div>
                  )}
                </div>
                
                <div className="mt-3 text-center">
                  <p className="font-bold text-sm text-shadow truncate max-w-[100px]">{match.pseudo}</p>
                </div>
              </motion.div>
            )
          })}
      </div>

      <AnimatePresence>
        {selectedUser && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedUser(null)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
            
            <UserProfileSidebar 
              userId={selectedUser.id} 
              similarity={selectedUser.similarity} 
              initialUnreadCount={unreadCounts[selectedUser.id] || 0}
              onClose={() => setSelectedUser(null)} 
              onChatStatusChange={handleChatStatusChange} 
            />
          </>
        )}
      </AnimatePresence>
    </div>
  )
}