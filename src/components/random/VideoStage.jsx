import { useEffect, useRef } from 'react'
import { User, Mic, Video as VideoIcon } from 'lucide-react' // Renommé pour éviter conflit

export default function VideoStage({ localStream, remoteStream, isSearching }) {
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)

  // Gestion du FLUX LOCAL
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  // Gestion du FLUX DISTANT (Le correctif est ici)
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log("📺 Tentative d'affichage du flux distant...", remoteStream)
      
      // On attache le flux
      remoteVideoRef.current.srcObject = remoteStream
      
      // On force la lecture (contournement sécurité navigateur)
      remoteVideoRef.current.play().catch(e => console.error("Erreur lecture auto vidéo distante:", e))

      // Debug : Vérifier si on a bien de la vidéo
      const videoTracks = remoteStream.getVideoTracks()
      if (videoTracks.length > 0) {
          console.log(`✅ ${videoTracks.length} piste(s) vidéo détectée(s), Statut: ${videoTracks[0].enabled ? 'Activé' : 'Désactivé'}`)
      } else {
          console.warn("⚠️ Aucune piste vidéo dans le flux distant !")
      }
    }
  }, [remoteStream])

  return (
    <div className="relative w-full h-full flex flex-col gap-4 p-4">
      {/* REMOTE VIDEO (PRINCIPALE) */}
      <div className="flex-1 relative bg-black rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
        {isSearching ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="w-24 h-24 border-4 border-philo-primary border-t-transparent rounded-full animate-spin mb-4"/>
            <p className="text-white font-bold animate-pulse">Recherche d'un étudiant...</p>
          </div>
        ) : remoteStream ? (
          // AJOUT DE 'key' pour forcer le re-rendu si le stream change
          <video 
            key={remoteStream.id} 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover" 
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
            <div className="text-center">
                <User size={64} className="text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">En attente de vidéo...</p>
            </div>
          </div>
        )}
        
        {/* LOCAL VIDEO (PIP - Picture in Picture) */}
        {localStream && (
            <div className="absolute bottom-4 right-4 w-32 h-48 md:w-48 md:h-32 bg-slate-800 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg z-10">
                <video 
                    ref={localVideoRef} 
                    autoPlay 
                    playsInline 
                    muted // Toujours mute sa propre vidéo sinon larsen !
                    className="w-full h-full object-cover transform scale-x-[-1]" 
                />
            </div>
        )}
      </div>

      {/* CONTROLS BAR */}
      <div className="h-16 bg-slate-900/80 backdrop-blur rounded-2xl flex items-center justify-center gap-6 border border-white/5">
         <button className="p-3 bg-white/10 rounded-full hover:bg-white/20"><Mic size={20} className="text-white"/></button>
         <button className="p-3 bg-white/10 rounded-full hover:bg-white/20"><VideoIcon size={20} className="text-white"/></button>
      </div>
    </div>
  )
}