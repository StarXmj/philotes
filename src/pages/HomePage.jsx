import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkles, Globe, BrainCircuit, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  useEffect(() => {
    // 1. Si déjà connecté -> Dashboard direct
    if (user) {
        navigate('/app')
        return
    }

    // 2. DÉTECTION PWA (Mode App installée)
    // Si l'utilisateur est sur l'application installée, on saute la vitrine marketing
    // et on l'envoie direct sur l'écran de connexion/inscription.
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
    
    if (isPWA) {
        navigate('/auth')
    }

  }, [user, navigate])

  return (
    <div className="min-h-screen bg-philo-dark text-white overflow-hidden relative font-sans">
      
      {/* --- BACKGROUND ANIMÉ --- */}
      <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-philo-primary/20 rounded-full blur-[120px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-philo-secondary/20 rounded-full blur-[120px] pointer-events-none" />

      {/* --- NAV BAR SIMPLE --- */}
      <nav className="relative z-10 flex justify-between items-center p-6 max-w-7xl mx-auto">
        <div className="text-2xl font-bold tracking-tighter">
          Philotès<span className="text-philo-primary">.</span>
        </div>
        <button 
          onClick={() => navigate('/auth')} 
          className="px-5 py-2 rounded-full border border-white/10 hover:bg-white/10 transition text-sm font-medium"
        >
          Connexion
        </button>
      </nav>

      {/* --- HERO SECTION --- */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6 px-4 py-1.5 rounded-full border border-philo-primary/30 bg-philo-primary/10 text-philo-primary text-xs font-bold uppercase tracking-widest flex items-center gap-2"
        >
          <Sparkles size={14} /> Le Réseau Social Étudiant 2.0
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6 leading-tight"
        >
          Ton Campus,<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-philo-primary via-purple-400 to-philo-secondary">
            Ton Univers.
          </span>
        </motion.h1>

        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-gray-400 text-lg md:text-xl max-w-2xl mb-12 leading-relaxed"
        >
          Fini le swipe superficiel. Découvre les étudiants autour de toi sous forme de <span className="text-white font-medium">constellation 3D</span> basée sur ta personnalité, tes études et tes vibes.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <button 
            onClick={() => navigate('/auth')}
            className="group relative px-8 py-4 bg-white text-black rounded-full font-bold text-lg md:text-xl flex items-center gap-3 shadow-[0_0_40px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_rgba(255,255,255,0.5)] hover:scale-105 transition-all duration-300"
          >
            Entrer dans l'Univers
            <div className="bg-black text-white p-1 rounded-full group-hover:rotate-[-45deg] transition-transform duration-300">
                <ArrowRight size={20} />
            </div>
          </button>
        </motion.div>

        <motion.div 
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           transition={{ duration: 1, delay: 1 }}
           className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl w-full text-left"
        >
            <FeatureCard icon={<Globe className="text-blue-400" />} title="Constellation 3D" desc="Visualise ton campus comme une galaxie. Plus tu es proche, plus ça matche." />
            <FeatureCard icon={<BrainCircuit className="text-purple-400" />} title="Match par Vibes" desc="Un algorithme qui connecte les personnalités, pas juste les visages." />
            <FeatureCard icon={<Users className="text-pink-400" />} title="100% Étudiants" desc="Un réseau sécurisé et exclusif, vérifié par ton email universitaire." />
        </motion.div>

      </main>

      <footer className="relative z-10 py-6 text-center text-gray-600 text-xs">
        © 2024 Philotès. Connecte-toi à l'essentiel.
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, desc }) {
    return (
        <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-sm hover:bg-white/10 transition duration-300">
            <div className="mb-4 bg-white/10 w-fit p-3 rounded-xl">{icon}</div>
            <h3 className="text-lg font-bold mb-2 text-white">{title}</h3>
            <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
        </div>
    )
}