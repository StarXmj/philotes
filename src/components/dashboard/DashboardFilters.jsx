import { useState, useEffect, useCallback } from 'react'
import { Users, GitCommitVertical, Magnet, RotateCcw } from 'lucide-react'

// Le Slider est déplacé ici car il ne sert qu'aux filtres
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
            <input type="range" min="0" max="100" value={minVal} onChange={handleMinChange} className="absolute z-20 h-0 w-full opacity-0 cursor-pointer pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4" />
            <input type="range" min="0" max="100" value={maxVal} onChange={handleMaxChange} className="absolute z-20 h-0 w-full opacity-0 cursor-pointer pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4" />
            <div className="relative w-full h-1.5 bg-slate-700 rounded-full z-0">
                <div className="absolute h-full bg-philo-primary rounded-full z-10" style={{ left: `${getPercent(minVal)}%`, width: `${getPercent(maxVal) - getPercent(minVal)}%` }} />
                <div className="absolute w-4 h-4 bg-white border-2 border-philo-primary rounded-full -top-1.5 -ml-2 z-10 shadow" style={{ left: `${getPercent(minVal)}%` }} />
                <div className="absolute w-4 h-4 bg-white border-2 border-philo-primary rounded-full -top-1.5 -ml-2 z-10 shadow" style={{ left: `${getPercent(maxVal)}%` }} />
            </div>
            <div className="absolute -bottom-5 left-0 text-[10px] text-gray-400 font-bold">{minVal}%</div>
            <div className="absolute -bottom-5 right-0 text-[10px] text-gray-400 font-bold">{maxVal}%</div>
        </div>
    )
}

export default function DashboardFilters({ showFriends, setShowFriends, setMatchRange, isOppositeMode, setIsOppositeMode }) {
  return (
    <div className="flex flex-col gap-6 p-4 w-64">
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
                <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2"><GitCommitVertical size={12}/> Compatibilité</span>
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
  )
}