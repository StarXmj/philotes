import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { AnimatePresence, motion } from 'framer-motion'
import { UserCircle, LogOut, Filter, X, List, ChevronLeft, ChevronRight, PanelLeftOpen, PanelRightOpen, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

import ConstellationView from '../components/dashboard/ConstellationView'
import Constellation3D from '../components/dashboard/Constellation3D'

import DashboardFilters from '../components/dashboard/DashboardFilters'
import ListView from '../components/dashboard/ListView'
import UserProfileSidebar from '../components/dashboard/UserProfileSidebar'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, profile: myProfile, loading: authLoading } = useAuth()
  
  const [matches, setMatches] = useState([])
  const [loadingMatches, setLoadingMatches] = useState(true)
  
  // --- ÉTATS UI ---
  const [selectedUser, setSelectedUser] = useState(null)
  const [isSidebarVisible, setIsSidebarVisible] = useState(false)
  const [is3D, setIs3D] = useState(false) 

  // --- SUIVI CHAT ACTIF ---
  const activeChatUserIdRef = useRef(null) 

  // --- FILTRES ---
  const [showFriends, setShowFriends] = useState(true)
  const [matchRange, setMatchRange] = useState([0, 100])
  const [isOppositeMode, setIsOppositeMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // --- RESPONSIVE ---
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [showMobileList, setShowMobileList] = useState(false)
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true)

  // --- NOTIFICATIONS ---
  const [unreadCounts, setUnreadCounts] = useState({}) 

  // --- 1. FONCTION DE CHARGEMENT DES NOTIFICATIONS (Optimisée) ---
  const fetchUnreadCounts = async () => {
      if (!user?.id) return

      // Appel de la fonction SQL (RPC) créée à l'étape 1
      const { data, error } = await supabase.rpc('get_unread_counts', { p_user_id: user.id })
      
      if (error) {
          console.error("Erreur chargement notifs:", error)
          return
      }

      if (data) {
          // Conversion du format SQL [{sender_id: "xyz", count: 2}] -> JS { "xyz": 2 }
          const counts = data.reduce((acc, item) => ({
              ...acc,
              [item.sender_id]: Number(item.count) // S'assurer que c'est un nombre
          }), {})
          setUnreadCounts(counts)
      }
  }

  // --- 2. CHARGEMENT INITIAL DES DONNÉES ---
  useEffect(() => {
    if (authLoading) return
    if (!user || !myProfile) { setLoadingMatches(false); return }

    const loadData = async () => {
      try {
          if (!myProfile.embedding) { setLoadingMatches(false); return }

          // A. Matchs
          const { data: matchedUsers, error: rpcError } = await supabase.rpc('find_best_matches', {
            p_embedding: myProfile.embedding,
            p_match_threshold: 0, 
            p_gender_filter: null,
            p_my_id: user.id,
            p_my_domaine: myProfile.domaine || '' 
          })
          if (rpcError) throw rpcError

          // B. Connexions
          const { data: allMyConnections } = await supabase
            .from('connections')
            .select('*')
            .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)

          // C. Fusion
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
                    score: match.final_score || match.similarity,
                    score_global: match.score_global,             
                    connection: conn || null 
                }
              })
            setMatches(matchesWithStatus)
          }

          // D. Chargement initial des messages non lus
          await fetchUnreadCounts()

      } catch (error) { 
          console.error("Erreur globale Dashboard:", error) 
      } finally { 
          setLoadingMatches(false) 
      }
    }
    loadData()
  }, [user, myProfile, authLoading])

  // --- 3. GESTION DU REALTIME (NOTIFICATIONS & MATCHS) ---
  useEffect(() => {
    if (!user?.id) return

    const channel = supabase.channel('dashboard-realtime')

    channel
    // A. Écoute les changements de CONNEXION (Accept/Rejet)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, (payload) => {
        if (payload.eventType === 'DELETE') {
             setMatches(curr => curr.map(m => m.connection?.id === payload.old.id ? { ...m, connection: null } : m))
        }
        else if (payload.new) {
             setMatches(curr => curr.map(m => {
                if (m.id === payload.new.sender_id || m.id === payload.new.receiver_id) {
                     const isRelevant = (payload.new.sender_id === user.id && payload.new.receiver_id === m.id) ||
                                        (payload.new.receiver_id === user.id && payload.new.sender_id === m.id)
                     if (isRelevant) return { ...m, connection: payload.new }
                }
                return m
             }))
        }
    })
    
    // B. Écoute les NOUVEAUX MESSAGES (Incrémentation instantanée)
    .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages', 
        filter: `receiver_id=eq.${user.id}` 
    }, (payload) => {
        const senderId = payload.new.sender_id
        
        // Si le chat est ouvert avec cette personne, on ignore (c'est lu direct)
        if (activeChatUserIdRef.current === senderId) return 

        // Sinon, on incrémente localement (+1)
        setUnreadCounts(prev => ({
            ...prev,
            [senderId]: (prev[senderId] || 0) + 1
        }))
    })

    // C. Écoute les MISES À JOUR (Lecture faite ailleurs)
    .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'messages', 
        filter: `receiver_id=eq.${user.id}` 
    }, () => {
        // Si un message passe à "lu" (update read_at), on re-vérifie tout via la base
        fetchUnreadCounts()
    })

    .subscribe()

    return () => { supabase.removeChannel(channel) }

  }, [user?.id])

  // --- HELPER : Actions UI ---

  const handleUserSelect = (targetUser) => {
    setShowMobileList(false)
    setSelectedUser(targetUser)
    
    // UI Responsive
    if (window.innerWidth < 768) {
        setIsSidebarVisible(false)
        setTimeout(() => setIsSidebarVisible(true), 1500)
    } else {
        setIsSidebarVisible(true)
    }
  }

  // Appelé par UserProfileSidebar quand le chat s'ouvre/ferme
  const handleChatStatusChange = (userId, isOpen) => {
      activeChatUserIdRef.current = isOpen ? userId : null
      
      // Si on ouvre le chat, on remet le compteur à 0 visuellement
      if (isOpen) {
          setUnreadCounts(prev => {
              const newCounts = { ...prev }
              delete newCounts[userId] // On retire la clé pour ce user
              return newCounts
          })
      }
  }

  const handleCloseProfile = () => {
      setIsSidebarVisible(false)
      activeChatUserIdRef.current = null
      setTimeout(() => setSelectedUser(null), 300)
  }

  const handleLogout = async () => await supabase.auth.signOut() 

  // --- CALCUL DES FILTRES ---
  const processedMatches = useMemo(() => {
    let filtered = matches
    if (!showFriends) filtered = filtered.filter(m => m.connection?.status !== 'accepted')
    const [min, max] = matchRange
    filtered = filtered.filter(m => {
        if (m.connection?.status === 'accepted') return true 
        const pct = (m.score_global || m.score * 100)
        return pct >= min && pct <= max
    })
    if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase()
        filtered = filtered.filter(m => m.pseudo?.toLowerCase().includes(query))
    }
    filtered.sort((a, b) => isOppositeMode ? a.score - b.score : b.score - a.score)
    return filtered
  }, [matches, showFriends, matchRange, isOppositeMode, searchQuery])

  if (authLoading || loadingMatches) return <div className="min-h-screen bg-philo-dark flex flex-col gap-4 items-center justify-center text-white p-4"><p className="animate-pulse text-xl font-bold">Chargement de la galaxie...</p></div>

  const SearchBar = () => (
      <div className="px-4 pb-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-philo-primary transition" size={16} />
            <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Chercher un étudiant..." 
                className="w-full bg-slate-800/50 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-philo-primary focus:bg-slate-800 transition shadow-inner placeholder:text-gray-600"
            />
            {searchQuery && (<button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"><X size={14} /></button>)}
          </div>
      </div>
  )

  return (
    <div className="h-screen bg-philo-dark text-white p-4 relative overflow-hidden flex flex-col">
      {/* NAVBAR */}
      <div className="flex justify-between items-center z-30 w-full max-w-full mx-auto py-2 px-4 md:px-10 shrink-0 relative">
        <h1 className="text-2xl font-bold">Philotès<span className="text-philo-primary">.</span></h1>
        
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center bg-slate-800 rounded-full p-1 border border-white/10 shadow-lg">
            <button onClick={() => setIs3D(false)} className={`relative px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 z-10 ${!is3D ? 'text-white' : 'text-gray-400 hover:text-white'}`}>
                2D {!is3D && <motion.div layoutId="activeTab" className="absolute inset-0 bg-philo-primary rounded-full -z-10 shadow-lg" />}
            </button>
            <button onClick={() => setIs3D(true)} className={`relative px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 z-10 ${is3D ? 'text-white' : 'text-gray-400 hover:text-white'}`}>
                3D {is3D && <motion.div layoutId="activeTab" className="absolute inset-0 bg-philo-primary rounded-full -z-10 shadow-lg" />}
            </button>
        </div>

        <div className="flex gap-2 items-center">
          <button onClick={() => navigate('/profile')} className="rounded-full hover:opacity-80 transition overflow-hidden border border-white/20 w-10 h-10">
             {myProfile?.avatar_prive ? <img src={myProfile.avatar_prive} className="w-full h-full object-cover" /> : 
              myProfile?.avatar_public ? <img src={`/avatars/${myProfile.avatar_public}`} className="w-full h-full object-cover" /> : 
              <UserCircle size={38} className="text-gray-300 w-full h-full p-1" />}
          </button>
          <button onClick={handleLogout} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition"><LogOut size={20} /></button>
        </div>
      </div>

      <div className="flex-1 flex relative overflow-hidden min-h-0">
          
          {/* SIDEBAR GAUCHE */}
          <motion.div initial={{ x: 0 }} animate={{ x: isLeftSidebarOpen ? 0 : -300 }} className="hidden md:block absolute left-0 top-0 z-20 h-full w-64 border-r border-white/5 bg-philo-dark/50 backdrop-blur-sm">
             <div className="flex justify-between items-center p-4 border-b border-white/10">
                 <h2 className="text-sm font-bold uppercase text-gray-400">Filtres</h2>
                 <button onClick={() => setIsLeftSidebarOpen(false)} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition"><ChevronLeft size={18}/></button>
             </div>
             <div className="overflow-y-auto h-[calc(100%-60px)]"><DashboardFilters showFriends={showFriends} setShowFriends={setShowFriends} setMatchRange={setMatchRange} isOppositeMode={isOppositeMode} setIsOppositeMode={setIsOppositeMode}/></div>
          </motion.div>

          {/* SIDEBAR DROITE */}
          <motion.div initial={{ x: 0 }} animate={{ x: isRightSidebarOpen ? 0 : 450 }} className="hidden md:block absolute right-0 top-0 z-20 h-full w-80 lg:w-96 border-l border-white/10 bg-slate-900/30 backdrop-blur-sm">
             <div className="h-full flex flex-col">
                <div className="p-4 border-b border-white/10 shrink-0 flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold uppercase text-gray-400 flex items-center gap-2"><List size={14}/> Résultats ({processedMatches.length})</h3>
                    <button onClick={() => setIsRightSidebarOpen(false)} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition"><ChevronRight size={18}/></button>
                </div>
                <SearchBar />
                <div className="flex-1 overflow-hidden"><ListView matches={processedMatches} onSelectUser={handleUserSelect} /></div>
             </div>
          </motion.div>

          {/* BOUTONS FLOTTANTS */}
          {!isLeftSidebarOpen && (<motion.button initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} onClick={() => setIsLeftSidebarOpen(true)} className="hidden md:flex absolute left-4 top-4 z-30 p-2 bg-slate-800/80 backdrop-blur-md border border-white/10 rounded-lg text-white shadow-lg"><PanelLeftOpen size={20}/></motion.button>)}
          {!isRightSidebarOpen && (<motion.button initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} onClick={() => setIsRightSidebarOpen(true)} className="hidden md:flex absolute right-4 top-4 z-30 p-2 bg-slate-800/80 backdrop-blur-md border border-white/10 rounded-lg text-white shadow-lg"><PanelRightOpen size={20}/></motion.button>)}

          {/* ZONE CENTRALE */}
          <div className={`flex-1 relative overflow-hidden w-full h-full transition-all duration-300 ease-in-out ${isLeftSidebarOpen ? 'md:pl-64' : 'md:pl-0'} ${isRightSidebarOpen ? 'md:pr-80 lg:pr-96' : 'md:pr-0'}`}>
             {is3D ? (
                <Constellation3D 
                    matches={processedMatches} 
                    myProfile={myProfile} 
                    onSelectUser={handleUserSelect} 
                    selectedUser={selectedUser}
                    unreadCounts={unreadCounts}
                    myId={user?.id}
                />
             ) : (
                <ConstellationView 
                    matches={processedMatches} 
                    myProfile={myProfile} 
                    onSelectUser={handleUserSelect} 
                    unreadCounts={unreadCounts}
                    myId={user?.id}
                />
             )}
          </div>

          {/* MOBILE BOUTONS */}
          <div className="md:hidden absolute top-4 left-0 z-20"><button onClick={() => setShowMobileFilters(true)} className="p-3 bg-slate-800/80 backdrop-blur-md border border-white/10 rounded-r-xl text-white"><Filter size={24} /></button></div>
          <div className="md:hidden absolute top-4 right-0 z-20"><button onClick={() => setShowMobileList(true)} className="p-3 bg-slate-800/80 backdrop-blur-md border border-white/10 rounded-l-xl text-white"><List size={24} /></button></div>
      </div>

      {/* DRAWERS MOBILE */}
      <AnimatePresence>
          {showMobileFilters && (<motion.div className="fixed inset-0 z-50 flex"><div className="fixed inset-0 bg-black/60" onClick={() => setShowMobileFilters(false)}/><motion.div className="relative w-3/4 max-w-xs bg-slate-900 p-6 shadow-2xl h-full"><DashboardFilters showFriends={showFriends} setShowFriends={setShowFriends} setMatchRange={setMatchRange} isOppositeMode={isOppositeMode} setIsOppositeMode={setIsOppositeMode}/></motion.div></motion.div>)}
      </AnimatePresence>
      <AnimatePresence>
          {showMobileList && (
            <motion.div className="fixed inset-0 z-50 flex justify-end">
                <div className="fixed inset-0 bg-black/60" onClick={() => setShowMobileList(false)}/>
                <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="relative w-3/4 max-w-md bg-slate-900 flex flex-col shadow-2xl h-full">
                    <div className="p-4 border-b border-white/10 flex justify-between items-center bg-slate-900/95">
                        <h2 className="text-xl font-bold flex items-center gap-2"><List size={20}/> Liste ({processedMatches.length})</h2>
                        <button onClick={() => setShowMobileList(false)}><X size={24}/></button>
                    </div>
                    <div className="pt-4"><SearchBar /></div>
                    <div className="flex-1 overflow-hidden"><ListView matches={processedMatches} onSelectUser={handleUserSelect}/></div>
                </motion.div>
            </motion.div>
          )}
      </AnimatePresence>

      {/* SIDEBAR PROFIL */}
      <AnimatePresence>
          {(selectedUser && isSidebarVisible) && (
              <>
                <div className="fixed inset-0 bg-black/60 z-50" onClick={handleCloseProfile} />
                <UserProfileSidebar 
                    userId={selectedUser.id} 
                    similarity={selectedUser.score} 
                    initialUnreadCount={unreadCounts[selectedUser.id] || 0} 
                    onClose={handleCloseProfile}
                    onChatStatusChange={handleChatStatusChange} 
                />
              </>
          )}
      </AnimatePresence>
    </div>
  )
}