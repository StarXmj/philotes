import { Filter, Users, Sparkles, GraduationCap } from 'lucide-react'

export default function DashboardFilters({ 
  showFriends, setShowFriends, 
  setMatchRange, matchRange, 
  isOppositeMode, setIsOppositeMode, 
  scoreMode, setScoreMode // On récupère ces props
}) {
  return (
    <div className="p-4 space-y-8 text-sm">
      
      {/* 1. MODE DE SCORE (Vibes vs Profil) */}
      <div className="space-y-3">
        <h3 className="text-gray-500 font-bold uppercase text-xs tracking-wider flex items-center gap-2">
          <Filter size={12} /> Critère de match
        </h3>
        <div className="grid grid-cols-2 gap-2 bg-black/20 p-1 rounded-xl">
          <button 
            onClick={() => setScoreMode('VIBES')}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${scoreMode === 'VIBES' ? 'bg-philo-primary text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
          >
            <Sparkles size={14} /> VIBES
          </button>
          <button 
            onClick={() => setScoreMode('PROFIL')}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${scoreMode === 'PROFIL' ? 'bg-philo-secondary text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
          >
            <GraduationCap size={14} /> PROFIL
          </button>
        </div>
        <p className="text-[10px] text-gray-500 px-1">
          {scoreMode === 'VIBES' ? "Basé sur ta personnalité et tes réponses au quiz." : "Basé sur tes études, ton campus et ton âge."}
        </p>
      </div>

      <hr className="border-white/5" />

      {/* 2. FILTRE AMIS */}
      <div className="space-y-3">
        <h3 className="text-gray-500 font-bold uppercase text-xs tracking-wider flex items-center gap-2">
          <Users size={12} /> Relations
        </h3>
        <label className="flex items-center justify-between cursor-pointer group">
          <span className="text-gray-300 group-hover:text-white transition">Voir mes amis</span>
          <div 
            onClick={() => setShowFriends(!showFriends)}
            className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${showFriends ? 'bg-green-500' : 'bg-gray-700'}`}
          >
            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300 ${showFriends ? 'left-6' : 'left-1'}`} />
          </div>
        </label>
      </div>

      <hr className="border-white/5" />

      {/* 3. SCORE MINIMUM */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
           <h3 className="text-gray-500 font-bold uppercase text-xs tracking-wider">Compatibilité Min</h3>
           <span className="text-white font-bold text-xs">{matchRange[0]}%</span>
        </div>
        <input 
          type="range" min="0" max="100" 
          value={matchRange[0]} 
          onChange={(e) => setMatchRange([parseInt(e.target.value), 100])}
          className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-philo-primary"
        />
      </div>

      <hr className="border-white/5" />

      {/* 4. MODE OPPOSÉ */}
      <div className="space-y-3">
        <label className="flex items-center justify-between cursor-pointer group">
          <span className={`transition ${isOppositeMode ? "text-red-400 font-bold" : "text-gray-300"}`}>
            Mode "Opposés s'attirent"
          </span>
          <div 
            onClick={() => setIsOppositeMode(!isOppositeMode)}
            className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${isOppositeMode ? 'bg-red-500' : 'bg-gray-700'}`}
          >
            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300 ${isOppositeMode ? 'left-6' : 'left-1'}`} />
          </div>
        </label>
        {isOppositeMode && (
          <p className="text-[10px] text-red-400/80 italic">
            Affiche les profils les moins compatibles en premier. Challenge tes certitudes !
          </p>
        )}
      </div>

    </div>
  )
}