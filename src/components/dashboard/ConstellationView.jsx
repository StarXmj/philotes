// src/components/dashboard/ConstellationView.jsx
import { useMemo, useRef, useState, memo } from 'react'
import { motion } from 'framer-motion'
import { User, ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react'

// --- COMPOSANTS OPTIMISÉS ---

const OrbitalRing = ({ radius, duration, children, reverse = false }) => (
    <div className="absolute flex items-center justify-center pointer-events-none" style={{ width: radius * 2, height: radius * 2 }}>
       <div className="absolute inset-0 rounded-full border border-white/5" />
       <div 
         className="absolute inset-0 w-full h-full gpu-accelerated"
         style={{ 
             animation: `${reverse ? 'orbit-counter-spin' : 'orbit-spin'} ${duration}s linear infinite` 
         }}
       >
          {children}
       </div>
    </div>
)

const Planet = ({ angle, radius, duration, reverse = false, children }) => {
    const x = Math.cos(angle) * radius + radius
    const y = Math.sin(angle) * radius + radius
    
    return (
        <div className="absolute flex items-center justify-center pointer-events-auto" style={{ left: x, top: y, width: 0, height: 0 }}>
            <div 
                className="gpu-accelerated"
                style={{ 
                    animation: `${reverse ? 'orbit-spin' : 'orbit-counter-spin'} ${duration}s linear infinite` 
                }}
            >
                {children}
            </div>
        </div>
    )
}

const MatchNode = memo(({ match, onClick, unreadCount, myId }) => {
    const isFriend = match.connection?.status === 'accepted'
    const isPendingRequest = match.connection?.status === 'pending' && match.connection?.receiver_id === myId
    const hasUnreadMessages = unreadCount > 0
    const pct = Math.round(match.score_global || 0)
    
    let borderColor = "border-white/20"
    let shadowClass = ""
    let animationClass = ""
    
    if (isPendingRequest) {
        borderColor = "border-green-400"; shadowClass = "shadow-[0_0_20px_rgba(74,222,128,0.8)]"; animationClass = "animate-pulse" 
    } else if (hasUnreadMessages) {
        borderColor = "border-white"; shadowClass = "shadow-[0_0_20px_rgba(255,255,255,0.6)]"; animationClass = "animate-pulse"
    } else if (isFriend) { 
        borderColor = "border-philo-primary"; shadowClass = "shadow-[0_0_15px_rgba(139,92,246,0.4)]"
    } else if (pct >= 85) { 
        borderColor = "border-green-400"; shadowClass = "shadow-[0_0_10px_rgba(74,222,128,0.3)]"
    } else if (pct >= 60) { borderColor = "border-teal-400/80" } 
    else if (pct >= 45) { borderColor = "border-blue-400/60" } 
    else { borderColor = "border-indigo-400/40" }             
    
    let bgGradient = pct >= 85 ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 
                     pct >= 60 ? 'bg-gradient-to-r from-teal-500 to-cyan-600' : 'bg-black/70'

    return (
        <div onClick={(e) => { e.stopPropagation(); onClick(match); }} className="relative group cursor-pointer transition-transform duration-300 hover:scale-125 z-10">
            <div className={`w-8 h-8 md:w-12 md:h-12 rounded-full bg-slate-900 border ${borderColor} ${shadowClass} ${animationClass} overflow-hidden relative transition-all duration-300`}>
                {isFriend && match.avatar_prive ? <img src={match.avatar_prive} className="w-full h-full object-cover" loading="lazy" draggable={false}/> : 
                 match.avatar_public ? <img src={`/avatars/${match.avatar_public}`} className="w-full h-full object-cover" loading="lazy" draggable={false}/> : 
                 <User className="text-gray-500 m-auto mt-2 w-4 h-4"/>}
            </div>
            {isPendingRequest && (<div className="absolute -top-3 -right-3 bg-green-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-xl z-50 animate-bounce border border-white/20">NEW</div>)}
            {hasUnreadMessages && !isPendingRequest && (<div className="absolute -top-3 -right-3 bg-red-500 text-white text-[10px] font-bold min-w-[20px] h-5 flex items-center justify-center rounded-full shadow-xl z-50 border-2 border-slate-900 animate-pulse px-1">{unreadCount}</div>)}
            {!isPendingRequest && !hasUnreadMessages && pct > 40 && (<div className={`absolute -bottom-1 inset-x-0 text-[7px] font-bold text-center py-0.5 text-white rounded-full ${bgGradient}`}>{pct}%</div>)}
        </div>
    )
})

// --- MAIN VIEW COMPONENT (SÉCURISÉ) ---
// Ajout de "matches = []" dans les props pour éviter le crash "forEach of undefined"
const ConstellationView = ({ matches = [], myProfile, onSelectUser, unreadCounts = {}, myId }) => {
  const containerRef = useRef(null)
  const [zoom, setZoom] = useState(0.8) 
  const MIN_ZOOM = 0.2
  const MAX_ZOOM = 3
  const touchStartDist = useRef(null)

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
      touchStartDist.current = d
    }
  }
  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && touchStartDist.current !== null) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
      const delta = d - touchStartDist.current
      setZoom(prev => Math.min(Math.max(MIN_ZOOM, prev + delta * 0.005), MAX_ZOOM))
      touchStartDist.current = d
    }
  }
  const handleTouchEnd = () => { touchStartDist.current = null }
  const handleWheel = (e) => { setZoom(prev => Math.min(Math.max(MIN_ZOOM, prev + (e.deltaY * -0.001)), MAX_ZOOM)) }

  // --- LOGIQUE ORBITES SÉCURISÉE ---
  const orbits = useMemo(() => {
    const categorized = { orbit1: [], orbit2: [], orbit3: [], orbit4: [], orbit5: [] }
    
    // Sécurité critique : On vérifie que matches est bien un tableau
    if (!matches || !Array.isArray(matches)) return categorized;

    matches.forEach(m => {
        const globalScore = m.score_global || 0
        const isFriend = m.connection?.status === 'accepted'
        
        if (isFriend) categorized.orbit1.push(m) 
        else if (globalScore >= 85) categorized.orbit2.push(m)
        else if (globalScore >= 60) categorized.orbit3.push(m)
        else if (globalScore >= 45) categorized.orbit4.push(m)
        else categorized.orbit5.push(m)
    })
    return categorized
  }, [matches])

  return (
    <div ref={containerRef} className="relative w-full h-full bg-slate-900/40 overflow-hidden cursor-grab active:cursor-grabbing group flex items-center justify-center touch-none" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        <div className="absolute bottom-6 right-6 z-40 flex flex-col gap-2 bg-slate-800/80 backdrop-blur-md p-2 rounded-xl border border-white/10 shadow-2xl">
            <button onClick={() => setZoom(Math.min(zoom + 0.2, MAX_ZOOM))} className="p-2 hover:bg-white/10 rounded-lg text-white transition"><ZoomIn size={20}/></button>
            <button onClick={() => setZoom(1)} className="p-2 hover:bg-white/10 rounded-lg text-white transition" title="Recentrer"><RotateCcw size={20}/></button>
            <button onClick={() => setZoom(Math.max(zoom - 0.2, MIN_ZOOM))} className="p-2 hover:bg-white/10 rounded-lg text-white transition"><ZoomOut size={20}/></button>
        </div>
        <div className="absolute top-4 left-4 z-40 px-3 py-1 bg-black/40 backdrop-blur-sm rounded-full border border-white/5 text-[10px] text-gray-400 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2"><Move size={12}/> Glisser pour explorer • Pincer pour zoomer</div>

        <motion.div drag dragConstraints={containerRef} dragElastic={0.2} whileTap={{ cursor: "grabbing" }} onWheel={handleWheel} animate={{ scale: zoom }} transition={{ type: "spring", stiffness: 300, damping: 30 }} className="flex items-center justify-center origin-center will-change-transform">
            <div className="relative w-[2400px] h-[2400px] flex items-center justify-center flex-shrink-0">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)', backgroundSize: '100px 100px' }} />
                <div className="absolute z-20 w-24 h-24 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-philo-primary to-philo-secondary p-1 shadow-[0_0_50px_rgba(139,92,246,0.6)] animate-pulse">
                    <div className="w-full h-full rounded-full overflow-hidden border-4 border-slate-900 bg-slate-900">
                        {myProfile?.avatar_prive ? <img src={myProfile.avatar_prive} className="w-full h-full object-cover pointer-events-none" /> : myProfile?.avatar_public ? <img src={`/avatars/${myProfile.avatar_public}`} className="w-full h-full object-cover pointer-events-none" /> : null}
                    </div>
                </div>

                {orbits.orbit1.length > 0 && <OrbitalRing radius={200} duration={60}>{orbits.orbit1.map((m, i) => <Planet key={m.id} radius={200} angle={(i/orbits.orbit1.length)*2*Math.PI} duration={60}><MatchNode match={m} onClick={onSelectUser} unreadCount={unreadCounts[m.id] || 0} myId={myId} /></Planet>)}</OrbitalRing>}
                {orbits.orbit2.length > 0 && <OrbitalRing radius={350} duration={90} reverse>{orbits.orbit2.map((m, i) => <Planet key={m.id} radius={350} angle={(i/orbits.orbit2.length)*2*Math.PI} duration={90} reverse><MatchNode match={m} onClick={onSelectUser} unreadCount={unreadCounts[m.id] || 0} myId={myId} /></Planet>)}</OrbitalRing>}
                {orbits.orbit3.length > 0 && <OrbitalRing radius={500} duration={120}>{orbits.orbit3.map((m, i) => <Planet key={m.id} radius={500} angle={(i/orbits.orbit3.length)*2*Math.PI} duration={120}><MatchNode match={m} onClick={onSelectUser} unreadCount={unreadCounts[m.id] || 0} myId={myId} /></Planet>)}</OrbitalRing>}
                {orbits.orbit4.length > 0 && <OrbitalRing radius={650} duration={150} reverse>{orbits.orbit4.map((m, i) => <Planet key={m.id} radius={650} angle={(i/orbits.orbit4.length)*2*Math.PI} duration={150} reverse><MatchNode match={m} onClick={onSelectUser} unreadCount={unreadCounts[m.id] || 0} myId={myId} /></Planet>)}</OrbitalRing>}
                {orbits.orbit5.length > 0 && <OrbitalRing radius={800} duration={180}>{orbits.orbit5.map((m, i) => <Planet key={m.id} radius={800} angle={(i/orbits.orbit5.length)*2*Math.PI} duration={180}><MatchNode match={m} onClick={onSelectUser} unreadCount={unreadCounts[m.id] || 0} myId={myId} /></Planet>)}</OrbitalRing>}
            </div>
        </motion.div>
    </div>
  )
}
export default memo(ConstellationView)