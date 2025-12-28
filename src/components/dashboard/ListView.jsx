import { useMemo } from 'react'
import { User, MapPin, CheckCircle, ChevronRight, MessageCircle, UserPlus } from 'lucide-react'
import { motion } from 'framer-motion'

export default function ListView({ matches, onSelectUser, unreadCounts = {}, myId, scoreMode }) { // <--- Ajout scoreMode
  
  // TRI INTELLIGENT : Demandes > Messages > Amis > Score Choisi
  const sortedMatches = useMemo(() => {
    return [...matches].sort((a, b) => {
        // 1. Demandes Reçues (Pending)
        const aReq = a.connection?.status === 'pending' && a.connection?.receiver_id === myId
        const bReq = b.connection?.status === 'pending' && b.connection?.receiver_id === myId
        if (aReq && !bReq) return -1
        if (!aReq && bReq) return 1

        // 2. Messages Non Lus (Badge Rouge)
        const aUnread = (unreadCounts[a.id] || 0) > 0
        const bUnread = (unreadCounts[b.id] || 0) > 0
        if (aUnread && !bUnread) return -1
        if (!aUnread && bUnread) return 1

        // 3. Amis
        const aFriend = a.connection?.status === 'accepted'
        const bFriend = b.connection?.status === 'accepted'
        if (aFriend && !bFriend) return -1
        if (!aFriend && bFriend) return 1

        // 4. Score Choisi (Décroissant)
        // On récupère le bon score selon le mode
        const scoreA = scoreMode === 'IA' ? (a.embedding_score || 0) : (a.profile_score || 0)
        const scoreB = scoreMode === 'IA' ? (b.embedding_score || 0) : (b.profile_score || 0)
        
        return scoreB - scoreA
    })
  }, [matches, unreadCounts, myId, scoreMode]) // <--- Dépendance ajoutée

  if (matches.length === 0) return <div className="p-6 text-center text-gray-500">Aucun profil.</div>

  return (
    <div className="flex flex-col gap-2 p-3 pb-24 overflow-y-auto h-full scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
      {sortedMatches.map((match, index) => {
        // CALCUL DU SCORE À AFFICHER
        const rawScore = scoreMode === 'IA' ? (match.embedding_score || 0) : (match.profile_score || 0)
        const pct = Math.round(rawScore)

        const isFriend = match.connection?.status === 'accepted'
        const isPending = match.connection?.status === 'pending' && match.connection?.receiver_id === myId
        const unread = unreadCounts[match.id] || 0
        
        let borderClass = "border-white/5 hover:border-white/10"
        let bgClass = "bg-slate-800/40 hover:bg-slate-800/80"
        let scoreColor = "text-gray-400"
        let barColor = "bg-gray-600"

        if (isPending) {
            borderClass = "border-green-500/50 bg-green-500/10 hover:bg-green-500/20"; scoreColor = "text-green-400"
        } else if (unread > 0) {
            borderClass = "border-red-500/50 bg-red-500/10 hover:bg-red-500/20"; scoreColor = "text-red-400"
        } else if (isFriend) {
            scoreColor = "text-philo-primary"; barColor = "bg-philo-primary"
        } else if (pct >= 85) {
            scoreColor = "text-green-400"; barColor = "bg-gradient-to-r from-green-500 to-emerald-400"
        }

        return (
          <motion.div 
            layout 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
            key={match.id} onClick={() => onSelectUser(match)} 
            className={`group relative flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-300 backdrop-blur-sm ${bgClass} ${borderClass}`}
          >
             <div className="relative w-12 h-12 shrink-0">
                <div className={`w-full h-full rounded-full overflow-hidden border-2 transition ${isFriend ? 'border-philo-primary' : 'border-transparent'}`}>
                    {match.avatar_public ? <img src={`/avatars/${match.avatar_public}`} className="w-full h-full object-cover"/> : <div className="w-full h-full bg-slate-700 flex items-center justify-center"><User size={20} className="text-gray-400"/></div>}
                </div>
                {/* BADGE ROUGE LISTE */}
                {unread > 0 && !isPending && (<div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-slate-900 animate-bounce">{unread}</div>)}
             </div>
             
             <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                    <h3 className="font-bold text-sm truncate text-white">{match.pseudo}</h3>
                    {isPending ? <span className="text-[10px] bg-green-500 text-black px-2 rounded-full animate-pulse">NEW</span> : <span className={`text-xs font-bold ${scoreColor} bg-black/20 px-1.5 py-0.5 rounded-md`}>{pct}%</span>}
                </div>
                <div className="text-[11px] text-gray-400 truncate">
                    {unread > 0 ? <span className="text-red-400 font-bold flex items-center gap-1"><MessageCircle size={10}/> Message non lu</span> : <span>{match.intitule}</span>}
                </div>
                {!isPending && unread === 0 && (<div className="w-full h-0.5 bg-white/5 mt-2 rounded-full overflow-hidden"><div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} /></div>)}
             </div>
             <div className="opacity-0 group-hover:opacity-100 transition-opacity -ml-2"><ChevronRight size={16} className="text-gray-400"/></div>
          </motion.div>
        )
      })}
    </div>
  )
}