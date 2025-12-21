import { User, MapPin, Sparkles, CheckCircle, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'

export default function ListView({ matches, onSelectUser }) {
  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2 p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
            <User size={20} className="opacity-50"/>
        </div>
        <p className="text-sm">Aucun profil ne correspond à tes filtres actuels.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-3 pb-24 overflow-y-auto h-full scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
      {matches.map((match, index) => {
        const pct = Math.round(match.score * 100)
        const isFriend = match.connection?.status === 'accepted'
        
        // Couleurs dynamiques selon le score
        let scoreColor = "text-gray-400"
        let barColor = "bg-gray-600"
        if (isFriend) { scoreColor = "text-philo-primary"; barColor = "bg-philo-primary"; }
        else if (pct >= 85) { scoreColor = "text-green-400"; barColor = "bg-gradient-to-r from-green-500 to-emerald-400"; }
        else if (pct >= 65) { scoreColor = "text-philo-secondary"; barColor = "bg-philo-secondary"; }

        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            key={match.id} 
            onClick={() => onSelectUser(match)} 
            className="group relative flex items-center gap-3 p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/80 border border-white/5 hover:border-white/10 cursor-pointer transition-all duration-300 backdrop-blur-sm"
          >
             {/* 1. AVATAR */}
             <div className="relative w-12 h-12 shrink-0">
                <div className={`w-full h-full rounded-full overflow-hidden border-2 ${isFriend ? 'border-philo-primary' : 'border-transparent group-hover:border-white/20'} transition`}>
                    {isFriend && match.avatar_prive ? <img src={match.avatar_prive} className="w-full h-full object-cover"/> : 
                     match.avatar_public ? <img src={`/avatars/${match.avatar_public}`} className="w-full h-full object-cover"/> : 
                     <div className="w-full h-full bg-slate-700 flex items-center justify-center"><User size={20} className="text-gray-400"/></div>}
                </div>
                {isFriend && <div className="absolute -bottom-0.5 -right-0.5 bg-slate-900 rounded-full p-0.5"><CheckCircle size={14} className="text-philo-primary fill-philo-primary/20"/></div>}
             </div>
             
             {/* 2. INFOS */}
             <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex justify-between items-center mb-0.5">
                    <h3 className={`font-bold text-sm truncate ${isFriend ? 'text-philo-primary' : 'text-gray-200 group-hover:text-white'}`}>{match.pseudo}</h3>
                    <span className={`text-xs font-bold ${scoreColor} flex items-center gap-1 bg-black/20 px-1.5 py-0.5 rounded-md`}>
                        {pct}%
                    </span>
                </div>
                
                <div className="text-[11px] text-gray-500 flex items-center gap-1.5 truncate">
                    <span className="truncate">{match.intitule || 'Étudiant'}</span>
                    <span className="w-0.5 h-0.5 rounded-full bg-gray-600 shrink-0"/>
                    <span className="flex items-center gap-0.5 truncate"><MapPin size={10}/> {match.etudes_lieu || '?'}</span>
                </div>

                {/* Petite barre de progression visuelle */}
                <div className="w-full h-0.5 bg-white/5 mt-2 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
             </div>

             {/* 3. FLÈCHE (Affichée au survol) */}
             <div className="opacity-0 group-hover:opacity-100 transition-opacity -ml-2">
                <ChevronRight size={16} className="text-gray-400"/>
             </div>
          </motion.div>
        )
      })}
    </div>
  )
}