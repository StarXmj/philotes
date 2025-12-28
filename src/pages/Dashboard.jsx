// src/pages/Dashboard.jsx
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { AnimatePresence, motion } from 'framer-motion'
import { UserCircle, LogOut, Filter, List, ChevronLeft, ChevronRight, PanelLeftOpen, PanelRightOpen, Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Composants
import ConstellationView from '../components/dashboard/ConstellationView'
import Constellation3D from '../components/dashboard/Constellation3D'
import DashboardFilters from '../components/dashboard/DashboardFilters'
import ListView from '../components/dashboard/ListView'
import UserProfileSidebar from '../components/dashboard/UserProfileSidebar'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, profile: myProfile, loading: authLoading } = useAuth()

  // --- 1. ÉTATS ---
  const [scoreMode, setScoreMode] = useState('IA') // 'IA' ou 'PROFIL'
  const [unreadCounts, setUnreadCounts] = useState({})
  const activeChatRef = useRef(null) 

  const [matches, setMatches] = useState([])
  const [loadingMatches, setLoadingMatches] = useState(true)
  
  // États UI
  const [selectedUser, setSelectedUser] = useState(null)
  const [isSidebarVisible, setIsSidebarVisible] = useState(false)
  const [is3D, setIs3D] = useState(false) 
  const [showFriends, setShowFriends] = useState(true)
  const [matchRange, setMatchRange] = useState([0, 100])
  const [isOppositeMode, setIsOppositeMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [showMobileList, setShowMobileList] = useState(false)
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true)

  // --- 2. LOGIQUE DE NETTOYAGE NOTIFICATIONS ---
  const markAsRead = useCallback(async (senderId) => {
      // Nettoyage visuel immédiat
      setUnreadCounts(prev => {
          const newCounts = { ...prev }
          delete newCounts[senderId]
          return newCounts
      })
      // Nettoyage Base de données
      if (user?.id) {
        await supabase.from('messages').update({ read_at: new Date().toISOString() })
          .eq('receiver_id', user.id).eq('sender_id', senderId).is('read_at', null)
      }
  }, [user])

  // Appelé par la Sidebar quand on ouvre/ferme le chat
  const handleChatStatusChange = useCallback((userId, isChatting) => {
    if (isChatting) {
      activeChatRef.current = String(userId)
      // On nettoie la notif UNIQUEMENT quand le chat est ouvert
      markAsRead(userId)
    } else {
      activeChatRef.current = null
    }
  }, [markAsRead])

  // --- 3. CHARGEMENT & REALTIME ---
  useEffect(() => {
    if (authLoading) return
    if (!user || !myProfile) { setLoadingMatches(false); return }

    const loadData = async () => {
      try {
          if (!myProfile.embedding) { setLoadingMatches(false); return }

          // A. Récupération des profils (Large pour tout le monde)
          const { data: matchedUsers } = await supabase.rpc('match_students', {
            query_embedding: myProfile.embedding,
            match_threshold: -1, 
            match_count: 1000 // On récupère jusqu'à 1000 profils
          })

          // B. Connexions
          const { data: allMyConnections } = await supabase
            .from('connections').select('*')
            .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)

          // C. Notifs initiales
          const { data: unreadMsgs } = await supabase
            .from('messages').select('sender_id')
            .eq('receiver_id', user.id).is('read_at', null)
          
          const initialCounts = {}
          unreadMsgs?.forEach(msg => {
            initialCounts[msg.sender_id] = (initialCounts[msg.sender_id] || 0) + 1
          })
          setUnreadCounts(initialCounts)

          // D. Fusion
          if (matchedUsers) {
            const matchesWithStatus = matchedUsers
              .filter(p => p.id !== user.id)
              .map(match => {
                const conn = allMyConnections?.find(c => 
                  (c.sender_id === user.id && c.receiver_id === match.id) ||
                  (c.receiver_id === user.id && c.sender_id === match.id)
                )
                return { 
                    ...match, 
                    // Stockage des scores bruts pour le switch dynamique
                    embedding_score: match.embedding_score || (match.similarity * 100), 
                    profile_score: match.profile_score || 0,
                    // Score global par défaut
                    score_global: (match.similarity * 100).toFixed(0), 
                    connection: conn || null 
                }
              })
            setMatches(matchesWithStatus)
          }
      } catch (error) { console.error(error) } 
      finally { setLoadingMatches(false) }
    }
    loadData()

    // E. REALTIME ROBUSTE (Filtrage manuel)
    const channel = supabase.channel('dashboard-final-fusion')
    
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        // 1. Filtrage manuel : est-ce pour moi ?
        if (String(payload.new.receiver_id) !== String(user.id)) return 
        
        // 2. Est-ce que le chat est ouvert ?
        const senderId = String(payload.new.sender_id)
        if (activeChatRef.current === senderId) return 

        // 3. Mise à jour compteur
        setUnreadCounts(prev => ({ ...prev, [senderId]: (prev[senderId] || 0) + 1 }))
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, (payload) => {
        if (payload.eventType === 'DELETE') {
             setMatches(curr => curr.map(m => m.connection?.id === payload.old.id ? { ...m, connection: null } : m))
        } else if (payload.new) {
             setMatches(curr => curr.map(m => {
                const isRel = (payload.new.sender_id === user.id && payload.new.receiver_id === m.id) ||
                              (payload.new.receiver_id === user.id && payload.new.sender_id === m.id)
                return isRel ? { ...m, connection: payload.new } : m
             }))
        }
    }).subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, myProfile, authLoading])

  // --- UI HANDLERS ---
  const handleUserSelect = (targetUser) => {
    setShowMobileList(false)
    setSelectedUser(targetUser)
    
    // NOTE: On n'efface pas la notif ici, mais dans handleChatStatusChange (ouverture chat)
    
    if (window.innerWidth < 768) {
        setIsSidebarVisible(false)
        setTimeout(() => setIsSidebarVisible(true), 1500)
    } else {
        setIsSidebarVisible(true)
    }
  }

  const handleCloseProfile = () => { setIsSidebarVisible(false); setTimeout(() => setSelectedUser(null), 300) }
  const handleLogout = async () => await supabase.auth.signOut() 

  // --- FILTRAGE ET TRI ---
  const processedMatches = useMemo(() => {
    let filtered = matches
    if (!showFriends) filtered = filtered.filter(m => m.connection?.status !== 'accepted')
    
    // Fonction helper pour récupérer le bon score selon le mode
    const getScore = (m) => scoreMode === 'IA' ? (m.embedding_score || 0) : (m.profile_score || 0)

    const [min, max] = matchRange
    filtered = filtered.filter(m => {
        if (m.connection?.status === 'accepted') return true 
        const pct = getScore(m)
        return pct >= min && pct <= max
    })
    
    if (searchQuery.trim() !== '') filtered = filtered.filter(m => m.pseudo?.toLowerCase().includes(searchQuery.toLowerCase()))
    
    // Tri dynamique selon le mode
    filtered.sort((a, b) => isOppositeMode ? getScore(a) - getScore(b) : getScore(b) - getScore(a))
    
    return filtered
  }, [matches, showFriends, matchRange, isOppositeMode, searchQuery, scoreMode]) // Ajout scoreMode aux dépendances

  // Pas de slice : on affiche tout le monde
  const constellationMatches = processedMatches

  if (authLoading || loadingMatches) return <div className="min-h-screen bg-philo-dark flex items-center justify-center text-white p-4"><p className="animate-pulse">Chargement...</p></div>

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
    <div className="h-screen bg-philo-dark text-white p-4 relative overflow-hidden flex flex-col">
      {/* HEADER */}
      <div className="flex justify-between items-center z-30 w-full max-w-full mx-auto py-2 px-4 md:px-10 shrink-0 relative">
        <h1 className="text-2xl font-bold">Philotès<span className="text-philo-primary">.</span></h1>
        
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center bg-slate-800 rounded-full p-1 border border-white/10 shadow-lg">
            <button onClick={() => setIs3D(false)} className={`relative px-4 py-1.5 rounded-full text-xs font-bold transition-all z-10 ${!is3D ? 'text-white' : 'text-gray-400'}`}>2D {!is3D && <motion.div layoutId="activeTab" className="absolute inset-0 bg-philo-primary rounded-full -z-10 shadow-lg" />}</button>
            <button onClick={() => setIs3D(true)} className={`relative px-4 py-1.5 rounded-full text-xs font-bold transition-all z-10 ${is3D ? 'text-white' : 'text-gray-400'}`}>3D {is3D && <motion.div layoutId="activeTab" className="absolute inset-0 bg-philo-primary rounded-full -z-10 shadow-lg" />}</button>
        </div>

        <div className="flex gap-2 items-center">
          <button onClick={() => navigate('/profile')} className="rounded-full w-10 h-10 overflow-hidden border border-white/20">
             {myProfile?.avatar_public ? <img src={`/avatars/${myProfile.avatar_public}`} className="w-full h-full object-cover" /> : <UserCircle size={38} className="text-gray-300 p-1" />}
          </button>
          <button onClick={handleLogout} className="p-2 bg-white/10 rounded-full"><LogOut size={20} /></button>
        </div>
      </div>

      <div className="flex-1 flex relative overflow-hidden min-h-0">
          {/* SIDEBAR GAUCHE (FILTRES) */}
          <motion.div initial={{ x: 0 }} animate={{ x: isLeftSidebarOpen ? 0 : -300 }} className="hidden md:block absolute left-0 top-0 z-20 h-full w-64 border-r border-white/5 bg-philo-dark/50 backdrop-blur-sm">
             <div className="flex justify-between items-center p-4 border-b border-white/10">
                 <h2 className="text-sm font-bold uppercase text-gray-400">Filtres</h2>
                 <button onClick={() => setIsLeftSidebarOpen(false)}><ChevronLeft size={18}/></button>
             </div>
             <div className="overflow-y-auto h-[calc(100%-60px)]">
                {/* On passe le mode et le setter */}
                <DashboardFilters 
                    showFriends={showFriends} setShowFriends={setShowFriends} 
                    setMatchRange={setMatchRange} matchRange={matchRange} 
                    isOppositeMode={isOppositeMode} setIsOppositeMode={setIsOppositeMode} 
                    scoreMode={scoreMode} setScoreMode={setScoreMode} 
                />
             </div>
          </motion.div>

          {/* SIDEBAR DROITE (LISTE) */}
          <motion.div initial={{ x: 0 }} animate={{ x: isRightSidebarOpen ? 0 : 450 }} className="hidden md:block absolute right-0 top-0 z-20 h-full w-80 lg:w-96 border-l border-white/10 bg-slate-900/30 backdrop-blur-sm">
             <div className="h-full flex flex-col">
                <div className="p-4 border-b border-white/10 shrink-0 flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold uppercase text-gray-400 flex items-center gap-2"><List size={14}/> Résultats ({processedMatches.length})</h3>
                    <button onClick={() => setIsRightSidebarOpen(false)}><ChevronRight size={18}/></button>
                </div>
                <SearchBar />
                <div className="flex-1 overflow-hidden">
                    {/* On passe scoreMode à la liste pour l'affichage correct */}
                    <ListView matches={processedMatches} onSelectUser={handleUserSelect} unreadCounts={unreadCounts} myId={user?.id} scoreMode={scoreMode} />
                </div>
             </div>
          </motion.div>

          {!isLeftSidebarOpen && (<motion.button initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} onClick={() => setIsLeftSidebarOpen(true)} className="hidden md:flex absolute left-4 top-4 z-30 p-2 bg-slate-800/80 rounded-lg"><PanelLeftOpen size={20}/></motion.button>)}
          {!isRightSidebarOpen && (<motion.button initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} onClick={() => setIsRightSidebarOpen(true)} className="hidden md:flex absolute right-4 top-4 z-30 p-2 bg-slate-800/80 rounded-lg"><PanelRightOpen size={20}/></motion.button>)}

          {/* VUE CENTRALE (2D/3D) */}
          <div className={`flex-1 relative overflow-hidden w-full h-full transition-all duration-300 ease-in-out ${isLeftSidebarOpen ? 'md:pl-64' : 'md:pl-0'} ${isRightSidebarOpen ? 'md:pr-80 lg:pr-96' : 'md:pr-0'}`}>
             {is3D ? (
                <Constellation3D matches={constellationMatches} myProfile={myProfile} onSelectUser={handleUserSelect} selectedUser={selectedUser} unreadCounts={unreadCounts} myId={user?.id} scoreMode={scoreMode} />
             ) : (
                <ConstellationView matches={constellationMatches} myProfile={myProfile} onSelectUser={handleUserSelect} unreadCounts={unreadCounts} myId={user?.id} scoreMode={scoreMode} />
             )}
          </div>
          
          <div className="md:hidden absolute top-4 left-0 z-20"><button onClick={() => setShowMobileFilters(true)} className="p-3 bg-slate-800/80 rounded-r-xl"><Filter size={24} /></button></div>
          <div className="md:hidden absolute top-4 right-0 z-20"><button onClick={() => setShowMobileList(true)} className="p-3 bg-slate-800/80 rounded-l-xl"><List size={24} /></button></div>
      </div>

      <AnimatePresence>
          {showMobileFilters && (<motion.div className="fixed inset-0 z-50 flex"><div className="fixed inset-0 bg-black/60" onClick={() => setShowMobileFilters(false)}/><motion.div className="relative w-3/4 max-w-xs bg-slate-900 p-6 shadow-2xl h-full"><DashboardFilters showFriends={showFriends} setShowFriends={setShowFriends} setMatchRange={setMatchRange} isOppositeMode={isOppositeMode} setIsOppositeMode={setIsOppositeMode} scoreMode={scoreMode} setScoreMode={setScoreMode} /></motion.div></motion.div>)}
      </AnimatePresence>
      <AnimatePresence>
          {showMobileList && (
            <motion.div className="fixed inset-0 z-50 flex justify-end">
                <div className="fixed inset-0 bg-black/60" onClick={() => setShowMobileList(false)}/>
                <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} className="relative w-3/4 max-w-md bg-slate-900 flex flex-col shadow-2xl h-full">
                    <div className="p-4 border-b border-white/10 flex justify-between items-center bg-slate-900/95">
                        <h2 className="text-xl font-bold flex items-center gap-2"><List size={20}/> Liste ({processedMatches.length})</h2>
                        <button onClick={() => setShowMobileList(false)}><X size={24}/></button>
                    </div>
                    <div className="pt-4"><SearchBar /></div>
                    <div className="flex-1 overflow-hidden">
                        <ListView matches={processedMatches} onSelectUser={handleUserSelect} unreadCounts={unreadCounts} myId={user?.id} scoreMode={scoreMode} />
                    </div>
                </motion.div>
            </motion.div>
          )}
      </AnimatePresence>

      <AnimatePresence>
          {(selectedUser && isSidebarVisible) && (
              <>
                <div className="fixed inset-0 bg-black/60 z-50" onClick={handleCloseProfile} />
                <UserProfileSidebar 
                    userId={selectedUser.id} 
                    similarity={selectedUser.score} 
                    unreadCount={unreadCounts[selectedUser.id] || 0} 
                    onClose={handleCloseProfile} 
                    onChatStatusChange={handleChatStatusChange} 
                />
              </>
          )}
      </AnimatePresence>
    </div>
  )
}