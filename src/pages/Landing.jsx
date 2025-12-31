import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Smartphone, Download, Apple, Play, 
  Mail, Lock, CheckCircle, ShieldCheck, Loader2, ArrowLeft 
} from 'lucide-react'

export default function Landing() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // États Auth
  const [mode, setMode] = useState('login') 
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)
  const [allowedDomains, setAllowedDomains] = useState([])

  // --- NOUVEAU : Détection PWA ---
  const [isPWA, setIsPWA] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)

  useEffect(() => {
    // Vérifier si on est en mode App (Standalone)
    const checkPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
    setIsPWA(checkPWA)

    if (user) navigate('/app')
  }, [user, navigate])

  // --- LOGIQUE PWA INSTALLATION (Seulement si pas déjà installé) ---
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      alert("Pour installer sur iOS : Appuyez sur le bouton Partager (carré avec flèche) puis sur 'Sur l'écran d'accueil'.")
      return
    }
    deferredPrompt.prompt()
    setDeferredPrompt(null)
  }

  // ... (Fetch Domains & Helpers restent identiques) ...
  useEffect(() => {
    const fetchDomains = async () => {
      try {
        const { data, error } = await supabase.from('allowed_domains').select('domain')
        if (error) throw error
        if (data) setAllowedDomains(data.map(item => item.domain))
      } catch (err) {
        setAllowedDomains(['@etud.univ-pau.fr']) 
      }
    }
    fetchDomains()
  }, [])

  const getPasswordStrength = (pass) => {
    let score = 0; if (!pass) return 0; if (pass.length > 5) score += 1; if (pass.length > 8) score += 1; if (/[0-9]/.test(pass)) score += 1; if (/[^A-Za-z0-9]/.test(pass)) score += 1; return score
  }
  const strength = getPasswordStrength(password)
  const getStrengthColor = () => { if (strength === 0) return 'bg-gray-600'; if (strength <= 2) return 'bg-red-500'; if (strength === 3) return 'bg-yellow-500'; return 'bg-green-500' }
  const getStrengthLabel = () => { if (strength <= 2) return 'Faible'; if (strength === 3) return 'Moyen'; return 'Fort 💪' }
  const isEmailAllowed = (emailToCheck) => { if (allowedDomains.length === 0) return false; return allowedDomains.some(domain => emailToCheck.endsWith(domain)) }

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError(null); setMsg(null)
    try {
      if (mode !== 'login' && !isEmailAllowed(email)) throw new Error(`Adresse non autorisée. Domaines acceptés : ${allowedDomains.join(', ')}`)

      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/update-password' })
        if (error) throw error; setMsg("Si cet email existe, un lien de récupération a été envoyé ! Vérifie tes spams.")
      }
      else if (mode === 'signup') {
        if (password !== confirmPassword) throw new Error("Les mots de passe ne correspondent pas.")
        if (strength < 2) throw new Error("Le mot de passe est trop court (6 caractères min).")
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
        if (error) throw error; if (data.user && !data.session) setMsg("Compte créé ! Va vérifier tes mails pour valider ton inscription.")
      } 
      else { 
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error; navigate('/app') 
      }
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  if (msg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-philo-dark px-4 text-white">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white/10 backdrop-blur-md p-8 rounded-2xl max-w-md text-center border border-white/10">
          <div className="mx-auto bg-green-500/20 w-16 h-16 rounded-full flex items-center justify-center mb-4"><CheckCircle className="text-green-400 w-8 h-8" /></div>
          <h2 className="text-2xl font-bold mb-2">Check tes mails !</h2>
          <p className="text-gray-300 mb-6">{msg}</p>
          <button onClick={() => { setMsg(null); setMode('login') }} className="text-philo-primary hover:underline">Retour à la connexion</button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-philo-dark text-white overflow-hidden relative">
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-philo-primary/30 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-philo-secondary/20 rounded-full blur-[100px] pointer-events-none" />

      {/* 1. VERSION MOBILE & TABLETTE (< 1024px) -> "TÉLÉCHARGER L'APP"
          CONDITION : Seulement si on n'est PAS en mode PWA (!isPWA)
      */}
      <div className={`${isPWA ? 'hidden' : 'lg:hidden'} flex flex-col items-center justify-center min-h-screen p-6 relative z-10`}>
          <div className="text-center space-y-8 max-w-md mx-auto">
              <h1 className="text-4xl font-bold tracking-tighter">Philotès<span className="text-philo-primary">.</span></h1>
              <div className="relative py-10">
                  <div className="absolute inset-0 bg-gradient-to-tr from-philo-primary to-purple-600 blur-3xl opacity-40 rounded-full animate-pulse"></div>
                  <Smartphone size={120} className="relative z-10 text-white rotate-[-12deg] drop-shadow-2xl mx-auto" />
                  <div className="absolute top-1/2 right-0 translate-x-4 -translate-y-1/2 bg-slate-800 border border-white/10 p-3 rounded-2xl shadow-xl flex items-center gap-2 animate-bounce-slow">
                      <span className="text-2xl">🎓</span>
                      <div className="text-left leading-none"><p className="text-[10px] text-gray-400 font-bold uppercase">Community</p><p className="text-sm font-bold">100% Étudiants</p></div>
                  </div>
              </div>
              <div className="space-y-4">
                  <h2 className="text-3xl font-bold leading-tight">L'expérience Philotès se vit <span className="text-transparent bg-clip-text bg-gradient-to-r from-philo-primary to-purple-400">sur ton mobile.</span></h2>
                  <p className="text-gray-400 text-sm px-4">Pour accéder au chat vidéo, à la constellation 3D et aux rencontres aléatoires, télécharge l'application officielle.</p>
              </div>
              <div className="space-y-3 w-full">
                  <button 
                    onClick={handleInstallClick} 
                    className="w-full py-4 bg-white text-black rounded-xl font-bold text-lg flex items-center justify-center gap-3 hover:scale-105 active:scale-95 transition shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                  >
                      <Download size={24} /> 
                      {deferredPrompt ? "Installer l'App" : "Télécharger l'App"}
                  </button>
                  <p className="text-[10px] text-gray-600 uppercase font-bold tracking-widest pt-4">Disponible sur</p>
                  <div className="flex justify-center gap-4 opacity-70">
                      <div className="flex items-center gap-1"><Apple size={16}/> iOS</div><div className="text-gray-700">|</div><div className="flex items-center gap-1"><Play size={16}/> Android</div>
                  </div>
              </div>
          </div>
      </div>

      {/* 2. VERSION FORMULAIRE CONNEXION
          CONDITION : Visible sur Desktop (lg:flex) OU si on est en mode PWA (isPWA)
      */}
      <div className={`${isPWA ? 'flex' : 'hidden lg:flex'} min-h-screen flex-col items-center justify-center relative z-10 px-4`}>
        <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
            <div className="text-center mb-8">
              <h1 className="text-6xl font-bold text-white mb-2 tracking-tight">Philotès<span className="text-philo-primary">.</span></h1>
              <p className="text-gray-400 text-lg">{mode === 'login' && "Ravi de te revoir 👋"}{mode === 'signup' && "Rejoins le campus 🚀"}{mode === 'forgot' && "Pas de panique 🔑"}</p>
            </div>
            <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
              {mode !== 'forgot' && (
                <div className="flex bg-black/20 rounded-xl p-1 mb-6">
                    <button onClick={() => setMode('login')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'login' ? 'bg-white/10 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}>Connexion</button>
                    <button onClick={() => setMode('signup')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'signup' ? 'bg-white/10 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}>Inscription</button>
                </div>
              )}
              {mode === 'forgot' && (
                 <button onClick={() => setMode('login')} className="mb-6 flex items-center gap-2 text-sm text-gray-400 hover:text-white transition"><ArrowLeft size={16} /> Retour</button>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Mail className="h-5 w-5 text-gray-500" /></div>
                  <input type="email" required placeholder="Email étudiant (@univ...)" className="block w-full pl-10 pr-3 py-3 border border-white/10 rounded-xl bg-black/20 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-philo-primary transition-all" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {mode !== 'forgot' && (
                    <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-gray-500" /></div>
                    <input type="password" required placeholder="Mot de passe" className="block w-full pl-10 pr-3 py-3 border border-white/10 rounded-xl bg-black/20 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-philo-primary transition-all" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                )}
                {mode === 'login' && (
                    <div className="flex justify-end"><button type="button" onClick={() => setMode('forgot')} className="text-xs text-philo-primary hover:text-philo-secondary hover:underline transition">Mot de passe oublié ?</button></div>
                )}
                <AnimatePresence>
                    {mode === 'signup' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-4 overflow-hidden">
                        <div className="space-y-1 pt-2">
                        <div className="flex justify-between text-xs text-gray-400 px-1"><span>Sécurité</span><span className={strength >= 3 ? "text-green-400" : "text-gray-400"}>{getStrengthLabel()}</span></div>
                        <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden"><motion.div className={`h-full ${getStrengthColor()}`} initial={{ width: 0 }} animate={{ width: `${(strength / 4) * 100}%` }} transition={{ duration: 0.3 }} /></div>
                        </div>
                        <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><ShieldCheck className="h-5 w-5 text-gray-500" /></div>
                        <input type="password" required placeholder="Confirmer le mot de passe" className={`block w-full pl-10 pr-3 py-3 border rounded-xl bg-black/20 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-philo-primary transition-all ${confirmPassword && password !== confirmPassword ? 'border-red-500/50 focus:border-red-500' : 'border-white/10'}`} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                        </div>
                    </motion.div>
                    )}
                </AnimatePresence>
                {error && <div className="text-red-400 text-sm bg-red-400/10 p-3 rounded-lg text-center border border-red-400/20">{error === "Invalid login credentials" ? "Email ou mot de passe incorrect" : error}</div>}
                <button type="submit" disabled={loading} className="w-full flex items-center justify-center py-3 px-4 rounded-xl text-white bg-gradient-to-r from-philo-primary to-philo-secondary hover:opacity-90 transition-all font-bold shadow-lg shadow-philo-primary/25 mt-4">
                  {loading ? <Loader2 className="animate-spin h-5 w-5" /> : (mode === 'login' ? 'Se connecter' : mode === 'signup' ? "Créer mon compte" : "Réinitialiser le mot de passe")}
                </button>
              </form>
            </div>
        </motion.div>
      </div>
    </div>
  )
}