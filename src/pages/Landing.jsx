import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { motion } from 'framer-motion'
import { Mail, Lock, Loader2, CheckCircle, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function Landing() {
  const navigate = useNavigate()
  
  const [mode, setMode] = useState('login') // 'login' ou 'signup'
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('') // Nouveau champ
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)

  // --- CALCUL DE LA FORCE DU MOT DE PASSE ---
  const getPasswordStrength = (pass) => {
    let score = 0
    if (!pass) return 0
    if (pass.length > 5) score += 1
    if (pass.length > 8) score += 1
    if (/[0-9]/.test(pass)) score += 1 // Contient un chiffre
    if (/[^A-Za-z0-9]/.test(pass)) score += 1 // Contient un caractère spécial
    return score // Score de 0 à 4
  }

  const strength = getPasswordStrength(password)

  // Couleur de la jauge
  const getStrengthColor = () => {
    if (strength === 0) return 'bg-gray-600'
    if (strength <= 2) return 'bg-red-500'
    if (strength === 3) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getStrengthLabel = () => {
    if (strength <= 2) return 'Faible'
    if (strength === 3) return 'Moyen'
    return 'Fort 💪'
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMsg(null)

    try {
      if (mode === 'signup') {
        // --- VÉRIFICATIONS INSCRIPTION ---
        
        // 1. Les mots de passe correspondent ?
        if (password !== confirmPassword) {
          throw new Error("Les mots de passe ne correspondent pas.")
        }

        // 2. Mot de passe trop faible ?
        if (strength < 2) {
          throw new Error("Le mot de passe est trop court (6 caractères min).")
        }
        
        // 3. Email étudiant ?
        if (!email.endsWith('@etud.univ-pau.fr')) {
          throw new Error("Inscription réservée aux adresses @etud.univ-pau.fr")
        }

        const { data, error } = await supabase.auth.signUp({
          email: email,
          password: password,
          options: {
            emailRedirectTo: window.location.origin, 
          }
        })

        if (error) throw error

        if (data.user && !data.session) {
          setMsg("Compte créé ! Va vérifier tes mails pour valider ton inscription.")
        }

      } else {
        // --- CONNEXION (Simple) ---
        const { error } = await supabase.auth.signInWithPassword({
          email: email,
          password: password,
        })
        if (error) throw error
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // --- Écran de succès Inscription ---
  if (msg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-philo-dark px-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/10 backdrop-blur-md p-8 rounded-2xl max-w-md text-center border border-white/10"
        >
          <div className="mx-auto bg-green-500/20 w-16 h-16 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="text-green-400 w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Presque fini !</h2>
          <p className="text-gray-300 mb-6">{msg}</p>
          <button onClick={() => { setMsg(null); setMode('login') }} className="text-philo-primary hover:underline">
            Retour à la connexion
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-philo-dark px-4 relative overflow-hidden">
      
      {/* Fond */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-philo-primary/30 rounded-full blur-[100px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-philo-secondary/20 rounded-full blur-[100px]" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2 tracking-tight">
            Philotès<span className="text-philo-primary">.</span>
          </h1>
          <p className="text-gray-400">
            {mode === 'login' ? "Ravi de te revoir 👋" : "Rejoins le campus 🚀"}
          </p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl">
          
          {/* Onglets */}
          <div className="flex bg-black/20 rounded-xl p-1 mb-6">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'login' ? 'bg-white/10 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Connexion
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'signup' ? 'bg-white/10 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Inscription
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Email */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-500" />
              </div>
              <input
                type="email" required
                placeholder="Email étudiant (@univ...)"
                className="block w-full pl-10 pr-3 py-3 border border-white/10 rounded-xl bg-black/20 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-philo-primary transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* Mot de passe Principal */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-500" />
              </div>
              <input
                type="password" required
                placeholder="Mot de passe"
                className="block w-full pl-10 pr-3 py-3 border border-white/10 rounded-xl bg-black/20 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-philo-primary transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {/* SECTION SPÉCIALE INSCRIPTION : Jauge + Confirmation */}
            {mode === 'signup' && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-4"
              >
                {/* La Jauge de force */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-400 px-1">
                    <span>Sécurité</span>
                    <span className={strength >= 3 ? "text-green-400" : "text-gray-400"}>
                      {getStrengthLabel()}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden">
                    <motion.div 
                      className={`h-full ${getStrengthColor()}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${(strength / 4) * 100}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>

                {/* Champ Confirmation */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <ShieldCheck className="h-5 w-5 text-gray-500" />
                  </div>
                  <input
                    type="password" required
                    placeholder="Confirmer le mot de passe"
                    className={`block w-full pl-10 pr-3 py-3 border rounded-xl bg-black/20 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-philo-primary transition-all ${
                      confirmPassword && password !== confirmPassword 
                        ? 'border-red-500/50 focus:border-red-500' 
                        : 'border-white/10'
                    }`}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </motion.div>
            )}

            {error && (
              <div className="text-red-400 text-sm bg-red-400/10 p-3 rounded-lg text-center border border-red-400/20">
                {error === "Invalid login credentials" ? "Email ou mot de passe incorrect" : error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center py-3 px-4 rounded-xl text-white bg-gradient-to-r from-philo-primary to-philo-secondary hover:opacity-90 transition-all font-bold shadow-lg shadow-philo-primary/25 mt-4"
            >
              {loading ? <Loader2 className="animate-spin h-5 w-5" /> : (mode === 'login' ? 'Se connecter' : "Créer mon compte")}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}