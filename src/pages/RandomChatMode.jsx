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
  
  // Refs pour WebRTC et Logique (Synchrones)
  const localStreamRef = useRef(null) // <--- FIX: Ref pour accès immédiat au stream
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

  // 1. Démarrage Caméra
  useEffect(() => {
    if (hasAcceptedRules && !localStream) {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                // On met à jour la REF (immédiat) et le STATE (pour l'affichage)
                localStreamRef.current = stream 
                setLocalStream(stream)
                startSearch() // Maintenant startSearch pourra utiliser la ref
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
      // On ne coupe pas le flux local ici (false), on le garde pour le prochain appel
      cleanupConnection(false) 

      try {
          // A. Regarder s'il y a quelqu'un dans la file
          const { data: waitingUsers } = await supabase
              .from('random_queue')
              .select('*')
              .neq('user_id', user.id)
              .order('created_at', { ascending: true })
              .limit(1)

          if (waitingUsers && waitingUsers.length > 0) {
              const partner = waitingUsers[0]
              const { error: deleteError } = await supabase
                  .from('random_queue')
                  .delete()
                  .eq('id', partner.id)

              if (!deleteError) {
                  initiateCall(partner.user_id)
              } else {
                  setTimeout(startSearch, 500)
              }
          } else {
              await supabase.from('random_queue').insert({ user_id: user.id })
              waitForCall()
          }
      } catch (error) {
          console.error("Erreur recherche:", error)
      }
  }

  // Cas 1 : JE SUIS L'INITIATEUR
  const initiateCall = async (partnerId) => {
      isInitiator.current = true
      currentRoomId.current = `room_${user.id}_${partnerId}`
      setupWebRTC(currentRoomId.current) // <--- C'est ici que ça plantait
      
      if (!peerConnection.current) return

      const offer = await peerConnection.current.createOffer()
      await peerConnection.current.setLocalDescription(offer)

      sendMessageSignal({ type: 'offer', sdp: offer, roomId: currentRoomId.current })
  }

  // Cas 2 : J'ATTENDS UN APPEL
  const waitForCall = () => {
      isInitiator.current = false
      subscribeToSignaling()
  }

  // --- SIGNALISATION ---
  const subscribeToSignaling = () => {
      signalingChannel.current = supabase.channel('random-signaling')
      
      signalingChannel.current
        .on('broadcast', { event: 'signal' }, async (payload) => {
            // Sécurité : Vérifier si le payload est valide
            if (!payload.payload) return

            if (!peerConnection.current && !isInitiator.current && payload.payload.target === user.id && payload.payload.type === 'offer') {
                await supabase.from('random_queue').delete().eq('user_id', user.id)
                
                currentRoomId.current = payload.payload.roomId
                setupWebRTC(currentRoomId.current)
                
                if (!peerConnection.current) return

                await peerConnection.current.setRemoteDescription(new RTCSessionDescription(payload.payload.sdp))
                const answer = await peerConnection.current.createAnswer()
                await peerConnection.current.setLocalDescription(answer)
                
                sendMessageSignal({ type: 'answer', sdp: answer, roomId: currentRoomId.current })
            }
            
            if (peerConnection.current && payload.payload.roomId === currentRoomId.current) {
                if (payload.payload.type === 'answer' && isInitiator.current) {
                    await peerConnection.current.setRemoteDescription(new RTCSessionDescription(payload.payload.sdp))
                }
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
      const channel = signalingChannel.current || supabase.channel('random-signaling')
      
      if (!signalingChannel.current) {
          signalingChannel.current = channel
          channel.subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                 channel.send({ type: 'broadcast', event: 'signal', payload: { ...data, target: null } })
              }
          })
      } else {
          channel.send({ type: 'broadcast', event: 'signal', payload: { ...data } })
      }
  }

  // --- CONFIGURATION WEBRTC (CORRIGÉE AVEC REF) ---
  const setupWebRTC = (roomId) => {
      setStatus('connecting')
      
      // FIX: On utilise la REF, pas le STATE
      const stream = localStreamRef.current
      if (!stream) {
          console.error("Erreur critique: Pas de flux local disponible pour WebRTC")
          // On peut tenter de relancer la caméra ou annuler
          setStatus('idle')
          return
      }

      const pc = new RTCPeerConnection(RTC_CONFIG)
      peerConnection.current = pc

      // Ajout des pistes (Tracks)
      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      pc.ontrack = (event) => {
          setRemoteStream(event.streams[0])
          setStatus('connected')
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
      if (signalingChannel.current) {
          supabase.removeChannel(signalingChannel.current)
          signalingChannel.current = null
      }
      if (user) supabase.from('random_queue').delete().eq('user_id', user.id).then()
      
      // FIX: On utilise la REF pour couper les pistes proprement
      if (stopLocal && localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop())
          localStreamRef.current = null
          setLocalStream(null)
      }
  }

  // --- ACTIONS UI ---

  const handleSkip = () => {
      cleanupConnection(false) // On garde la cam
      startSearch()
  }

  const handleQuit = () => {
      if (window.confirm("Quitter le mode aléatoire ?")) {
          cleanupConnection(true) // On coupe tout
          navigate('/app')
      }
  }

  const sendChatMessage = (e) => {
      e.preventDefault()
      if (!inputText.trim()) return
      setMessages(prev => [...prev, { id: Date.now(), text: inputText, isMe: true }])
      
      if (signalingChannel.current) {
          signalingChannel.current.send({ 
              type: 'broadcast', 
              event: 'chat', 
              payload: { text: inputText, roomId: currentRoomId.current } 
          })
      }
      setInputText('')
  }
  
  useEffect(() => {
      if (signalingChannel.current) {
          signalingChannel.current.on('broadcast', { event: 'chat' }, (payload) => {
              if (payload.payload && payload.payload.roomId === currentRoomId.current) {
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