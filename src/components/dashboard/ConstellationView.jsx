import { useMemo, useRef, useState, memo } from 'react'
import { motion } from 'framer-motion'
import { User, ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react'

// --- COMPOSANTS OPTIMISÉS (CSS vs JS) ---

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

const MatchNode = memo(({ match, onClick }) => {
    const isFriend = match.connection?.status === 'accepted'
    const pct = Math.round(match.score * 100)
    
    // Couleurs distinctes pour bien visualiser les tranches de 15%
    let borderColor = "border-white/20"
    let shadow = ""
    
    if (isFriend) { 
        borderColor = "border-philo-primary"
        shadow = "shadow-[0_0_15px_rgba(139,92,246,0.4)]"
    } 
    else if (pct >= 85) { borderColor = "border-green-400"; shadow = "shadow-[0_0_10px_rgba(74,222,128,0.3)]"; }
    else if (pct >= 70) { borderColor = "border-teal-400/80"; }
    else if (pct >= 55) { borderColor = "border-blue-400/60"; }
    else if (pct >= 40) { borderColor = "border-indigo-400/40"; }
    
    let bgGradient = pct >= 85 ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 
                     pct >= 70 ? 'bg-gradient-to-r from-teal-500 to-cyan-600' :
                     'bg-black/70'

    return (
        <div onClick={(e) => { e.stopPropagation(); onClick(match); }} className="relative group cursor-pointer transition-transform duration-300 hover:scale-125 z-10">
            <div className={`w-8 h-8 md:w-12 md:h-12 rounded-full bg-slate-900 border ${borderColor} ${shadow} overflow-hidden relative`}>
                {isFriend && match.avatar_prive ? <img src={match.avatar_prive} className="w-full h-full object-cover" loading="lazy" draggable={false}/> : 
                 match.avatar_public ? <img src={`/avatars/${match.avatar_public}`} className="w-full h-full object-cover" loading="lazy" draggable={false}/> : 
                 <User className="text-gray-500 m-auto mt-2 w-4 h-4"/>}
            </div>
            {pct > 40 && (
                <div className={`absolute -bottom-1 inset-x-0 text-[7px] font-bold text-center py-0.5 text-white rounded-full ${bgGradient}`}>
                    {pct}%
                </div>
            )}
        </div>
    )
}, (prev, next) => prev.match.id === next.match.id && prev.match.score === next.match.score)

// --- MAIN VIEW COMPONENT ---
const ConstellationView = ({ matches, myProfile, onSelectUser }) => {
  const containerRef = useRef(null)
  const [zoom, setZoom] = useState(0.8) 
  const MIN_ZOOM = 0.2
  const MAX_ZOOM = 3

  const handleWheel = (e) => {
    const delta = e.deltaY * -0.001
    setZoom(prev => Math.min(Math.max(MIN_ZOOM, prev + delta), MAX_ZOOM))
  }

  // LOGIQUE DE RÉPARTITION EN TRANCHES DE 15%
  const orbits = useMemo(() => {
    const categorized = { orbit1: [], orbit2: [], orbit3: [], orbit4: [], orbit5: [], orbit6: [] }
    
    matches.forEach(m => {
        const percent = m.score * 100
        const isFriend = m.connection?.status === 'accepted'

        if (isFriend) {
            categorized.orbit1.push(m) // AMIS
        } 
        else if (percent >= 85) {
            categorized.orbit2.push(m) // 85-100%
        } 
        else if (percent >= 70) {
            categorized.orbit3.push(m) // 70-85% (Nouveau palier)
        } 
        else if (percent >= 55) {
            categorized.orbit4.push(m) // 55-70% (Nouveau palier)
        }
        else if (percent >= 40) {
            categorized.orbit5.push(m) // 40-55% (Nouveau palier)
        }
        else {
            categorized.orbit6.push(m) // < 40%
        }
    })
    return categorized
  }, [matches])

  return (
    <div className="relative w-full h-full bg-slate-900/40 overflow-hidden cursor-grab active:cursor-grabbing group flex items-center justify-center" ref={containerRef}>
        
        {/* BOUTONS ZOOM */}
        <div className="absolute bottom-6 right-6 z-40 flex flex-col gap-2 bg-slate-800/80 backdrop-blur-md p-2 rounded-xl border border-white/10 shadow-2xl">
            <button onClick={() => setZoom(Math.min(zoom + 0.2, MAX_ZOOM))} className="p-2 hover:bg-white/10 rounded-lg text-white transition"><ZoomIn size={20}/></button>
            <button onClick={() => setZoom(1)} className="p-2 hover:bg-white/10 rounded-lg text-white transition" title="Recentrer"><RotateCcw size={20}/></button>
            <button onClick={() => setZoom(Math.max(zoom - 0.2, MIN_ZOOM))} className="p-2 hover:bg-white/10 rounded-lg text-white transition"><ZoomOut size={20}/></button>
        </div>

        <div className="absolute top-4 left-4 z-40 px-3 py-1 bg-black/40 backdrop-blur-sm rounded-full border border-white/5 text-[10px] text-gray-400 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
            <Move size={12}/> Glisser pour explorer • Molette pour zoomer ({matches.length} profils)
        </div>

        {/* DRAGGABLE WRAPPER */}
        <motion.div
            drag
            dragConstraints={containerRef}
            dragElastic={0.2}
            whileTap={{ cursor: "grabbing" }}
            onWheel={handleWheel}
            animate={{ scale: zoom }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex items-center justify-center origin-center will-change-transform"
        >
            <div className="relative w-[2400px] h-[2400px] flex items-center justify-center flex-shrink-0">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)', backgroundSize: '100px 100px' }} />

                {/* SOLEIL (MOI) */}
                <div className="absolute z-20 w-24 h-24 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-philo-primary to-philo-secondary p-1 shadow-[0_0_50px_rgba(139,92,246,0.6)] animate-pulse">
                    <div className="w-full h-full rounded-full overflow-hidden border-4 border-slate-900 bg-slate-900">
                        {myProfile?.avatar_prive ? <img src={myProfile.avatar_prive} className="w-full h-full object-cover pointer-events-none" /> : 
                            myProfile?.avatar_public ? <img src={`/avatars/${myProfile.avatar_public}`} className="w-full h-full object-cover pointer-events-none" /> : null}
                    </div>
                </div>

                {/* --- ORBITES (Rayons ajustés pour l'espacement) --- */}
                
                {/* 1. AMIS (Proches) */}
                {orbits.orbit1.length > 0 && <OrbitalRing radius={200} duration={60}>{orbits.orbit1.map((m, i) => <Planet key={m.id} radius={200} angle={(i/orbits.orbit1.length)*2*Math.PI} duration={60}><MatchNode match={m} onClick={onSelectUser}/></Planet>)}</OrbitalRing>}
                
                {/* 2. ELITE (85-100%) */}
                {orbits.orbit2.length > 0 && <OrbitalRing radius={350} duration={90} reverse>{orbits.orbit2.map((m, i) => <Planet key={m.id} radius={350} angle={(i/orbits.orbit2.length)*2*Math.PI} duration={90} reverse><MatchNode match={m} onClick={onSelectUser}/></Planet>)}</OrbitalRing>}
                
                {/* 3. TRÈS BONS (70-85%) */}
                {orbits.orbit3.length > 0 && <OrbitalRing radius={500} duration={120}>{orbits.orbit3.map((m, i) => <Planet key={m.id} radius={500} angle={(i/orbits.orbit3.length)*2*Math.PI} duration={120}><MatchNode match={m} onClick={onSelectUser}/></Planet>)}</OrbitalRing>}
                
                {/* 4. BONS (55-70%) */}
                {orbits.orbit4.length > 0 && <OrbitalRing radius={650} duration={150} reverse>{orbits.orbit4.map((m, i) => <Planet key={m.id} radius={650} angle={(i/orbits.orbit4.length)*2*Math.PI} duration={150} reverse><MatchNode match={m} onClick={onSelectUser}/></Planet>)}</OrbitalRing>}
                
                {/* 5. MOYENS (40-55%) */}
                {orbits.orbit5.length > 0 && <OrbitalRing radius={800} duration={180}>{orbits.orbit5.map((m, i) => <Planet key={m.id} radius={800} angle={(i/orbits.orbit5.length)*2*Math.PI} duration={180}><MatchNode match={m} onClick={onSelectUser}/></Planet>)}</OrbitalRing>}

                {/* 6. LOINTAINS (<40%) */}
                {orbits.orbit6.length > 0 && <OrbitalRing radius={950} duration={240} reverse>{orbits.orbit6.map((m, i) => <Planet key={m.id} radius={950} angle={(i/orbits.orbit6.length)*2*Math.PI} duration={240} reverse><MatchNode match={m} onClick={onSelectUser}/></Planet>)}</OrbitalRing>}

            </div>
        </motion.div>
    </div>
  )
}

export default memo(ConstellationView)