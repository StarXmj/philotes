import { Check, UserCircle, BrainCircuit, Camera, Image as ImageIcon } from 'lucide-react'
import { useOnboarding } from '../../contexts/OnboardingContext'

const AVATARS_LIST = ["avatar1.png", "avatar2.png", "avatar3.png", "avatar4.png", "avatar5.png", "avatar6.png", "avatar7.png", "avatar8.png"]

export default function AvatarStep() {
  const { avatarPublic, setAvatarPublic, realPhotoPreview, setRealPhotoPreview, setRealPhotoFile, submitFullProfile, isEditMode, loading } = useOnboarding()

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      setRealPhotoFile(file)
      setRealPhotoPreview(URL.createObjectURL(file))
    }
  }

  return (
    <div className="space-y-6 w-full max-w-lg bg-slate-900/80 backdrop-blur-md p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl">
        <div className="text-center mb-6">
            <UserCircle className="w-12 h-12 text-philo-primary mx-auto mb-3" />
            <h2 className="text-2xl font-bold text-white">Ton Visage</h2>
        </div>

        <div>
           <h3 className="text-sm font-bold text-philo-primary uppercase mb-3 flex items-center gap-2"><BrainCircuit size={14}/> Avatar Public</h3>
           <div className="grid grid-cols-4 gap-3">
              {AVATARS_LIST.map((avatar) => (
                  <button key={avatar} onClick={() => setAvatarPublic(avatar)} className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${avatarPublic === avatar ? 'border-philo-primary scale-105 shadow-[0_0_15px_rgba(139,92,246,0.5)]' : 'border-white/10 opacity-70 hover:opacity-100'}`}>
                     <img src={`/avatars/${avatar}`} alt={avatar} className="w-full h-full object-cover" />
                     {avatarPublic === avatar && <div className="absolute inset-0 bg-philo-primary/40 flex items-center justify-center"><Check className="text-white" size={24} /></div>}
                  </button>
              ))}
           </div>
        </div>

        <div className="w-full h-px bg-white/10 my-4"></div>

        <div>
           <h3 className="text-sm font-bold text-pink-400 uppercase mb-3 flex items-center gap-2"><Camera size={14}/> Vraie Photo (Amis)</h3>
           <label className="flex items-center gap-4 cursor-pointer group">
              <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-dashed border-white/20 group-hover:border-white/50 flex items-center justify-center overflow-hidden">
                 {realPhotoPreview ? <img src={realPhotoPreview} alt="Preview" className="w-full h-full object-cover" /> : <ImageIcon className="text-gray-500" size={24} />}
              </div>
              <div className="flex-1 text-sm text-gray-400 group-hover:text-white transition">Ajouter une photo privée</div>
              <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
           </label>
        </div>

        <button onClick={submitFullProfile} disabled={loading} className="w-full py-4 mt-6 bg-gradient-to-r from-philo-primary to-philo-secondary rounded-xl font-bold text-white hover:opacity-90 shadow-lg flex items-center justify-center gap-2">
            {loading ? "Chargement..." : (isEditMode ? "Sauvegarder" : "Entrer dans la constellation")} <BrainCircuit size={18}/>
        </button>
    </div>
  )
}