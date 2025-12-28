import { useState, useEffect, useCallback } from 'react'
import { Users, GitCommitVertical, RotateCcw, Magnet, UserCheck, Check } from 'lucide-react'

// --- COMPOSANT SLIDER DOUBLE ---
const DualRangeSlider = ({ min, max, values, onChange }) => {
    const [minVal, maxVal] = values
    const getPercent = useCallback((value) => Math.round(((value - min) / (max - min)) * 100), [min, max])

    const handleMinChange = (e) => {
        const value = Math.min(Number(e.target.value), maxVal - 1)
        onChange([value, maxVal])
    }

    const handleMaxChange = (e) => {
        const value = Math.max(Number(e.target.value), minVal + 1)
        onChange([minVal, value])
    }

    return (
        <div className="relative w-full h-8 flex items-center mt-2">
            <input type="range" min={min} max={max} value={minVal} onChange={handleMinChange} className="absolute z-20 h-0 w-full opacity-0 cursor-pointer pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4" />
            <input type="range" min={min} max={max} value={maxVal} onChange={handleMaxChange} className="absolute z-20 h-0 w-full opacity-0 cursor-pointer pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4" />
            
            <div className="relative w-full h-1.5 bg-slate-700 rounded-full z-0">
                <div className="absolute h-full bg-philo-primary rounded-full z-10" style={{ left: `${getPercent(minVal)}%`, width: `${getPercent(maxVal) - getPercent(minVal)}%` }} />
                <div className="absolute w-4 h-4 bg-white border-2 border-philo-primary rounded-full -top-1.5 -ml-2 z-10 shadow cursor-grab active:cursor-grabbing" style={{ left: `${getPercent(minVal)}%` }} />
                <div className="absolute w-4 h-4 bg-white border-2 border-philo-primary rounded-full -top-1.5 -ml-2 z-10 shadow cursor-grab active:cursor-grabbing" style={{ left: `${getPercent(maxVal)}%` }} />
            </div>
        </div>
    )
}

// --- FILTRES PRINCIPAUX ---
export default function DashboardFilters({ 
  showFriends, setShowFriends, 
  onlyFriends, setOnlyFriends, 
  matchRange, setMatchRange, 
  isOppositeMode, setIsOppositeMode, 
  setScoreMode // Gardé juste pour le Reset
}) {

  const handleMinInput = (e) => {
      let val = parseInt(e.target.value) || 0
      val = Math.min(Math.max(0, val), matchRange[1] - 1)
      setMatchRange([val, matchRange[1]])
  }

  const handleMaxInput = (e) => {
      let val = parseInt(e.target.value) || 100
      val = Math.max(Math.min(100, val), matchRange[0] + 1)
      setMatchRange([matchRange[0], val])
  }

  return (
    <div className="p-4 space-y-8 text-sm">
      
      {/* 1. FILTRES RELATIONS (Remonte en premier) */}
      <div className="space-y-4">
        <h3 className="text-gray-500 font-bold uppercase text-xs tracking-wider flex items-center gap-2">
          <Users size={12} /> Relations
        </h3>
        
        <label className="flex items-center justify-between cursor-pointer group">
          <span className="text-gray-300 group-hover:text-white transition">Inclure mes amis</span>
          <div onClick={() => setShowFriends(!showFriends)} className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${showFriends ? 'bg-green-500' : 'bg-gray-700'}`}>
            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300 ${showFriends ? 'left-6' : 'left-1'}`} />
          </div>
        </label>

        <label className="flex items-center justify-between cursor-pointer group">
          <span className={`flex items-center gap-2 transition ${onlyFriends ? "text-philo-primary font-bold" : "text-gray-300 group-hover:text-white"}`}>
             <UserCheck size={14}/> Seulement mes amis
          </span>
          <div onClick={() => setOnlyFriends(!onlyFriends)} className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${onlyFriends ? 'bg-philo-primary' : 'bg-gray-700'}`}>
            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300 ${onlyFriends ? 'left-6' : 'left-1'}`} />
          </div>
        </label>
      </div>

      <hr className="border-white/5" />

      {/* 2. INTERVALLE DE COMPATIBILITÉ */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
           <h3 className="text-gray-500 font-bold uppercase text-xs tracking-wider flex items-center gap-2">
             <GitCommitVertical size={12}/> Compatibilité
           </h3>
        </div>
        
        <div className="flex justify-between items-center gap-2 px-1">
            <div className="relative">
                <input type="number" value={matchRange[0]} onChange={handleMinInput} className="w-16 bg-black/40 border border-white/10 rounded-lg py-1 px-2 text-center text-sm text-white focus:outline-none focus:border-philo-primary font-bold"/>
                <span className="absolute -top-3 left-1 text-[9px] text-gray-500 font-bold">MIN</span>
            </div>
            <span className="text-gray-600 font-bold">-</span>
            <div className="relative">
                <input type="number" value={matchRange[1]} onChange={handleMaxInput} className="w-16 bg-black/40 border border-white/10 rounded-lg py-1 px-2 text-center text-sm text-white focus:outline-none focus:border-philo-primary font-bold"/>
                <span className="absolute -top-3 right-1 text-[9px] text-gray-500 font-bold">MAX</span>
            </div>
        </div>

        <div className="px-1">
            <DualRangeSlider min={0} max={100} values={matchRange} onChange={setMatchRange} />
        </div>
      </div>

      <hr className="border-white/5" />

      {/* 3. ACTIONS RAPIDES */}
      <div className="flex gap-2">
        <button onClick={() => setIsOppositeMode(!isOppositeMode)} className={`flex-1 py-3 rounded-xl border flex flex-col items-center gap-1 transition ${isOppositeMode ? 'bg-pink-500/20 border-pink-500 text-pink-300' : 'bg-slate-900/60 border-white/10 text-gray-400 hover:bg-slate-800'}`}>
            <Magnet size={18} className={isOppositeMode ? "rotate-180" : ""} />
            <span className="text-[10px] font-bold uppercase text-center leading-tight">Mode<br/>Opposés</span>
        </button>

        <button onClick={() => { setShowFriends(true); setOnlyFriends(false); setMatchRange([0, 100]); setIsOppositeMode(false); setScoreMode('VIBES'); }} className="px-4 rounded-xl bg-slate-900/60 border border-white/10 text-gray-400 hover:text-white hover:bg-slate-800 transition flex items-center justify-center" title="Tout réinitialiser">
            <RotateCcw size={20} />
        </button>
      </div>

    </div>
  )
}