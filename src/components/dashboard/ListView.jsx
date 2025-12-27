// src/components/dashboard/ListView.jsx
import { useMemo } from 'react'
import { User, MapPin, CheckCircle, ChevronRight, MessageCircle, UserPlus } from 'lucide-react'
import { motion } from 'framer-motion'

export default function ListView({ matches, onSelectUser, unreadCounts = {}, myId }) {
  
  // --- TRI INTELLIGENT (Priorité : Demandes > Messages > Amis > Score) ---
  const sortedMatches = useMemo(() => {
    return [...matches].sort((a, b) => {
        // 1. Demandes d'amis reçues
        const aReq = a.connection?.status === 'pending' && a.connection?.receiver_id === myId
        const bReq = b.connection?.status === 'pending' && b.connection?.receiver_id === myId
        if (aReq && !bReq) return -1
        if (!aReq && bReq) return 1

        // 2. Messages non lus
        const aUnread = (unreadCounts[a.id] || 0) > 0
        const bUnread = (unreadCounts[b.id] || 0) > 0
        if (aUnread && !bUnread) return -1
        if (!aUnread && bUnread) return 1

        // 3. Amis
        const aFriend = a.connection?.status === 'accepted'
        const bFriend = b.connection?.status === 'accepted'
        if (aFriend && !bFriend) return -1
        if (!aFriend && bFriend) return 1

        // 4. Score Global (Décroissant)
        return (b.score_global || 0) - (a.score_global || 0)
    })
  }, [matches, unreadCounts, myId])

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2 p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center"><User size={20} className="opacity-50"/></div>
        <p className="text-sm">Aucun profil ne correspond à tes filtres.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-3 pb-24 overflow-y-auto h-full scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
      {sortedMatches.map((match, index) => {
        const pct = Math.round(match.score_global || 0)
        const isFriend = match.connection?.status === 'accepted'
        const isPending = match.connection?.status === 'pending' && match.connection?.receiver_id === myId
        const unread = unreadCounts[match.id] || 0
        const hasNotif = unread > 0
        
        let borderClass = "border-white/5 hover:border-white/10"
        let bgClass = "bg-slate-800/40 hover:bg-slate-800/80"
        let scoreColor = "text-gray-400"
        let barColor = "bg-gray-600"

        if (isPending) {
            borderClass = "border-green-500/50 bg-green-500/10 hover:bg-green-500/20"
            scoreColor = "text-green-400"
        } else if (hasNotif) {
            borderClass = "border-red-500/50 bg-red-500/10 hover:bg-red-500/20"
            scoreColor = "text-red-400"
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
                    {match.avatar_prive && isFriend ? <img src={match.avatar_prive} className="w-full h-full object-cover"/> : 
                     match.avatar_public ? <img src={`/avatars/${match.avatar_public}`} className="w-full h-full object-cover"/> : 
                     <div className="w-full h-full bg-slate-700 flex items-center justify-center"><User size={20} className="text-gray-400"/></div>}
                </div>
                {isFriend && <div className="absolute -bottom-0.5 -right-0.5 bg-slate-900 rounded-full p-0.5"><CheckCircle size={14} className="text-philo-primary fill-philo-primary/20"/></div>}
                {hasNotif && !isPending && (<div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-slate-900 animate-bounce">{unread}</div>)}
             </div>
             
             <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex justify-between items-center mb-0.5">
                    <h3 className={`font-bold text-sm truncate ${isFriend ? 'text-philo-primary' : 'text-gray-200'}`}>{match.pseudo}</h3>
                    {isPending ? (<span className="text-[10px] font-bold bg-green-500 text-black px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse"><UserPlus size={10}/> NEW</span>) : (<span className={`text-xs font-bold ${scoreColor} bg-black/20 px-1.5 py-0.5 rounded-md`}>{pct}%</span>)}
                </div>
                <div className="text-[11px] text-gray-500 flex items-center gap-1.5 truncate">
                    {hasNotif ? (<span className="text-red-400 flex items-center gap-1 font-medium"><MessageCircle size={10}/> Nouveaux messages</span>) : (<><span className="truncate">{match.intitule || 'Étudiant'}</span><span className="w-0.5 h-0.5 rounded-full bg-gray-600 shrink-0"/><span className="flex items-center gap-0.5 truncate"><MapPin size={10}/> {match.etudes_lieu || '?'}</span></>)}
                </div>
                {!isPending && !hasNotif && (<div className="w-full h-0.5 bg-white/5 mt-2 rounded-full overflow-hidden"><div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} /></div>)}
             </div>
             <div className="opacity-0 group-hover:opacity-100 transition-opacity -ml-2"><ChevronRight size={16} className="text-gray-400"/></div>
          </motion.div>
        )
      })}
    </div>
  )
}