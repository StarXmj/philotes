import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, SkipForward, Send, Flag, SlidersHorizontal, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import RandomWarningModal from '../components/random/RandomWarningModal'
import VideoStage from '../components/random/VideoStage'
import DashboardFilters from '../components/dashboard/DashboardFilters'

// Configuration STUN (Gratuit - Google) pour passer à travers les pare-feux simples
const RTC_CONFIG = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
}

export default function RandomChatMode() {
  const navigate = useNavigate()
  const { user } = useAuth()
  
  // UI States
  const [hasAcceptedRules, setHasAcceptedRules] = useState(false)
  const [status, setStatus] = useState('idle') // idle, searching, connecting, connected
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  
  // Video States
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  
  // Refs pour WebRTC et Logique
  const peerConnection = useRef(null)
  const signalingChannel = useRef(null)
  const currentRoomId = useRef(null)
  const isInitiator = useRef(false)

  // Filtres (Décoratifs pour l'instant, prêts à être branchés)
  const [scoreMode, setScoreMode] = useState('VIBES') 
  const [matchRange, setMatchRange] = useState([0, 100])
  const [isOppositeMode, setIsOppositeMode] = useState(false)
  const [showFriends, setShowFriends] = useState(false) 
  const [onlyFriends, setOnlyFriends] = useState(false)

  // 1. Démarrage Caméra
  useEffect(() => {
    if (hasAcceptedRules && !localStream) {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                setLocalStream(stream)
                startSearch() // On lance la recherche dès que la caméra est prête
            })
            .catch(err => {
                console.error("Erreur caméra:", err)
                alert("Impossible d'accéder à la caméra. Vérifiez vos permissions.")
                navigate('/app')
            })
    }
    return () => cleanupConnection() // Nettoyage si on quitte
  }, [hasAcceptedRules])

  // --- LOGIQUE DE MATCHING ---

  const startSearch = async () => {
      setStatus('searching')
      setMessages([])
      setRemoteStream(null)
      cleanupConnection(false) // On garde le flux local

      try {
          // A. Regarder s'il y a quelqu'un dans la file (qui n'est pas moi)
          const { data: waitingUsers } = await supabase
              .from('random_queue')
              .select('*')
              .neq('user_id', user.id)
              .order('created_at', { ascending: true })
              .limit(1)

          if (waitingUsers && waitingUsers.length > 0) {
              // --> CAS 1 : J'ai trouvé quelqu'un (Je suis l'INITIATEUR)
              const partner = waitingUsers[0]
              
              // On essaie de le "réserver" en le supprimant de la file
              const { error: deleteError } = await supabase
                  .from('random_queue')
                  .delete()
                  .eq('id', partner.id)

              if (!deleteError) {
                  // Victoire ! On lance l'appel vers ce partenaire
                  initiateCall(partner.user_id)
              } else {
                  // Zut, quelqu'un l'a pris avant nous, on réessaie
                  setTimeout(startSearch, 500)
              }
          } else {
              // --> CAS 2 : Personne en vue (Je m'inscris et j'ATTENDS)
              await supabase.from('random_queue').insert({ user_id: user.id })
              waitForCall()
          }
      } catch (error) {
          console.error("Erreur recherche:", error)
      }
  }

  // Cas 1 : JE SUIS L'INITIATEUR (J'appelle)
  const initiateCall = async (partnerId) => {
      isInitiator.current = true
      currentRoomId.current = `room_${user.id}_${partnerId}` // ID unique de la salle
      setupWebRTC(currentRoomId.current)
      
      // On crée l'offre SDP
      const offer = await peerConnection.current.createOffer()
      await peerConnection.current.setLocalDescription(offer)

      // On envoie l'offre via un canal Supabase dédié à cette room
      sendMessageSignal({ type: 'offer', sdp: offer, roomId: currentRoomId.current })
  }

  // Cas 2 : J'ATTENDS UN APPEL
  const waitForCall = () => {
      isInitiator.current = false
      // On écoute sur un canal personnel pour savoir si on est "choisi"
      // Note : Pour simplifier, ici on va écouter un canal global de "signaling"
      // Dans une version prod, on écouterait "user:my_id"
      
      // On s'abonne aux messages de signalisation qui me concernent
      subscribeToSignaling()
  }

  // --- SIGNALISATION (Le cerveau) ---
  const subscribeToSignaling = () => {
      // On utilise un canal global pour s'échanger les infos de connexion
      // C'est simple pour le proto, mais un peu bruyant. 
      // Idéalement : channel(`user:${user.id}`)
      
      // Ici astuce : on utilise une table 'messages' ou un channel broadcast générique
      // Pour ce code, on va utiliser le canal Broadcast Supabase 'random-signaling'
      
      signalingChannel.current = supabase.channel('random-signaling')
      
      signalingChannel.current
        .on('broadcast', { event: 'signal' }, async (payload) => {
            if (!peerConnection.current && !isInitiator.current && payload.payload.target === user.id && payload.payload.type === 'offer') {
                // ON A ÉTÉ CHOISI ! (On reçoit une offre)
                // 1. On se retire de la file d'attente (au cas où on y est encore)
                await supabase.from('random_queue').delete().eq('user_id', user.id)
                
                // 2. On accepte l'appel
                currentRoomId.current = payload.payload.roomId
                setupWebRTC(currentRoomId.current)
                
                await peerConnection.current.setRemoteDescription(new RTCSessionDescription(payload.payload.sdp))
                const answer = await peerConnection.current.createAnswer()
                await peerConnection.current.setLocalDescription(answer)
                
                sendMessageSignal({ type: 'answer', sdp: answer, roomId: currentRoomId.current })
            }
            
            // Gestion des échanges suivants (Answer et ICE Candidates)
            if (peerConnection.current && payload.payload.roomId === currentRoomId.current) {
                // Si on reçoit une réponse (pour l'initiateur)
                if (payload.payload.type === 'answer' && isInitiator.current) {
                    await peerConnection.current.setRemoteDescription(new RTCSessionDescription(payload.payload.sdp))
                }
                // Si on reçoit des candidats ICE (pour traverser les routeurs)
                if (payload.payload.type === 'ice-candidate' && peerConnection.current.remoteDescription) {
                    try {
                        await peerConnection.current.addIceCandidate(new RTCIceCandidate(payload.payload.candidate))
                    } catch (e) { console.error("Erreur ICE", e) }
                }
            }
        })
        .subscribe()
  }

  const sendMessageSignal = async (data) => {
      // On diffuse le message à tout le monde, mais seul le destinataire (target) le traitera
      // Si on est initiateur, on ne connait pas encore l'ID de l'autre pour les candidats ICE
      // C'est une simplification. En prod, on stocke l'ID du partenaire.
      
      const channel = signalingChannel.current || supabase.channel('random-signaling')
      // On attend que le canal soit prêt si nécessaire (ici on suppose qu'il l'est ou on envoie "dans le vide" le premier coup)
      // Pour l'offre, on utilise un channel temporaire si besoin.
      
      // FIX : Pour l'initiateur qui n'a pas encore souscrit
      if (!signalingChannel.current) {
          signalingChannel.current = channel
          channel.subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                 channel.send({ type: 'broadcast', event: 'signal', payload: { ...data, target: null } }) // Broadcast large pour trouver le partenaire
              }
          })
      } else {
          channel.send({ type: 'broadcast', event: 'signal', payload: { ...data } })
      }
  }

  // --- CONFIGURATION WEBRTC (Le moteur) ---
  const setupWebRTC = (roomId) => {
      setStatus('connecting')
      const pc = new RTCPeerConnection(RTC_CONFIG)
      peerConnection.current = pc

      // 1. Ajouter mon flux (Image + Son)
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream))

      // 2. Recevoir le flux de l'autre
      pc.ontrack = (event) => {
          setRemoteStream(event.streams[0])
          setStatus('connected')
      }

      // 3. Gérer les candidats ICE (les chemins réseaux)
      pc.onicecandidate = (event) => {
          if (event.candidate) {
              sendMessageSignal({ type: 'ice-candidate', candidate: event.candidate, roomId })
          }
      }
      
      // 4. Gestion Chat DataChannel (Optionnel pour le texte P2P)
      // Pour simplifier, on utilisera le canal Supabase pour le texte aussi ou on ajoute ici.
  }

  const cleanupConnection = (stopLocal = true) => {
      if (peerConnection.current) {
          peerConnection.current.close()
          peerConnection.current = null
      }
      if (signalingChannel.current) {
          supabase.removeChannel(signalingChannel.current)
          signalingChannel.current = null
      }
      // On s'assure de ne plus être dans la file
      if (user) supabase.from('random_queue').delete().eq('user_id', user.id).then()
      
      if (stopLocal && localStream) {
          localStream.getTracks().forEach(track => track.stop())
      }
  }

  // --- ACTIONS UI ---

  const handleSkip = () => {
      // On coupe tout et on relance
      cleanupConnection(false)
      startSearch()
  }

  const handleQuit = () => {
      if (window.confirm("Quitter le mode aléatoire ?")) {
          cleanupConnection(true)
          navigate('/app')
      }
  }

  // --- CHAT TEXTUEL (Simulé via Broadcast pour l'instant pour aller vite) ---
  // Note: Pour un vrai chat privé, il faudrait utiliser la dataChannel WebRTC créée ci-dessus.
  const sendChatMessage = (e) => {
      e.preventDefault()
      if (!inputText.trim()) return
      setMessages(prev => [...prev, { id: Date.now(), text: inputText, isMe: true }])
      // Envoi via signal (astuce rapide)
      if (signalingChannel.current) {
          signalingChannel.current.send({ 
              type: 'broadcast', 
              event: 'chat', 
              payload: { text: inputText, roomId: currentRoomId.current } 
          })
      }
      setInputText('')
  }
  
  // Écoute du chat
  useEffect(() => {
      if (signalingChannel.current) {
          signalingChannel.current.on('broadcast', { event: 'chat' }, (payload) => {
              if (payload.payload.roomId === currentRoomId.current) {
                  setMessages(prev => [...prev, { id: Date.now(), text: payload.payload.text, isMe: false }])
              }
          })
      }
  }, [status])


  if (!hasAcceptedRules) return <RandomWarningModal onAccept={() => setHasAcceptedRules(true)} onCancel={() => navigate('/app')} />

  return (
    <div className="h-screen w-full bg-black text-white flex overflow-hidden">
      
      {/* GAUCHE : FILTRES */}
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

      {/* CENTRE : VIDÉO */}
      <div className="flex-1 relative flex flex-col">
         <div className="md:hidden absolute top-4 left-4 z-50">
            <button onClick={handleQuit} className="p-3 bg-black/50 backdrop-blur-md rounded-full text-white border border-white/10"><ArrowLeft/></button>
         </div>

         <VideoStage localStream={localStream} remoteStream={remoteStream} isSearching={status === 'searching'} />

         <div className="h-24 bg-slate-900 border-t border-white/10 flex items-center justify-center gap-4 px-6 relative z-10">
             <button className="p-4 rounded-full bg-slate-800 text-red-500 hover:bg-red-500/10 border border-red-500/20 active:scale-95 transition" title="Signaler"><Flag size={24}/></button>
             <button 
                onClick={handleSkip} 
                className="flex-1 max-w-md py-4 bg-white text-black font-black text-xl rounded-full hover:scale-105 active:scale-95 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.3)] flex items-center justify-center gap-3"
             >
                {status === 'searching' ? <><Loader2 className="animate-spin"/> Recherche...</> : <>SKIP <SkipForward fill="black" size={24}/></>}
             </button>
         </div>
      </div>

      {/* DROITE : CHAT */}
      <div className="w-80 bg-slate-900 border-l border-white/5 flex flex-col hidden lg:flex">
         <div className="p-4 border-b border-white/10 bg-slate-800/50">
             <h3 className="font-bold text-center text-gray-300">Chat Anonyme</h3>
             <p className="text-[10px] text-center text-gray-500">{status === 'connected' ? "Connecté !" : "En attente..."}</p>
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