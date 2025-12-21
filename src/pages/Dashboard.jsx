import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { motion, AnimatePresence } from 'framer-motion'
import { User, LogOut, UserCircle, Magnet, Users, RotateCcw, GitCommitVertical } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import UserProfileSidebar from '../components/dashboard/UserProfileSidebar'

// --- COMPOSANTS ORBITAUX ---
const OrbitalRing = ({ radius, duration, children, reverse = false }) => {
  return (
    <div className="absolute flex items-center justify-center" style={{ width: radius * 2, height: radius * 2 }}>
       <div className="absolute inset-0 rounded-full border border-white/5" />
       <motion.div 
         className="absolute inset-0 w-full h-full"
         animate={{ rotate: reverse ? -360 : 360 }}
         transition={{ duration: duration, repeat: Infinity, ease: "linear" }}
       >
          {children}
       </motion.div>
    </div>
  )
}

const Planet = ({ angle, radius, duration, reverse = false, children }) => {
    const x = Math.cos(angle) * radius + radius
    const y = Math.sin(angle) * radius + radius
    return (
        <div className="absolute flex items-center justify-center" style={{ left: x, top: y, width: 0, height: 0 }}>
            <motion.div animate={{ rotate: reverse ? 360 : -360 }} transition={{ duration: duration, repeat: Infinity, ease: "linear" }}>
                {children}
            </motion.div>
        </div>
    )
}

// --- COMPOSANT DUAL SLIDER ---
const DualRangeSlider = ({ min, max, onChange }) => {
    const [minVal, setMinVal] = useState(min)
    const [maxVal, setMaxVal] = useState(max)
    const getPercent = useCallback((value) => Math.round(((value - 0) / (100 - 0)) * 100), [])

    useEffect(() => { setMinVal(min); setMaxVal(max); }, [min, max])

    const handleMinChange = (e) => {
        const value = Math.min(Number(e.target.value), maxVal - 1)
        setMinVal(value)
        onChange(value, maxVal)
    }

    const handleMaxChange = (e) => {
        const value = Math.max(Number(e.target.value), minVal + 1)
        setMaxVal(value)
        onChange(minVal, value)
    }

    return (
        <div className="relative w-full h-8 flex items-center">
            <input 
                type="range" min="0" max="100" value={minVal} onChange={handleMinChange}
                className="absolute z-20 h-0 w-full opacity-0 cursor-pointer pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4"
            />
            <input 
                type="range" min="0" max="100" value={maxVal} onChange={handleMaxChange}
                className="absolute z-20 h-0 w-full opacity-0 cursor-pointer pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4"
            />
            <div className="relative w-full h-1.5 bg-slate-700 rounded-full z-0">
                <div 
                    className="absolute h-full bg-philo-primary rounded-full z-10"
                    style={{ left: `${getPercent(minVal)}%`, width: `${getPercent(maxVal) - getPercent(minVal)}%` }}
                />
                <div className="absolute w-4 h-4 bg-white border-2 border-philo-primary rounded-full -top-1.5 -ml-2 z-10 shadow cursor-grab pointer-events-none" style={{ left: `${getPercent(minVal)}%` }} />
                <div className="absolute w-4 h-4 bg-white border-2 border-philo-primary rounded-full -top-1.5 -ml-2 z-10 shadow cursor-grab pointer-events-none" style={{ left: `${getPercent(maxVal)}%` }} />
            </div>
            <div className="absolute -bottom-5 left-0 text-[10px] text-gray-400 font-bold">{minVal}%</div>
            <div className="absolute -bottom-5 right-0 text-[10px] text-gray-400 font-bold">{maxVal}%</div>
        </div>
    )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, profile: myProfile, loading: authLoading } = useAuth()
  
  const [matches, setMatches] = useState([])
  const [loadingMatches, setLoadingMatches] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)
  const [unreadCounts, setUnreadCounts] = useState({})
  
  const [showFriends, setShowFriends] = useState(true)
  const [matchRange, setMatchRange] = useState([0, 100])
  const [isOppositeMode, setIsOppositeMode] = useState(false)
  
  const myProfileRef = useRef(null)
  useEffect(() => { myProfileRef.current = myProfile }, [myProfile])

  // --- CHARGEMENT ---
  useEffect(() => {
    if (authLoading) return
    if (!user || !myProfile) { setLoadingMatches(false); return }

    const loadMatches = async () => {
      const safetyTimer = setTimeout(() => setLoadingMatches(false), 5000)
      try {
        if (myProfile.embedding) {
          const { data: matchedUsers } = await supabase.rpc('match_students', {
            query_embedding: myProfile.embedding,
            match_threshold: 0.01, 
            match_count: 50 
          })

          if (matchedUsers) {
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
            setMatches(matchesWithStatus)
          }
        }
      } catch (error) { console.error(error) } 
      finally { clearTimeout(safetyTimer); setLoadingMatches(false); }
    }
    loadMatches()
  }, [user, myProfile, authLoading])

  // --- REALTIME ---
  useEffect(() => {
    if (!user) return
    const channel = supabase.channel('dashboard-room')
    const handleConnectionChange = (payload) => {
        setMatches(curr => curr.map(m => {
            const isRelevant = (payload.new && (payload.new.sender_id === m.id || payload.new.receiver_id === m.id)) ||
                               (payload.old && (payload.old.sender_id === m.id || payload.old.receiver_id === m.id))
            if (isRelevant) return { ...m, connection: payload.eventType === 'DELETE' ? null : payload.new }
            return m
        }))
    }
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections', filter: `sender_id=eq.${user.id}` }, handleConnectionChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections', filter: `receiver_id=eq.${user.id}` }, handleConnectionChange)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  const handleLogout = async () => await supabase.auth.signOut() 

  // --- LOGIQUE DE FILTRAGE (MISE À JOUR) ---
  const processedMatches = useMemo(() => {
    let filtered = matches

    // 1. Toggle "Mes Liens" (ON/OFF)
    if (!showFriends) {
        // Si décoché, on retire purement et simplement les amis
        filtered = filtered.filter(m => m.connection?.status !== 'accepted')
    }

    // 2. Filtre Intervalle (Sauf pour les amis)
    const [min, max] = matchRange
    filtered = filtered.filter(m => {
        const isFriend = m.connection?.status === 'accepted'
        
        // MODIFICATION ICI :
        // Si c'est un ami (et qu'il n'a pas été retiré par l'étape 1), on le garde TOUJOURS.
        // L'intervalle ne s'applique que si ce n'est PAS un ami.
        if (isFriend) return true 
        
        const pct = m.similarity * 100
        return pct >= min && pct <= max
    })

    // 3. Tri
    filtered.sort((a, b) => isOppositeMode ? a.similarity - b.similarity : b.similarity - a.similarity)

    // 4. Zonage orbital
    const categorized = { orbit1: [], orbit2: [], orbit3: [], orbit4: [] }
    
    filtered.forEach(m => {
        const percent = m.similarity * 100
        const isFriend = m.connection?.status === 'accepted'

        if (isFriend) {
            categorized.orbit1.push(m)
        } else if (percent >= 90) {
            categorized.orbit2.push(m)
        } else if (percent >= 70) {
            categorized.orbit3.push(m)
        } else {
            categorized.orbit4.push(m)
        }
    })

    return categorized
  }, [matches, showFriends, matchRange, isOppositeMode])

  if (authLoading || loadingMatches) return <div className="min-h-screen bg-philo-dark flex items-center justify-center text-white">Chargement de la galaxie...</div>

  return (
    <div className="min-h-screen bg-philo-dark text-white p-4 relative overflow-hidden flex flex-col">
      
      {/* NAVBAR */}
      <div className="flex justify-between items-center z-30 w-full max-w-6xl mx-auto py-4 px-4 relative">
        <h1 className="text-2xl font-bold">Philotès<span className="text-philo-primary">.</span></h1>
        <div className="flex gap-2 items-center">
          <button onClick={() => navigate('/profile')} className="rounded-full hover:opacity-80 transition overflow-hidden border border-white/20 w-10 h-10">
             {myProfile?.avatar_prive ? <img src={myProfile.avatar_prive} className="w-full h-full object-cover" /> : 
              myProfile?.avatar_public ? <img src={`/avatars/${myProfile.avatar_public}`} className="w-full h-full object-cover" /> : 
              <UserCircle size={38} className="text-gray-300 w-full h-full p-1" />}
          </button>
          <button onClick={handleLogout} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition"><LogOut size={20} /></button>
        </div>
      </div>

      <div className="flex-1 flex relative">
          
          {/* --- SIDEBAR FILTRES --- */}
          <div className="absolute left-0 top-10 z-30 flex flex-col gap-6 p-4 w-64">
              
              {/* Toggle Amis */}
              <div className="bg-slate-900/60 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                  <label className="flex items-center gap-3 cursor-pointer group select-none">
                      <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition ${showFriends ? 'bg-philo-primary border-philo-primary' : 'border-gray-500 group-hover:border-white'}`}>
                          {showFriends && <Users size={14} className="text-white" />}
                      </div>
                      <input type="checkbox" className="hidden" checked={showFriends} onChange={e => setShowFriends(e.target.checked)} />
                      <span className="text-sm font-bold text-gray-300 group-hover:text-white">Mes liens confirmés</span>
                  </label>
              </div>

              {/* Slider Intervalle */}
              <div className="bg-slate-900/60 backdrop-blur-md p-4 rounded-2xl border border-white/10 pb-8">
                  <div className="flex justify-between mb-4">
                      <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2"><GitCommitVertical size={12}/> Intervalle</span>
                  </div>
                  <div className="px-2">
                     <DualRangeSlider min={0} max={100} onChange={(min, max) => setMatchRange([min, max])} />
                  </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                  <button 
                    onClick={() => setIsOppositeMode(!isOppositeMode)}
                    className={`flex-1 py-3 rounded-xl border flex flex-col items-center gap-1 transition ${isOppositeMode ? 'bg-pink-500/20 border-pink-500 text-pink-300' : 'bg-slate-900/60 border-white/10 text-gray-400 hover:bg-slate-800'}`}
                  >
                      <Magnet size={18} className={isOppositeMode ? "rotate-180" : ""} />
                      <span className="text-[10px] font-bold uppercase text-center leading-tight">Opposés<br/>s'attirent</span>
                  </button>

                  <button 
                    onClick={() => { setShowFriends(true); setMatchRange([0, 100]); setIsOppositeMode(false); }}
                    className="px-3 rounded-xl bg-slate-900/60 border border-white/10 text-gray-400 hover:text-white hover:bg-slate-800 transition"
                    title="Réinitialiser"
                  >
                      <RotateCcw size={18} />
                  </button>
              </div>
          </div>

          {/* --- LA GALAXIE --- */}
          <div className="flex-1 relative flex items-center justify-center overflow-visible min-h-[600px]">
             
             {/* Soleil (Moi) */}
             <motion.div 
                animate={{ y: [0, -15, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute z-20 w-28 h-28 rounded-full bg-gradient-to-br from-philo-primary to-philo-secondary p-1 shadow-[0_0_50px_rgba(139,92,246,0.5)]"
             >
                <div className="w-full h-full rounded-full overflow-hidden border-4 border-slate-900 bg-slate-900">
                    {myProfile?.avatar_prive ? <img src={myProfile.avatar_prive} className="w-full h-full object-cover" /> : 
                     myProfile?.avatar_public ? <img src={`/avatars/${myProfile.avatar_public}`} className="w-full h-full object-cover" /> : null}
                </div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/60 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm border border-white/10">
                    Moi
                </div>
             </motion.div>

             {/* ORBITES */}
             {processedMatches.orbit1.length > 0 && (
                 <OrbitalRing radius={140} duration={30}>
                     {processedMatches.orbit1.map((match, i) => (
                         <Planet key={match.id} radius={140} angle={(i / processedMatches.orbit1.length) * 2 * Math.PI} duration={30}>
                             <MatchNode match={match} onClick={setSelectedUser} />
                         </Planet>
                     ))}
                 </OrbitalRing>
             )}

             {processedMatches.orbit2.length > 0 && (
                 <OrbitalRing radius={220} duration={50} reverse>
                     {processedMatches.orbit2.map((match, i) => (
                         <Planet key={match.id} radius={220} angle={(i / processedMatches.orbit2.length) * 2 * Math.PI} duration={50} reverse>
                             <MatchNode match={match} onClick={setSelectedUser} />
                         </Planet>
                     ))}
                 </OrbitalRing>
             )}

             {processedMatches.orbit3.length > 0 && (
                 <OrbitalRing radius={300} duration={80}>
                     {processedMatches.orbit3.map((match, i) => (
                         <Planet key={match.id} radius={300} angle={(i / processedMatches.orbit3.length) * 2 * Math.PI} duration={80}>
                             <MatchNode match={match} onClick={setSelectedUser} />
                         </Planet>
                     ))}
                 </OrbitalRing>
             )}

              {processedMatches.orbit4.length > 0 && (
                 <OrbitalRing radius={400} duration={120} reverse>
                     {processedMatches.orbit4.map((match, i) => (
                         <Planet key={match.id} radius={400} angle={(i / processedMatches.orbit4.length) * 2 * Math.PI} duration={120} reverse>
                             <MatchNode match={match} onClick={setSelectedUser} />
                         </Planet>
                     ))}
                 </OrbitalRing>
             )}
          </div>
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
              onChatStatusChange={() => {}} 
            />
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function MatchNode({ match, onClick }) {
    const isFriend = match.connection?.status === 'accepted'
    let borderColor = "border-white/20"
    let shadow = ""
    
    if (isFriend) {
        borderColor = "border-philo-primary"
        shadow = "shadow-[0_0_15px_rgba(139,92,246,0.4)]"
    } else if (match.similarity >= 0.9) {
        borderColor = "border-green-400/50"
    }

    return (
        <div onClick={() => onClick(match)} className="relative group cursor-pointer">
            <div className={`w-16 h-16 rounded-full bg-slate-900 border-2 ${borderColor} ${shadow} overflow-hidden hover:scale-110 transition duration-300 relative`}>
                {isFriend && match.avatar_prive ? <img src={match.avatar_prive} className="w-full h-full object-cover"/> : 
                 match.avatar_public ? <img src={`/avatars/${match.avatar_public}`} className="w-full h-full object-cover"/> : 
                 <User className="text-gray-500 m-auto mt-4"/>}
                 <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] font-bold text-center py-0.5 text-white">
                     {Math.round(match.similarity * 100)}%
                 </div>
            </div>
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition bg-white text-black text-xs font-bold px-2 py-1 rounded-md whitespace-nowrap pointer-events-none z-50">
                {match.pseudo}
            </div>
        </div>
    )
}