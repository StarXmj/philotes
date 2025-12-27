import { useMemo } from 'react'
import { User, MapPin, CheckCircle, ChevronRight, MessageCircle, UserPlus } from 'lucide-react'
import { motion } from 'framer-motion'

export default function ListView({ matches, onSelectUser, unreadCounts = {}, myId }) {
  
  // TRI INTELLIGENT
  const sortedMatches = useMemo(() => {
    return [...matches].sort((a, b) => {
        // Demandes Reçues (Pending)
        const aReq = a.connection?.status === 'pending' && a.connection?.receiver_id === myId
        const bReq = b.connection?.status === 'pending' && b.connection?.receiver_id === myId
        if (aReq && !bReq) return -1
        if (!aReq && bReq) return 1

        // Messages Non Lus (Badge Rouge)
        const aUnread = (unreadCounts[a.id] || 0) > 0
        const bUnread = (unreadCounts[b.id] || 0) > 0
        if (aUnread && !bUnread) return -1
        if (!aUnread && bUnread) return 1

        // Amis
        const aFriend = a.connection?.status === 'accepted'
        const bFriend = b.connection?.status === 'accepted'
        if (aFriend && !bFriend) return -1
        if (!aFriend && bFriend) return 1

        // Score
        return (b.score_global || 0) - (a.score_global || 0)
    })
  }, [matches, unreadCounts, myId])

  if (matches.length === 0) return <div className="p-6 text-center text-gray-500">Aucun profil.</div>

  return (
    <div className="flex flex-col gap-2 p-3 pb-24 overflow-y-auto h-full scrollbar-thin">
      {sortedMatches.map((match, index) => {
        const pct = Math.round(match.score_global || match.score * 100 || 0)
        const isFriend = match.connection?.status === 'accepted'
        const isPending = match.connection?.status === 'pending' && match.connection?.receiver_id === myId
        const unread = unreadCounts[match.id] || 0
        
        let borderClass = "border-white/5 hover:border-white/10"
        let bgClass = "bg-slate-800/40 hover:bg-slate-800/80"
        let scoreColor = "text-gray-400"
        let barColor = "bg-gray-600"

        if (isPending) {
            borderClass = "border-green-500/50 bg-green-500/10"; scoreColor = "text-green-400"
        } else if (unread > 0) {
            borderClass = "border-red-500/50 bg-red-500/10"; scoreColor = "text-red-400"
        } else if (isFriend) {
            scoreColor = "text-philo-primary"; barColor = "bg-philo-primary"
        } else if (pct >= 85) {
            scoreColor = "text-green-400"; barColor = "bg-gradient-to-r from-green-500 to-emerald-400"
        }

        return (
          <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={match.id} onClick={() => onSelectUser(match)} 
            className={`group relative flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${bgClass} ${borderClass}`}
          >
             <div className="relative w-12 h-12 shrink-0">
                <div className={`w-full h-full rounded-full overflow-hidden border-2 transition ${isFriend ? 'border-philo-primary' : 'border-transparent'}`}>
                    {match.avatar_public ? <img src={`/avatars/${match.avatar_public}`} className="w-full h-full object-cover"/> : <div className="w-full h-full bg-slate-700 flex items-center justify-center"><User size={20}/></div>}
                </div>
                {/* BADGE ROUGE */}
                {unread > 0 && !isPending && (<div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-slate-900 animate-bounce">{unread}</div>)}
             </div>
             
             <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold text-sm truncate">{match.pseudo}</h3>
                    {isPending ? <span className="text-[10px] bg-green-500 text-black px-2 rounded-full animate-pulse">NEW</span> : <span className={`text-xs font-bold ${scoreColor}`}>{pct}%</span>}
                </div>
                <div className="text-[11px] text-gray-400 truncate">
                    {unread > 0 ? <span className="text-red-400 font-bold flex items-center gap-1"><MessageCircle size={10}/> Message non lu</span> : <span>{match.intitule}</span>}
                </div>
             </div>
          </motion.div>
        )
      })}
    </div>
  )
}