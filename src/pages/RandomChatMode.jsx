// src/pages/RandomChatMode.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, SkipForward, Send, Flag, SlidersHorizontal } from 'lucide-react'
import RandomWarningModal from '../components/random/RandomWarningModal'
import VideoStage from '../components/random/VideoStage'
// 1. IMPORT DU FILTRE EXISTANT
import DashboardFilters from '../components/dashboard/DashboardFilters'

export default function RandomChatMode() {
  const navigate = useNavigate()
  
  // États de sécurité / Vidéo
  const [hasAcceptedRules, setHasAcceptedRules] = useState(false)
  const [localStream, setLocalStream] = useState(null)
  const [isSearching, setIsSearching] = useState(true)
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  
  // 2. ÉTATS POUR LE FILTRE (Mêmes que Dashboard.jsx)
  // Ces états serviront à affiner l'algo de matching aléatoire
  const [scoreMode, setScoreMode] = useState('VIBES') 
  const [matchRange, setMatchRange] = useState([0, 100])
  const [isOppositeMode, setIsOppositeMode] = useState(false)
  // On laisse ces deux-là pour la compatibilité du composant, même si moins utiles ici
  const [showFriends, setShowFriends] = useState(false) 
  const [onlyFriends, setOnlyFriends] = useState(false)

  // Initialisation Caméra
  useEffect(() => {
    if (hasAcceptedRules) {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => setLocalStream(stream))
            .catch(err => console.error("Erreur caméra:", err))
            
        // Simulation de recherche
        const timer = setTimeout(() => setIsSearching(false), 3000)
        return () => clearTimeout(timer)
    }
    return () => {
        if (localStream) localStream.getTracks().forEach(track => track.stop())
    }
  }, [hasAcceptedRules])

  const handleSkip = () => {
      setMessages([])
      setIsSearching(true)
      setTimeout(() => setIsSearching(false), 2000)
  }

  const sendMessage = (e) => {
      e.preventDefault()
      if (!inputText.trim()) return
      setMessages(prev => [...prev, { id: Date.now(), text: inputText, isMe: true }])
      setInputText('')
      setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now()+1, text: "Salut ! T'es en quelle année ?", isMe: false }])
      }, 1000)
  }

  const handleQuit = () => {
      if (window.confirm("Quitter le mode aléatoire ?")) {
          navigate('/app')
      }
  }

  if (!hasAcceptedRules) return <RandomWarningModal onAccept={() => setHasAcceptedRules(true)} onCancel={() => navigate('/app')} />

  return (
    <div className="h-screen w-full bg-black text-white flex overflow-hidden">
      
      {/* --- GAUCHE : FILTRES (RÉUTILISATION DASHBOARD) --- */}
      {/* hidden md:flex -> Caché sur mobile, visible sur PC/Tablette */}
      <div className="w-72 bg-slate-900 border-r border-white/5 flex-col hidden md:flex">
        <div className="p-4 border-b border-white/10 flex items-center gap-2">
            <button onClick={handleQuit} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition"><ArrowLeft size={20}/></button>
            <h1 className="font-bold text-lg">Philotès<span className="text-red-500">Roulette</span></h1>
        </div>
        
        {/* On injecte directement DashboardFilters ici */}
        <div className="flex-1 overflow-y-auto">
            <div className="p-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase mb-4 flex items-center gap-2"><SlidersHorizontal size={14}/> Priorité Matching</h3>
                <DashboardFilters 
                    showFriends={showFriends} setShowFriends={setShowFriends} 
                    onlyFriends={onlyFriends} setOnlyFriends={setOnlyFriends} 
                    setMatchRange={setMatchRange} matchRange={matchRange} 
                    isOppositeMode={isOppositeMode} setIsOppositeMode={setIsOppositeMode} 
                    scoreMode={scoreMode} setScoreMode={setScoreMode} 
                />
            </div>
            
            <div className="p-4 mt-4">
                <div className="bg-red-900/10 border border-red-900/30 rounded-xl p-3">
                    <p className="text-[10px] text-red-400 text-center leading-tight">
                        Vos filtres priorisent la recherche. Si personne ne correspond, la recherche s'élargit automatiquement.
                    </p>
                </div>
            </div>
        </div>
      </div>

      {/* --- CENTRE : VIDÉO --- */}
      <div className="flex-1 relative flex flex-col">
         {/* Bouton Retour Mobile (Car sidebar cachée) */}
         <div className="md:hidden absolute top-4 left-4 z-50">
            <button onClick={handleQuit} className="p-3 bg-black/50 backdrop-blur-md rounded-full text-white border border-white/10"><ArrowLeft/></button>
         </div>

         {/* Vidéo Stage */}
         <VideoStage localStream={localStream} isSearching={isSearching} />

         {/* Bouton SKIP Central */}
         <div className="h-24 bg-slate-900 border-t border-white/10 flex items-center justify-center gap-4 px-6 relative z-10">
             <button className="p-4 rounded-full bg-slate-800 text-red-500 hover:bg-red-500/10 border border-red-500/20 active:scale-95 transition" title="Signaler"><Flag size={24}/></button>
             <button 
                onClick={handleSkip} 
                className="flex-1 max-w-md py-4 bg-white text-black font-black text-xl rounded-full hover:scale-105 active:scale-95 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.3)] flex items-center justify-center gap-3"
             >
                {isSearching ? "Recherche..." : <>SKIP <SkipForward fill="black" size={24}/></>}
             </button>
         </div>
      </div>

      {/* --- DROITE : CHAT (Seulement PC Large) --- */}
      <div className="w-80 bg-slate-900 border-l border-white/5 flex flex-col hidden lg:flex">
         <div className="p-4 border-b border-white/10 bg-slate-800/50">
             <h3 className="font-bold text-center text-gray-300">Chat Anonyme</h3>
             <p className="text-[10px] text-center text-gray-500">Les messages sont effacés après le skip</p>
         </div>

         <div className="flex-1 overflow-y-auto p-4 space-y-3">
             {isSearching ? (
                 <div className="h-full flex items-center justify-center text-gray-600 text-sm animate-pulse">En attente de connexion...</div>
             ) : (
                 <>
                    <div className="text-center text-xs text-gray-500 my-4">Vous êtes connecté avec un étudiant inconnu.</div>
                    {messages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.isMe ? 'bg-white text-black rounded-tr-none' : 'bg-slate-800 text-white rounded-tl-none border border-white/10'}`}>
                                {msg.text}
                            </div>
                        </div>
                    ))}
                 </>
             )}
         </div>

         <form onSubmit={sendMessage} className="p-4 border-t border-white/10 flex gap-2">
             <input 
                disabled={isSearching}
                type="text" 
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Dis salut..." 
                className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-white/50"
             />
             <button disabled={isSearching} type="submit" className="p-2 bg-white text-black rounded-xl hover:opacity-80 transition"><Send size={20}/></button>
         </form>
      </div>
    </div>
  )
}