import { AlertTriangle, ShieldCheck, CheckCircle } from 'lucide-react'
import { motion } from 'framer-motion'

export default function RandomWarningModal({ onAccept, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        className="bg-slate-900 border border-red-500/30 rounded-2xl max-w-lg w-full p-6 shadow-[0_0_50px_rgba(239,68,68,0.2)]"
      >
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20">
            <AlertTriangle className="text-red-500" size={32} />
          </div>
          
          <h2 className="text-2xl font-bold text-white">Mode Aléatoire (Bêta)</h2>
          
          <div className="bg-white/5 p-4 rounded-xl text-left space-y-3 border border-white/10">
            <p className="text-gray-300 text-sm leading-relaxed">
              <span className="font-bold text-white">Attention :</span> Vous allez être mis en relation vidéo avec d'autres étudiants de manière aléatoire.
            </p>
            <ul className="text-sm text-gray-400 space-y-2">
              <li className="flex gap-2"><ShieldCheck className="text-philo-primary shrink-0" size={18}/> Tu es anonyme pour ton interlocuteur.</li>
              <li className="flex gap-2"><CheckCircle className="text-philo-primary shrink-0" size={18}/> Mais <span className="text-white font-bold">identifié par Philotès</span>.</li>
            </ul>
            <p className="text-red-400 text-xs font-bold bg-red-900/20 p-2 rounded border border-red-900/50">
              Tout comportement déplacé (nudité, harcèlement, violence) entraînera un bannissement définitif et immédiat de ton compte étudiant.
            </p>
          </div>

          <div className="flex gap-3 w-full pt-2">
            <button onClick={onCancel} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-gray-300 font-bold transition">
              Annuler
            </button>
            <button onClick={onAccept} className="flex-1 py-3 bg-gradient-to-r from-red-600 to-orange-600 hover:opacity-90 rounded-xl text-white font-bold transition shadow-lg">
              J'accepte & Entrer
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}