// src/pages/Dashboard.jsx
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { AnimatePresence, motion } from 'framer-motion'
import { 
  UserCircle, LogOut, List, ChevronLeft, ChevronRight, 
  PanelLeftOpen, PanelRightOpen, Search, X, Sparkles, 
  GraduationCap, MessageCircle, Globe, SlidersHorizontal, User 
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Composants
import ConstellationView from '../components/dashboard/ConstellationView'
import Constellation3D from '../components/dashboard/Constellation3D'
import DashboardFilters from '../components/dashboard/DashboardFilters'
import ListView from '../components/dashboard/ListView'
import UserProfileSidebar from '../components/dashboard/UserProfileSidebar'
import ChatInterface from '../components/chat/ChatInterface'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, profile: myProfile, loading: authLoading } = useAuth()

  // --- 1. ÉTATS ---
  const [scoreMode, setScoreMode] = useState('VIBES') 
  const [unreadCounts, setUnreadCounts] = useState({})
  const activeChatRef = useRef(null) 

  const [matches, setMatches] = useState([])
  const [loadingMatches, setLoadingMatches] = useState(true)
  
  // États UI
  const [selectedUser, setSelectedUser] = useState(null)
  const [activeChatUser, setActiveChatUser] = useState(null)
  
  const [isSidebarVisible, setIsSidebarVisible] = useState(false)
  const [is3D, setIs3D] = useState(false) 
  const [showFriends, setShowFriends] = useState(true)
  const [onlyFriends, setOnlyFriends] = useState(false)
  const [matchRange, setMatchRange] = useState([0, 100])
  const [isOppositeMode, setIsOppositeMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  const [mobileTab, setMobileTab] = useState('constellation')
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true)

  // --- 2. LOGIQUE ---
  const markAsRead = useCallback(async (senderId) => {
      setUnreadCounts(prev => { const newCounts = { ...prev }; delete newCounts[senderId]; return newCounts })
      if (user?.id) await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('receiver_id', user.id).eq('sender_id', senderId).is('read_at', null)
  }, [user])

  const handleChatStatusChange = useCallback((userId, isChatting) => {
    if (isChatting) { activeChatRef.current = String(userId); markAsRead(userId) } 
    else { activeChatRef.current = null }
  }, [markAsRead])

  const totalUnread = useMemo(() => {
    return Object.values(unreadCounts).reduce((acc, count) => acc + count, 0)
  }, [unreadCounts])

  // --- 3. ACTIONS DE LA BARRE DU BAS ---
  const handleTabConstellation = () => { setMobileTab('constellation'); setOnlyFriends(false); setActiveChatUser(null); }
  const handleTabList = () => { setMobileTab('list'); setOnlyFriends(false); setSearchQuery(''); setActiveChatUser(null); }
  const handleTabFilters = () => { setMobileTab('filters'); setActiveChatUser(null); }
  const handleTabChats = () => { setMobileTab('chats'); setOnlyFriends(true); setShowFriends(true); setSearchQuery(''); setActiveChatUser(null); }
  const handleTabProfile = () => { navigate('/profile') }
  const handleOpenChatsDesktop = () => { setOnlyFriends(true); setShowFriends(true); setIsRightSidebarOpen(true); }

  // --- 4. CHARGEMENT ---
  useEffect(() => {
    if (authLoading) return
    if (!user || !myProfile) { setLoadingMatches(false); return }

    const loadData = async () => {
      try {
          const dummyVector = Array(1536).fill(0); 
          const { data: matchedUsers, error: rpcError } = await supabase.rpc('match_students', { query_embedding: dummyVector, match_threshold: -1, match_count: 1000 })
          if (rpcError) throw rpcError

          const { data: allMyConnections } = await supabase.from('connections').select('*').or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          const { data: unreadMsgs } = await supabase.from('messages').select('sender_id').eq('receiver_id', user.id).is('read_at', null)
          
          const initialCounts = {}
          unreadMsgs?.forEach(msg => { initialCounts[msg.sender_id] = (initialCounts[msg.sender_id] || 0) + 1 })
          setUnreadCounts(initialCounts)

          if (matchedUsers) {
            const matchesWithStatus = matchedUsers.filter(p => p.id !== user.id).map(match => {
                const conn = allMyConnections?.find(c => (c.sender_id === user.id && c.receiver_id === match.id) || (c.receiver_id === user.id && c.sender_id === match.id))
                return { 
                    ...match, 
                    personality_score: Math.round((match.personality_score || 0) * 100), 
                    profile_score: Math.round((match.profile_score || 0) * 100),
                    connection: conn || null 
                }
            })
            setMatches(matchesWithStatus)
          }
      } catch (error) { console.error("Erreur chargement dashboard:", error) } finally { setLoadingMatches(false) }
    }
    loadData()

    const channel = supabase.channel('dashboard-final-fusion')
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        if (String(payload.new.receiver_id) !== String(user.id)) return 
        const senderId = String(payload.new.sender_id)
        if (activeChatRef.current === senderId) return 
        setUnreadCounts(prev => ({ ...prev, [senderId]: (prev[senderId] || 0) + 1 }))
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, (payload) => {
        if (payload.eventType === 'DELETE') { setMatches(curr => curr.map(m => m.connection?.id === payload.old.id ? { ...m, connection: null } : m)) } 
        else if (payload.new) { setMatches(curr => curr.map(m => {
            const isRel = (payload.new.sender_id === user.id && payload.new.receiver_id === m.id) || (payload.new.receiver_id === user.id && payload.new.sender_id === m.id)
            return isRel ? { ...m, connection: payload.new } : m
        }))}
    }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, myProfile, authLoading])

  // --- FILTRAGE ---
  const processedMatches = useMemo(() => {
    let filtered = matches
    if (!showFriends) filtered = filtered.filter(m => m.connection?.status !== 'accepted')
    if (onlyFriends) filtered = filtered.filter(m => m.connection?.status === 'accepted')
    
    const getScore = (m) => scoreMode === 'VIBES' ? m.personality_score : m.profile_score
    const [min, max] = matchRange
    filtered = filtered.filter(m => {
        if (m.connection?.status === 'accepted') return true 
        const pct = getScore(m)
        return pct >= min && pct <= max
    })
    
    if (searchQuery.trim() !== '') filtered = filtered.filter(m => m.pseudo?.toLowerCase().includes(searchQuery.toLowerCase()))
    filtered.sort((a, b) => isOppositeMode ? getScore(a) - getScore(b) : getScore(b) - getScore(a))
    return filtered
  }, [matches, showFriends, onlyFriends, matchRange, isOppositeMode, searchQuery, scoreMode])

  // --- HANDLERS UI ---
  const handleUserSelect = (targetUser) => { 
      if (mobileTab === 'chats') {
          setActiveChatUser(targetUser)
          markAsRead(targetUser.id)
          return
      }
      setMobileTab('constellation') 
      setSelectedUser(targetUser)
      if (window.innerWidth < 768) { 
          setIsSidebarVisible(false)
          setTimeout(() => setIsSidebarVisible(true), 150) 
      } else { 
          setIsSidebarVisible(true) 
      } 
  }
  
  const handleCloseProfile = () => { setIsSidebarVisible(false); setTimeout(() => setSelectedUser(null), 300) }
  const handleLogout = async () => await supabase.auth.signOut() 

  if (authLoading || loadingMatches) return <div className="min-h-screen bg-philo-dark flex items-center justify-center text-white"><p className="animate-pulse">Chargement...</p></div>

  const SearchBar = () => (
      <div className="px-4 pb-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Chercher..." className="w-full bg-slate-800/50 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white"/>
            {searchQuery && (<button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"><X size={14} /></button>)}
          </div>
      </div>
  )

  return (
    <div className="h-screen bg-philo-dark text-white relative overflow-hidden flex flex-col">
      
      {/* --- HEADER --- */}
      <div className="flex justify-between items-center z-30 w-full max-w-full mx-auto py-2 px-4 md:px-10 shrink-0 relative bg-slate-900/50 md:bg-transparent backdrop-blur-sm md:backdrop-blur-none border-b border-white/5 md:border-none">
        <h1 className="text-xl md:text-2xl font-bold hidden xs:block">Philotès<span className="text-philo-primary">.</span></h1>
        
        {/* MODIFICATION ICI : Positionnement Dynamique du Switch 
            - Si Liste : Droite (right-4) + Normal (mt-2)
            - Si Constellation : Centre (left-1/2) + Baissé (mt-8)
            - Sur Desktop (md:) : Toujours centré et normal (mt-0)
        */}
        {!['filters', 'chats'].includes(mobileTab) && (
            <div className={`absolute top-0 flex items-center bg-slate-800 rounded-full p-1 border border-white/10 shadow-lg gap-1 transition-all duration-300 z-50 
                ${mobileTab === 'list' 
                    ? 'right-4 mt-2 md:left-1/2 md:right-auto md:mt-0 md:-translate-x-1/2' 
                    : 'left-1/2 mt-8 -translate-x-1/2 md:mt-0'
                }
            `}>
                <button onClick={() => setScoreMode('VIBES')} className={`relative px-4 py-1.5 rounded-full text-xs font-bold transition-all z-10 flex items-center gap-2 ${scoreMode === 'VIBES' ? 'text-white' : 'text-gray-400'}`}>
                   <Sparkles size={14}/> Vibes
                   {scoreMode === 'VIBES' && <motion.div layoutId="scoreTab" className="absolute inset-0 bg-philo-primary rounded-full -z-10 shadow-lg" />}
                </button>
                <button onClick={() => setScoreMode('PROFIL')} className={`relative px-4 py-1.5 rounded-full text-xs font-bold transition-all z-10 flex items-center gap-2 ${scoreMode === 'PROFIL' ? 'text-white' : 'text-gray-400'}`}>
                   <GraduationCap size={14}/> Profil
                   {scoreMode === 'PROFIL' && <motion.div layoutId="scoreTab" className="absolute inset-0 bg-philo-secondary rounded-full -z-10 shadow-lg" />}
                </button>
            </div>
        )}

        <div className="flex gap-2 items-center">
            <button onClick={handleOpenChatsDesktop} className="hidden md:flex relative p-2 rounded-full transition-all border border-white/10 bg-white/10 text-gray-300 hover:bg-white/20">
                <MessageCircle size={20} />
                {totalUnread > 0 && <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm animate-pulse">{totalUnread > 9 ? '9+' : totalUnread}</span>}
            </button>
            <button onClick={() => setIs3D(!is3D)} className="hidden md:flex p-2 bg-white/10 rounded-full text-xs font-bold w-10 h-10 items-center justify-center border border-white/10">
                {is3D ? "2D" : "3D"}
            </button>
            <button onClick={() => navigate('/profile')} className="hidden md:block rounded-full w-10 h-10 overflow-hidden border border-white/20">
                {myProfile?.avatar_public ? <img src={`/avatars/${myProfile.avatar_public}`} className="w-full h-full object-cover" /> : <UserCircle size={38} className="text-gray-300 p-1" />}
            </button>
            <button onClick={handleLogout} className="hidden md:flex p-2 bg-white/10 rounded-full"><LogOut size={20} /></button>
        </div>
      </div>

      <div className="flex-1 flex relative overflow-hidden min-h-0 pb-[70px] md:pb-0"> 
          
          <motion.div initial={{ x: 0 }} animate={{ x: isLeftSidebarOpen ? 0 : -300 }} className="hidden md:block absolute left-0 top-0 z-20 h-full w-64 border-r border-white/5 bg-philo-dark/50 backdrop-blur-sm">
             <div className="flex justify-between items-center p-4 border-b border-white/10">
                 <h2 className="text-sm font-bold uppercase text-gray-400">Filtres</h2>
                 <button onClick={() => setIsLeftSidebarOpen(false)}><ChevronLeft size={18}/></button>
             </div>
             <div className="overflow-y-auto h-[calc(100%-60px)]">
                <DashboardFilters showFriends={showFriends} setShowFriends={setShowFriends} onlyFriends={onlyFriends} setOnlyFriends={setOnlyFriends} setMatchRange={setMatchRange} matchRange={matchRange} isOppositeMode={isOppositeMode} setIsOppositeMode={setIsOppositeMode} scoreMode={scoreMode} setScoreMode={setScoreMode} />
             </div>
          </motion.div>

          <motion.div initial={{ x: 0 }} animate={{ x: isRightSidebarOpen ? 0 : 450 }} className="hidden md:block absolute right-0 top-0 z-20 h-full w-80 lg:w-96 border-l border-white/10 bg-slate-900/30 backdrop-blur-sm">
             <div className="h-full flex flex-col">
                <div className="p-4 border-b border-white/10 shrink-0 flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold uppercase text-gray-400 flex items-center gap-2"><List size={14}/> Résultats ({processedMatches.length})</h3>
                    <button onClick={() => setIsRightSidebarOpen(false)}><ChevronRight size={18}/></button>
                </div>
                <SearchBar />
                <div className="flex-1 overflow-hidden">
                    <ListView matches={processedMatches} onSelectUser={handleUserSelect} unreadCounts={unreadCounts} myId={user?.id} scoreMode={scoreMode} />
                </div>
             </div>
          </motion.div>

          {!isLeftSidebarOpen && (<motion.button initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} onClick={() => setIsLeftSidebarOpen(true)} className="hidden md:flex absolute left-4 top-4 z-30 p-2 bg-slate-800/80 rounded-lg"><PanelLeftOpen size={20}/></motion.button>)}
          {!isRightSidebarOpen && (<motion.button initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} onClick={() => setIsRightSidebarOpen(true)} className="hidden md:flex absolute right-4 top-4 z-30 p-2 bg-slate-800/80 rounded-lg"><PanelRightOpen size={20}/></motion.button>)}

          {/* VUE CENTRALE */}
          <div className={`flex-1 relative overflow-hidden w-full h-full transition-all duration-300 ease-in-out ${isLeftSidebarOpen ? 'md:pl-64' : 'md:pl-0'} ${isRightSidebarOpen ? 'md:pr-80 lg:pr-96' : 'md:pr-0'}`}>
             
             {/* MOBILE */}
             <div className="block md:hidden h-full w-full">
                {mobileTab === 'constellation' && (
                  <div className="w-full h-full relative">
                    <button onClick={() => setIs3D(!is3D)} className="absolute bottom-4 right-4 z-40 px-4 py-2 bg-slate-800/90 border border-white/20 rounded-full text-xs font-bold shadow-xl backdrop-blur-md">
                        {is3D ? "Passer en 2D" : "Passer en 3D"}
                    </button>
                    {is3D ? (
                        <Constellation3D matches={processedMatches} myProfile={myProfile} onSelectUser={handleUserSelect} selectedUser={selectedUser} unreadCounts={unreadCounts} myId={user?.id} scoreMode={scoreMode} />
                    ) : (
                        <ConstellationView matches={processedMatches} myProfile={myProfile} onSelectUser={handleUserSelect} unreadCounts={unreadCounts} myId={user?.id} scoreMode={scoreMode} />
                    )}
                  </div>
                )}

                {(mobileTab === 'list' || mobileTab === 'chats') && (
                   <div className="w-full h-full bg-slate-900 p-4 flex flex-col">
                      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        {mobileTab === 'chats' ? <><MessageCircle className="text-philo-primary"/> Discussions</> : <><List/> Liste Univers</>}
                      </h2>
                      <SearchBar />
                      <div className="flex-1 overflow-hidden mt-2">
                          <ListView matches={processedMatches} onSelectUser={handleUserSelect} unreadCounts={unreadCounts} myId={user?.id} scoreMode={scoreMode} />
                      </div>
                   </div>
                )}

                {mobileTab === 'filters' && (
                  <div className="w-full h-full bg-slate-900 p-6 overflow-y-auto">
                     <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><SlidersHorizontal/> Filtres</h2>
                     <DashboardFilters showFriends={showFriends} setShowFriends={setShowFriends} onlyFriends={onlyFriends} setOnlyFriends={setOnlyFriends} setMatchRange={setMatchRange} matchRange={matchRange} isOppositeMode={isOppositeMode} setIsOppositeMode={setIsOppositeMode} scoreMode={scoreMode} setScoreMode={setScoreMode} />
                  </div>
                )}
             </div>

             {/* DESKTOP */}
             <div className="hidden md:block h-full w-full">
                {is3D ? (
                    <Constellation3D matches={processedMatches} myProfile={myProfile} onSelectUser={handleUserSelect} selectedUser={selectedUser} unreadCounts={unreadCounts} myId={user?.id} scoreMode={scoreMode} />
                ) : (
                    <ConstellationView matches={processedMatches} myProfile={myProfile} onSelectUser={handleUserSelect} unreadCounts={unreadCounts} myId={user?.id} scoreMode={scoreMode} />
                )}
             </div>

          </div>
      </div>

      {/* --- BOTTOM NAVIGATION BAR --- */}
      <div className="md:hidden fixed bottom-0 left-0 w-full h-[65px] bg-slate-900/95 backdrop-blur-md border-t border-white/10 z-50 flex justify-around items-center px-2 pb-2 safe-area-bottom shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
          <button onClick={handleTabConstellation} className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all ${mobileTab === 'constellation' ? 'text-philo-primary' : 'text-gray-400 hover:text-white'}`}>
             <Globe size={24} strokeWidth={mobileTab === 'constellation' ? 2.5 : 2} />
             <span className="text-[10px] font-medium mt-1">Univers</span>
          </button>
          <button onClick={handleTabList} className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all ${mobileTab === 'list' ? 'text-philo-primary' : 'text-gray-400 hover:text-white'}`}>
             <List size={24} strokeWidth={mobileTab === 'list' ? 2.5 : 2} />
             <span className="text-[10px] font-medium mt-1">Liste</span>
          </button>
          <button onClick={handleTabFilters} className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all ${mobileTab === 'filters' ? 'text-philo-primary' : 'text-gray-400 hover:text-white'}`}>
             <SlidersHorizontal size={24} strokeWidth={mobileTab === 'filters' ? 2.5 : 2} />
             <span className="text-[10px] font-medium mt-1">Filtres</span>
          </button>
          <button onClick={handleTabChats} className={`relative flex flex-col items-center justify-center p-2 rounded-xl transition-all ${mobileTab === 'chats' ? 'text-philo-primary' : 'text-gray-400 hover:text-white'}`}>
             <div className="relative">
                <MessageCircle size={24} strokeWidth={mobileTab === 'chats' ? 2.5 : 2} />
                {totalUnread > 0 && <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white ring-2 ring-slate-900"></span>}
             </div>
             <span className="text-[10px] font-medium mt-1">Chat</span>
          </button>
          <button onClick={handleTabProfile} className="flex flex-col items-center justify-center p-2 rounded-xl text-gray-400 hover:text-white">
             {myProfile?.avatar_public ? (
                 <img src={`/avatars/${myProfile.avatar_public}`} className="w-6 h-6 rounded-full object-cover border border-gray-400" />
             ) : (
                 <User size={24} />
             )}
             <span className="text-[10px] font-medium mt-1">Profil</span>
          </button>
      </div>

      {/* MODALE PROFIL */}
      <AnimatePresence>
          {(selectedUser && isSidebarVisible && !activeChatUser) && (
              <>
                <div className="fixed inset-0 bg-black/60 z-50" onClick={handleCloseProfile} />
                <UserProfileSidebar userId={selectedUser.id} initialProfile={selectedUser} similarity={scoreMode === 'VIBES' ? selectedUser.personality_score : selectedUser.profile_score} unreadCount={unreadCounts[selectedUser.id] || 0} onClose={handleCloseProfile} onChatStatusChange={handleChatStatusChange} scoreMode={scoreMode} />
              </>
          )}
      </AnimatePresence>

      {/* MODALE CHAT DIRECT */}
      <AnimatePresence>
          {activeChatUser && (
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ duration: 0.3 }} className="fixed inset-0 z-[60] bg-slate-900 flex flex-col">
                  <ChatInterface 
                      currentUser={user} 
                      targetUser={activeChatUser}
                      connection={activeChatUser.connection} 
                      onBack={() => setActiveChatUser(null)} 
                      onCreateConnection={async () => { }} 
                  />
              </motion.div>
          )}
      </AnimatePresence>
    </div>
  )
}