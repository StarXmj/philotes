import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, SkipForward, Send, Flag, SlidersHorizontal, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import RandomWarningModal from '../components/random/RandomWarningModal'
import VideoStage from '../components/random/VideoStage'
import DashboardFilters from '../components/dashboard/DashboardFilters'

const RTC_CONFIG = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
}

export default function RandomChatMode() {
  const navigate = useNavigate()
  const { user } = useAuth()
  
  // UI States
  const [hasAcceptedRules, setHasAcceptedRules] = useState(false)
  const [status, setStatus] = useState('idle') 
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [isChannelReady, setIsChannelReady] = useState(false) // NOUVEAU : On attend que le canal soit prêt
  
  // Video States
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  
  // Refs
  const localStreamRef = useRef(null)
  const peerConnection = useRef(null)
  const signalingChannel = useRef(null)
  const currentRoomId = useRef(null)
  const isInitiator = useRef(false)

  // Filtres
  const [scoreMode, setScoreMode] = useState('VIBES') 
  const [matchRange, setMatchRange] = useState([0, 100])
  const [isOppositeMode, setIsOppositeMode] = useState(false)
  const [showFriends, setShowFriends] = useState(false) 
  const [onlyFriends, setOnlyFriends] = useState(false)

  // 1. INITIALISATION DU CANAL DE SIGNALISATION (Dès le début)
  useEffect(() => {
      const channel = supabase.channel('random-signaling')
      
      channel
        .on('broadcast', { event: 'signal' }, handleSignalMessage)
        .on('broadcast', { event: 'chat' }, handleChatMessage)
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log("✅ Canal de signalisation prêt")
                signalingChannel.current = channel
                setIsChannelReady(true)
            }
        })

      return () => {
          supabase.removeChannel(channel)
          signalingChannel.current = null
      }
  }, [])

  // 2. Démarrage Caméra (Seulement quand le canal est prêt)
  useEffect(() => {
    if (hasAcceptedRules && isChannelReady && !localStream) {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                localStreamRef.current = stream 
                setLocalStream(stream)
                startSearch() 
            })
            .catch(err => {
                console.error("Erreur caméra:", err)
                alert("Impossible d'accéder à la caméra.")
                navigate('/app')
            })
    }
    // Pas de cleanup ici pour éviter de couper la cam entre deux skips
  }, [hasAcceptedRules, isChannelReady])

  // Nettoyage final quand on quitte le composant
  useEffect(() => {
      return () => cleanupConnection(true)
  }, [])

  // --- LOGIQUE DE SIGNALISATION (Réception) ---
  const handleSignalMessage = async (payload) => {
      const data = payload.payload
      if (!data) return

      // Si je suis en attente et que je reçois une OFFRE qui m'est destinée
      if (!peerConnection.current && !isInitiator.current && data.target === user.id && data.type === 'offer') {
          console.log("📞 Appel reçu ! ID Room :", data.roomId)
          
          // On supprime notre entrée de la file d'attente (nettoyage)
          await supabase.from('random_queue').delete().eq('user_id', user.id)
          
          currentRoomId.current = data.roomId
          setupWebRTC(data.roomId)
          
          if (!peerConnection.current) return

          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp))
          const answer = await peerConnection.current.createAnswer()
          await peerConnection.current.setLocalDescription(answer)
          
          sendMessageSignal({ type: 'answer', sdp: answer, roomId: currentRoomId.current })
      }
      
      // Gestion des messages suivants (Answer, ICE) pour la room actuelle
      if (peerConnection.current && data.roomId === currentRoomId.current) {
          try {
            if (data.type === 'answer' && isInitiator.current) {
                await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp))
            }
            else if (data.type === 'ice-candidate' && peerConnection.current.remoteDescription) {
                await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate))
            }
          } catch (e) {
              console.error("Erreur WebRTC Signal:", e)
          }
      }
  }

  const handleChatMessage = (payload) => {
      if (payload.payload && payload.payload.roomId === currentRoomId.current) {
          setMessages(prev => [...prev, { id: Date.now(), text: payload.payload.text, isMe: false }])
      }
  }

  // Envoi sécurisé (uniquement si canal prêt)
  const sendMessageSignal = async (data) => {
      if (!signalingChannel.current) {
          console.error("❌ Erreur : Canal non prêt pour l'envoi")
          return
      }
      // target: null = broadcast à tout le monde (pour trouver le partenaire)
      // En prod, on ciblerait un user spécifique.
      await signalingChannel.current.send({ 
          type: 'broadcast', 
          event: 'signal', 
          payload: { ...data, sender: user.id } 
      })
  }

  // --- LOGIQUE DE MATCHING ---

  const startSearch = async () => {
      setStatus('searching')
      setMessages([])
      setRemoteStream(null)
      cleanupConnection(false) // On garde la cam

      console.log("🔍 Recherche de partenaire...")

      try {
          // A. Regarder s'il y a quelqu'un dans la file
          const { data: waitingUsers } = await supabase
              .from('random_queue')
              .select('*')
              .neq('user_id', user.id) // Pas moi-même
              .order('created_at', { ascending: true }) // Le plus ancien
              .limit(1)

          if (waitingUsers && waitingUsers.length > 0) {
              const partner = waitingUsers[0]
              
              // TENTATIVE DE RÉSERVATION (DELETE ATOMIC)
              const { error: deleteError } = await supabase
                  .from('random_queue')
                  .delete()
                  .eq('id', partner.id)

              if (!deleteError) {
                  console.log("✅ Partenaire trouvé :", partner.user_id)
                  initiateCall(partner.user_id)
              } else {
                  console.log("⚠️ Partenaire déjà pris, on réessaie...")
                  setTimeout(startSearch, 500) // Retry
              }
          } else {
              // Personne -> Je m'ajoute
              console.log("⏳ Personne en vue, je m'ajoute à la file.")
              // D'abord on nettoie au cas où on y est déjà
              await supabase.from('random_queue').delete().eq('user_id', user.id)
              await supabase.from('random_queue').insert({ user_id: user.id })
              
              waitForCall()
          }
      } catch (error) {
          console.error("Erreur recherche:", error)
      }
  }

  const initiateCall = async (partnerId) => {
      isInitiator.current = true
      currentRoomId.current = `room_${user.id}_${partnerId}`
      setupWebRTC(currentRoomId.current)
      
      if (!peerConnection.current) return

      const offer = await peerConnection.current.createOffer()
      await peerConnection.current.setLocalDescription(offer)

      console.log("📤 Envoi de l'offre à", partnerId)
      // On envoie l'offre en ciblant spécifiquement l'ID du partenaire
      sendMessageSignal({ type: 'offer', sdp: offer, roomId: currentRoomId.current, target: partnerId })
  }

  const waitForCall = () => {
      isInitiator.current = false
      setStatus('waiting')
  }

  // --- CONFIGURATION WEBRTC ---
  // --- CONFIGURATION WEBRTC ROBUSTE ---
  // --- DANS src/pages/RandomChatMode.jsx ---

  const setupWebRTC = (roomId) => {
      console.log("🛠️ Setup WebRTC pour Room:", roomId)
      setStatus('connecting')
      
      const stream = localStreamRef.current
      if (!stream) {
          console.error("❌ Pas de flux local !")
          return
      }

      // VÉRIFICATION : Est-ce que mes pistes sont actives ?
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack && videoTrack.readyState === 'ended') {
          console.error("❌ ERREUR CRITIQUE : La caméra locale est coupée (ended). Relancez la page.")
          // On pourrait tenter de redemander l'accès ici
          return
      }

      const pc = new RTCPeerConnection(RTC_CONFIG)
      peerConnection.current = pc

      // Ajout des pistes
      stream.getTracks().forEach(track => {
          if (track.readyState === 'live') {
              pc.addTrack(track, stream)
          } else {
              console.warn("⚠️ Piste locale inactive ignorée:", track.kind)
          }
      })

      // Réception
      pc.ontrack = (event) => {
          console.log("🎥 Flux distant reçu (ontrack)", event.streams[0])
          if (event.streams && event.streams[0]) {
              setRemoteStream(event.streams[0])
              setStatus('connected')
          }
      }

      // Surveillance état ICE
      pc.oniceconnectionstatechange = () => {
          console.log("🧊 État ICE:", pc.iceConnectionState)
          if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
              // Si on est en 4G, c'est ici que ça va échouer
              console.error("❌ Échec connexion P2P (Probablement un pare-feu/4G)")
          }
      }

      pc.onicecandidate = (event) => {
          if (event.candidate) {
              sendMessageSignal({ type: 'ice-candidate', candidate: event.candidate, roomId })
          }
      }
  }

  const cleanupConnection = (stopLocal = true) => {
      if (peerConnection.current) {
          peerConnection.current.close()
          peerConnection.current = null
      }
      // On NE coupe PAS le canal de signalisation ici, il est global
      
      if (user) supabase.from('random_queue').delete().eq('user_id', user.id).then()
      
      if (stopLocal && localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop())
          localStreamRef.current = null
          setLocalStream(null)
      }
  }

  // --- ACTIONS UI ---

  const handleSkip = () => {
      cleanupConnection(false)
      startSearch()
  }

  const handleQuit = () => {
      if (window.confirm("Quitter le mode aléatoire ?")) {
          cleanupConnection(true)
          navigate('/app')
      }
  }

  const sendChatMessage = (e) => {
      e.preventDefault()
      if (!inputText.trim() || !signalingChannel.current) return
      
      setMessages(prev => [...prev, { id: Date.now(), text: inputText, isMe: true }])
      
      signalingChannel.current.send({ 
          type: 'broadcast', 
          event: 'chat', 
          payload: { text: inputText, roomId: currentRoomId.current } 
      })
      setInputText('')
  }

  if (!hasAcceptedRules) return <RandomWarningModal onAccept={() => setHasAcceptedRules(true)} onCancel={() => navigate('/app')} />

  return (
    <div className="h-screen w-full bg-black text-white flex overflow-hidden">
      
      {/* GAUCHE */}
      <div className="w-72 bg-slate-900 border-r border-white/5 flex-col hidden md:flex">
        <div className="p-4 border-b border-white/10 flex items-center gap-2">
            <button onClick={handleQuit} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition"><ArrowLeft size={20}/></button>
            <h1 className="font-bold text-lg">Philotès<span className="text-red-500">Roulette</span></h1>
        </div>
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
        </div>
      </div>

      {/* CENTRE */}
      <div className="flex-1 relative flex flex-col">
         <div className="md:hidden absolute top-4 left-4 z-50">
            <button onClick={handleQuit} className="p-3 bg-black/50 backdrop-blur-md rounded-full text-white border border-white/10"><ArrowLeft/></button>
         </div>

         {/* Note: status === 'waiting' signifie qu'on attend un appel, donc on affiche recherche */}
         <VideoStage localStream={localStream} remoteStream={remoteStream} isSearching={status === 'searching' || status === 'waiting' || status === 'connecting'} />

         <div className="h-24 bg-slate-900 border-t border-white/10 flex items-center justify-center gap-4 px-6 relative z-10">
             <button className="p-4 rounded-full bg-slate-800 text-red-500 hover:bg-red-500/10 border border-red-500/20 active:scale-95 transition" title="Signaler"><Flag size={24}/></button>
             <button 
                onClick={handleSkip} 
                className="flex-1 max-w-md py-4 bg-white text-black font-black text-xl rounded-full hover:scale-105 active:scale-95 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.3)] flex items-center justify-center gap-3"
             >
                {(status === 'searching' || status === 'waiting') ? <><Loader2 className="animate-spin"/> Recherche...</> : <>SKIP <SkipForward fill="black" size={24}/></>}
             </button>
         </div>
      </div>

      {/* DROITE */}
      <div className="w-80 bg-slate-900 border-l border-white/5 flex flex-col hidden lg:flex">
         <div className="p-4 border-b border-white/10 bg-slate-800/50">
             <h3 className="font-bold text-center text-gray-300">Chat Anonyme</h3>
             <p className="text-[10px] text-center text-gray-500">{status === 'connected' ? "Connecté !" : "En recherche..."}</p>
         </div>

         <div className="flex-1 overflow-y-auto p-4 space-y-3">
             {status !== 'connected' ? (
                 <div className="h-full flex items-center justify-center text-gray-600 text-sm animate-pulse">En attente de connexion...</div>
             ) : (
                 <>
                    <div className="text-center text-xs text-gray-500 my-4">Vous êtes connecté !</div>
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

         <form onSubmit={sendChatMessage} className="p-4 border-t border-white/10 flex gap-2">
             <input 
                disabled={status !== 'connected'}
                type="text" 
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Dis salut..." 
                className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-white/50"
             />
             <button disabled={status !== 'connected'} type="submit" className="p-2 bg-white text-black rounded-xl hover:opacity-80 transition"><Send size={20}/></button>
         </form>
      </div>
    </div>
  )
}