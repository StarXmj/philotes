// src/components/dashboard/ConstellationView.jsx
import { useMemo, useRef, useState, memo } from 'react'
import { motion } from 'framer-motion'
import { User, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

const OrbitalRing = ({ radius, duration, children, reverse = false }) => (
    <div className="absolute flex items-center justify-center pointer-events-none" style={{ width: radius * 2, height: radius * 2 }}>
       <div className="absolute inset-0 rounded-full border border-white/5" />
       <div className="absolute inset-0 w-full h-full gpu-accelerated" style={{ animation: `${reverse ? 'orbit-counter-spin' : 'orbit-spin'} ${duration}s linear infinite` }}>{children}</div>
    </div>
)
const Planet = ({ angle, radius, duration, reverse = false, children }) => {
    const x = Math.cos(angle) * radius + radius; const y = Math.sin(angle) * radius + radius
    return (
        <div className="absolute flex items-center justify-center pointer-events-auto" style={{ left: x, top: y, width: 0, height: 0 }}>
            <div className="gpu-accelerated" style={{ animation: `${reverse ? 'orbit-spin' : 'orbit-counter-spin'} ${duration}s linear infinite` }}>{children}</div>
        </div>
    )
}

const MatchNode = memo(({ match, onClick, unreadCount, myId, scoreMode }) => {
    const isFriend = match.connection?.status === 'accepted'
    const isPendingRequest = match.connection?.status === 'pending' && match.connection?.receiver_id === myId
    const hasUnreadMessages = unreadCount > 0
    let rawScore = scoreMode === 'VIBES' ? (match.personality_score || 0) : (match.profile_score || 0)
    if (rawScore <= 1) rawScore *= 100
    const pct = Math.round(rawScore)
    let borderColor = "border-white/20"; let shadowClass = ""; let animationClass = ""
    if (isPendingRequest) { borderColor = "border-green-400"; shadowClass = "shadow-[0_0_20px_rgba(74,222,128,0.8)]"; animationClass = "animate-pulse" } 
    else if (hasUnreadMessages) { borderColor = "border-white"; shadowClass = "shadow-[0_0_20px_rgba(255,255,255,0.6)]"; animationClass = "animate-pulse" }
    else if (isFriend) { borderColor = "border-philo-primary"; shadowClass = "shadow-[0_0_15px_rgba(139,92,246,0.4)]" } 
    else if (pct >= 85) { borderColor = "border-green-400"; shadowClass = "shadow-[0_0_10px_rgba(74,222,128,0.3)]" }
    else if (pct >= 60) borderColor = "border-teal-400/80" 
    else if (pct >= 45) borderColor = "border-blue-400/60" 
    else borderColor = "border-indigo-400/40"
    let bgGradient = pct >= 85 ? 'bg-gradient-to-r from-green-500 to-emerald-600' : pct >= 60 ? 'bg-gradient-to-r from-teal-500 to-cyan-600' : 'bg-black/70'

    return (
        <div onClick={(e) => { e.stopPropagation(); onClick(match); }} className="relative group cursor-pointer transition-transform duration-300 hover:scale-125 z-10">
            <div className={`w-8 h-8 md:w-12 md:h-12 rounded-full bg-slate-900 border ${borderColor} ${shadowClass} ${animationClass} overflow-hidden relative transition-all duration-300`}>
                {match.avatar_public ? <img src={`/avatars/${match.avatar_public}`} className="w-full h-full object-cover"/> : <User className="text-gray-500 m-auto mt-2 w-4 h-4"/>}
            </div>
            {isPendingRequest && (<div className="absolute -top-3 -right-3 bg-green-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-xl z-50 animate-bounce border border-white/20">NEW</div>)}
            {hasUnreadMessages && !isPendingRequest && (<div className="absolute -top-3 -right-3 bg-red-500 text-white text-[10px] font-bold min-w-[20px] h-5 flex items-center justify-center rounded-full shadow-xl z-50 border-2 border-slate-900 animate-pulse px-1">{unreadCount}</div>)}
            {!isPendingRequest && !hasUnreadMessages && pct > 40 && (<div className={`absolute -bottom-1 inset-x-0 text-[7px] font-bold text-center py-0.5 text-white rounded-full ${bgGradient}`}>{pct}%</div>)}
        </div>
    )
})

const ConstellationView = ({ matches = [], myProfile, onSelectUser, unreadCounts = {}, myId, scoreMode }) => {
  const containerRef = useRef(null)
  
  // États de navigation
  const [zoom, setZoom] = useState(0.6)
  const [isDraggingEnabled, setIsDraggingEnabled] = useState(true)
  const [origin, setOrigin] = useState({ x: 0.5, y: 0.5 }) // Origine du zoom (0 à 1)
  
  const touchStartDist = useRef(null)

  // Gestion Tactile avec Origine Dynamique
  const handleTouchStart = (e) => { 
      if (e.touches.length === 2 && containerRef.current) {
          setIsDraggingEnabled(false)
          
          // Calcul de la distance initiale
          touchStartDist.current = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX, 
              e.touches[0].clientY - e.touches[1].clientY
          ) 

          // Calcul du centre du pincement
          const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2
          const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2
          
          // Conversion en pourcentage par rapport au conteneur
          const rect = containerRef.current.getBoundingClientRect()
          const originX = (centerX - rect.left) / rect.width
          const originY = (centerY - rect.top) / rect.height
          
          setOrigin({ x: originX, y: originY })
      }
  }

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && touchStartDist.current !== null) {
      const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX, 
          e.touches[0].clientY - e.touches[1].clientY
      )
      const delta = (d - touchStartDist.current) * 0.003
      setZoom(prev => Math.min(Math.max(0.2, prev + delta), 3))
      touchStartDist.current = d
    }
  }

  const handleTouchEnd = () => { 
      touchStartDist.current = null 
      setIsDraggingEnabled(true) 
  }

  const handleWheel = (e) => { setZoom(prev => Math.min(Math.max(0.2, prev + (e.deltaY * -0.001)), 3)) }

  const orbits = useMemo(() => {
    const cat = { orbit1: [], orbit2: [], orbit3: [], orbit4: [], orbit5: [] }
    if (!matches || !Array.isArray(matches)) return cat;
    matches.forEach(m => {
        let rawScore = scoreMode === 'VIBES' ? (m.personality_score || 0) : (m.profile_score || 0)
        if (rawScore <= 1) rawScore *= 100 
        if (m.connection?.status === 'accepted') cat.orbit1.push(m) 
        else if (rawScore >= 85) cat.orbit2.push(m)
        else if (rawScore >= 60) cat.orbit3.push(m)
        else if (rawScore >= 45) cat.orbit4.push(m)
        else cat.orbit5.push(m)
    })
    return cat
  }, [matches, scoreMode])

  const handleReset = () => {
      setZoom(0.6)
      setOrigin({ x: 0.5, y: 0.5 }) // Reset aussi l'origine au centre
  }

  return (
    <div 
        ref={containerRef} 
        className="relative w-full h-full bg-slate-900/40 overflow-hidden cursor-grab active:cursor-grabbing group flex items-center justify-center touch-none" 
        onTouchStart={handleTouchStart} 
        onTouchMove={handleTouchMove} 
        onTouchEnd={handleTouchEnd}
    >
        <div className="absolute bottom-20 left-6 z-40 flex flex-col gap-3">
            <button onClick={() => setZoom(prev => Math.min(prev + 0.2, 3))} className="w-12 h-12 flex items-center justify-center bg-slate-800/90 backdrop-blur-md rounded-full border border-white/20 shadow-xl active:scale-95 transition-transform text-white"><ZoomIn size={24}/></button>
            <button onClick={handleReset} className="w-12 h-12 flex items-center justify-center bg-slate-800/90 backdrop-blur-md rounded-full border border-white/20 shadow-xl active:scale-95 transition-transform text-white"><RotateCcw size={24}/></button>
            <button onClick={() => setZoom(prev => Math.max(prev - 0.2, 0.2))} className="w-12 h-12 flex items-center justify-center bg-slate-800/90 backdrop-blur-md rounded-full border border-white/20 shadow-xl active:scale-95 transition-transform text-white"><ZoomOut size={24}/></button>
        </div>

        {/* APPLICATION DU TRANSFORM ORIGIN DYNAMIQUE */}
        <motion.div 
            drag={isDraggingEnabled} 
            dragElastic={0.1} 
            dragMomentum={false} 
            whileTap={{ cursor: "grabbing" }} 
            onWheel={handleWheel} 
            animate={{ 
                scale: zoom,
                // On anime l'origine pour que le changement ne soit pas brutal
                originX: origin.x,
                originY: origin.y
            }} 
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex items-center justify-center"
            // Important : On retire origin-center de la classe CSS pour laisser motion gérer l'origine
        >
            <div className="relative w-[3000px] h-[3000px] flex items-center justify-center flex-shrink-0">
                <div className="absolute z-20 w-24 h-24 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-philo-primary to-philo-secondary p-1 animate-pulse"><div className="w-full h-full rounded-full overflow-hidden border-4 border-slate-900 bg-slate-900">{myProfile?.avatar_public && <img src={`/avatars/${myProfile.avatar_public}`} className="w-full h-full object-cover"/>}</div></div>
                {orbits.orbit1.length > 0 && <OrbitalRing radius={250} duration={60}>{orbits.orbit1.map((m, i) => <Planet key={m.id} radius={250} angle={(i/orbits.orbit1.length)*2*Math.PI} duration={60}><MatchNode match={m} onClick={onSelectUser} unreadCount={unreadCounts[m.id] || 0} myId={myId} scoreMode={scoreMode} /></Planet>)}</OrbitalRing>}
                {orbits.orbit2.length > 0 && <OrbitalRing radius={450} duration={90} reverse>{orbits.orbit2.map((m, i) => <Planet key={m.id} radius={450} angle={(i/orbits.orbit2.length)*2*Math.PI} duration={90} reverse><MatchNode match={m} onClick={onSelectUser} unreadCount={unreadCounts[m.id] || 0} myId={myId} scoreMode={scoreMode} /></Planet>)}</OrbitalRing>}
                {orbits.orbit3.length > 0 && <OrbitalRing radius={650} duration={120}>{orbits.orbit3.map((m, i) => <Planet key={m.id} radius={650} angle={(i/orbits.orbit3.length)*2*Math.PI} duration={120}><MatchNode match={m} onClick={onSelectUser} unreadCount={unreadCounts[m.id] || 0} myId={myId} scoreMode={scoreMode} /></Planet>)}</OrbitalRing>}
                {orbits.orbit4.length > 0 && <OrbitalRing radius={850} duration={150} reverse>{orbits.orbit4.map((m, i) => <Planet key={m.id} radius={850} angle={(i/orbits.orbit4.length)*2*Math.PI} duration={150} reverse><MatchNode match={m} onClick={onSelectUser} unreadCount={unreadCounts[m.id] || 0} myId={myId} scoreMode={scoreMode} /></Planet>)}</OrbitalRing>}
                {orbits.orbit5.length > 0 && <OrbitalRing radius={1100} duration={200}>{orbits.orbit5.map((m, i) => <Planet key={m.id} radius={1100} angle={(i/orbits.orbit5.length)*2*Math.PI} duration={200}><MatchNode match={m} onClick={onSelectUser} unreadCount={unreadCounts[m.id] || 0} myId={myId} scoreMode={scoreMode} /></Planet>)}</OrbitalRing>}
            </div>
        </motion.div>
    </div>
  )
}
export default memo(ConstellationView)