import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, Eye, EyeOff, Loader2, ShieldCheck, KeyRound } from 'lucide-react'

export default function UpdatePassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  // 1. SÉCURITÉ : Vérifier que l'utilisateur est bien connecté via le lien magique
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        // Si le lien est invalide ou expiré, on renvoie à l'accueil
        navigate('/') 
      }
    }
    checkSession()
  }, [navigate])

  // --- LOGIQUE FORCE MDP ---
  const getPasswordStrength = (pass) => {
    let score = 0
    if (!pass) return 0
    if (pass.length > 5) score += 1
    if (pass.length > 8) score += 1
    if (/[0-9]/.test(pass)) score += 1
    if (/[^A-Za-z0-9]/.test(pass)) score += 1
    return score
  }
  const strength = getPasswordStrength(password)
  
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

  const handleUpdate = async (e) => {
    e.preventDefault()
    setMessage({ type: '', text: '' })

    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Les mots de passe ne correspondent pas.' })
      return
    }
    if (strength < 2) {
        setMessage({ type: 'error', text: 'Mot de passe trop faible.' })
        return
    }

    setLoading(true)
    
    // Mise à jour du mot de passe
    const { error } = await supabase.auth.updateUser({ password: password })

    if (error) {
      setMessage({ type: 'error', text: error.message })
      setLoading(false)
    } else {
      // SUCCÈS : On redirige vers le Dashboard
      setMessage({ type: 'success', text: 'Mot de passe modifié avec succès ! Redirection...' })
      setTimeout(() => {
        navigate('/app')
      }, 2000)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-philo-dark px-4 relative overflow-hidden">
      {/* Fond */}
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-philo-primary/20 rounded-full blur-[100px]" />
      
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl w-full max-w-md">
        
        <div className="text-center mb-6">
          <div className="mx-auto bg-philo-primary/20 w-16 h-16 rounded-full flex items-center justify-center mb-4 text-philo-primary">
            <KeyRound size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white">Nouveau mot de passe</h1>
          <p className="text-gray-400 text-sm mt-2">Choisis un nouveau code secret pour sécuriser ton compte.</p>
        </div>

        <form onSubmit={handleUpdate} className="space-y-4">
            
            {/* Nouveau MDP */}
            <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="Nouveau mot de passe"
                    required
                    className="block w-full pl-10 pr-10 py-3 border border-white/10 rounded-xl bg-black/20 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-philo-primary transition-all"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                    {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                </button>
            </div>

            {/* Jauge */}
            <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-400 px-1">
                    <span>Force</span>
                    <span className={strength >= 3 ? "text-green-400" : "text-gray-400"}>{getStrengthLabel()}</span>
                </div>
                <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                    <motion.div className={`h-full ${getStrengthColor()}`} initial={{ width: 0 }} animate={{ width: `${(strength / 4) * 100}%` }} transition={{ duration: 0.3 }} />
                </div>
            </div>

            {/* Confirmation */}
            <div className="relative">
                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="Confirmer le mot de passe"
                    required
                    className={`block w-full pl-10 pr-3 py-3 border rounded-xl bg-black/20 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-philo-primary transition-all ${confirmPassword && password !== confirmPassword ? 'border-red-500' : 'border-white/10'}`}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                />
            </div>

            {message.text && (
                <div className={`text-sm p-3 rounded-lg text-center ${message.type === 'error' ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}`}>
                    {message.text}
                </div>
            )}

            <button type="submit" disabled={loading} className="w-full flex items-center justify-center py-3 px-4 rounded-xl text-white bg-gradient-to-r from-philo-primary to-philo-secondary hover:opacity-90 transition-all font-bold shadow-lg shadow-philo-primary/25 mt-4">
                {loading ? <Loader2 className="animate-spin" /> : "Changer le mot de passe"}
            </button>
        </form>

      </motion.div>
    </div>
  )
}