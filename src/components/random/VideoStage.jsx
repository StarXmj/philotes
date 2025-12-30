import { useEffect, useRef } from 'react'
import { User, Mic, Video as VideoIcon } from 'lucide-react'

export default function VideoStage({ localStream, remoteStream, isSearching }) {
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)

  // Gestion du FLUX LOCAL
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  // Gestion du FLUX DISTANT (Version Robuste)
  useEffect(() => {
    const videoEl = remoteVideoRef.current
    if (videoEl && remoteStream) {
      console.log("📺 Mise à jour de la source vidéo distante...", remoteStream.id)
      
      // 1. Assigner le stream
      videoEl.srcObject = remoteStream
      
      // 2. Fonction pour lancer la lecture de force
      const handlePlay = async () => {
          try {
              await videoEl.play()
              console.log("▶️ Lecture vidéo lancée avec succès")
          } catch (err) {
              console.error("❌ Erreur lecture vidéo (Autoplay bloqué ?):", err)
          }
      }

      // 3. Attendre que les métadonnées soient chargées avant de jouer
      videoEl.onloadedmetadata = handlePlay
      
      // Fallback : essayer de jouer tout de suite au cas où
      handlePlay()

      // Debug Tracks
      const tracks = remoteStream.getVideoTracks()
      if (tracks.length > 0) {
          console.log(`info Piste vidéo: ${tracks[0].label}, Enabled: ${tracks[0].enabled}, Muted: ${tracks[0].muted}`)
          // Si la piste est "muted", c'est souvent un problème réseau (pas de données reçues)
          tracks[0].onunmute = () => console.log("✅ Piste vidéo unmuted (données reçues)")
          tracks[0].onmute = () => console.warn("⚠️ Piste vidéo muted (plus de données)")
      }
    }
  }, [remoteStream])

  return (
    <div className="relative w-full h-full flex flex-col gap-4 p-4">
      
      {/* REMOTE VIDEO */}
      <div className="flex-1 relative bg-black rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
        {isSearching ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm z-20">
            <div className="w-24 h-24 border-4 border-philo-primary border-t-transparent rounded-full animate-spin mb-4"/>
            <p className="text-white font-bold animate-pulse">Recherche d'un étudiant...</p>
          </div>
        ) : (
          /* Ajout de playsInline, autoPlay et key pour forcer le refresh */
          <video 
            ref={remoteVideoRef} 
            key={remoteStream ? remoteStream.id : 'no-stream'}
            autoPlay 
            playsInline 
            className="w-full h-full object-cover bg-black"
          />
        )}

        {/* Placeholder si pas de vidéo active */}
        {!remoteStream && !isSearching && (
             <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-10">
                <div className="text-center opacity-50">
                    <User size={64} className="mx-auto mb-2"/>
                    <p>En attente de connexion vidéo...</p>
                </div>
             </div>
        )}
        
        {/* LOCAL VIDEO (PIP) */}
        {localStream && (
            <div className="absolute bottom-4 right-4 w-32 h-48 md:w-48 md:h-32 bg-slate-800 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg z-30">
                <video 
                    ref={localVideoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover transform scale-x-[-1]" 
                />
            </div>
        )}
      </div>

      {/* CONTROLS */}
      <div className="h-16 bg-slate-900/80 backdrop-blur rounded-2xl flex items-center justify-center gap-6 border border-white/5">
         <button className="p-3 bg-white/10 rounded-full hover:bg-white/20"><Mic size={20} className="text-white"/></button>
         <button className="p-3 bg-white/10 rounded-full hover:bg-white/20"><VideoIcon size={20} className="text-white"/></button>
      </div>
    </div>
  )
}