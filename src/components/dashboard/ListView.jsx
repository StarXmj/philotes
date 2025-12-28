import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, GraduationCap, MessageCircle, User } from 'lucide-react'

export default function ListView({ matches, onSelectUser, unreadCounts = {}, myId, scoreMode }) {
  
  // TRI INTELLIGENT
  const sortedMatches = useMemo(() => {
    return [...matches].sort((a, b) => {
        // A. Demandes (Priorité)
        const aReq = a.connection?.status === 'pending' && a.connection?.receiver_id === myId
        const bReq = b.connection?.status === 'pending' && b.connection?.receiver_id === myId
        if (aReq && !bReq) return -1
        if (!aReq && bReq) return 1

        // B. Messages Non Lus
        const aUnread = (unreadCounts[a.id] || 0) > 0
        const bUnread = (unreadCounts[b.id] || 0) > 0
        if (aUnread && !bUnread) return -1
        if (!aUnread && bUnread) return 1

        // C. Amis
        const aFriend = a.connection?.status === 'accepted'
        const bFriend = b.connection?.status === 'accepted'
        if (aFriend && !bFriend) return -1
        if (!aFriend && bFriend) return 1

        // D. Score Choisi
        // On normalise ici aussi pour le tri
        let valA = scoreMode === 'VIBES' ? (a.personality_score || 0) : (a.profile_score || 0)
        let valB = scoreMode === 'VIBES' ? (b.personality_score || 0) : (b.profile_score || 0)
        // Correction : si <= 1, on considère que c'est du 0.xx donc on remet sur 100
        if (valA <= 1) valA *= 100
        if (valB <= 1) valB *= 100
        
        return valB - valA
    })
  }, [matches, unreadCounts, myId, scoreMode])

  if (!matches || matches.length === 0) return <div className="p-8 text-center text-gray-500">Aucun étudiant trouvé...</div>

  return (
    <div className="pb-24 px-2 space-y-2 overflow-y-auto h-full scrollbar-hide">
      {sortedMatches.map((match) => {
        // 1. RECUPERATION
        let rawScore = scoreMode === 'VIBES' ? (match.personality_score || 0) : (match.profile_score || 0)
        
        // 2. CONVERSION SECURISEE (0.85 -> 85, 1 -> 100)
        if (rawScore <= 1) rawScore *= 100
        const displayScore = Math.round(rawScore)

        const colorClass = scoreMode === 'VIBES' ? 'text-philo-primary' : 'text-philo-secondary'
        const unread = unreadCounts[match.id] || 0
        const isPending = match.connection?.status === 'pending' && match.connection?.receiver_id === myId
        
        const containerBorder = isPending 
            ? "border-green-500/30 bg-green-500/5 hover:bg-green-500/10" 
            : "border-white/5 bg-white/5 hover:bg-white/10"

        return (
          <motion.div 
            key={match.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => onSelectUser(match)}
            className={`group relative border rounded-xl p-3 flex items-center gap-4 cursor-pointer transition-all ${containerBorder}`}
          >
            <div className="relative shrink-0">
               <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-800 border border-white/10">
                  {match.avatar_public ? (
                    <img src={`/avatars/${match.avatar_public}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500"><User size={20}/></div>
                  )}
               </div>
               {unread > 0 && !isPending && (
                 <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-slate-900 animate-bounce">
                   {unread}
                 </div>
               )}
            </div>

            <div className="flex-1 min-w-0">
               <div className="flex justify-between items-center">
                  <h3 className="font-bold text-white truncate">{match.pseudo}</h3>
                  {isPending ? (
                      <span className="text-[10px] bg-green-500 text-black px-2 py-0.5 rounded-full font-bold animate-pulse">DEMANDE</span>
                  ) : (
                      <span className={`text-xs font-bold ${colorClass} flex items-center gap-1`}>
                         {scoreMode === 'VIBES' ? <Sparkles size={10}/> : <GraduationCap size={10}/>}
                         {displayScore}%
                      </span>
                  )}
               </div>
               
               <div className="text-xs text-gray-400 truncate mt-0.5">
                  {unread > 0 ? (
                      <span className="text-red-400 font-bold flex items-center gap-1"><MessageCircle size={12}/> Message non lu</span>
                  ) : (
                      <span>{match.etudes_lieu} • {match.intitule}</span>
                  )}
               </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}