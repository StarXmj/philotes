import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { generateProfileVector } from '../lib/ai' 
import { useAuth } from '../contexts/AuthContext' // <--- 1. IMPORT ESSENTIEL POUR LA MISE À JOUR GLOBALE
import { ArrowLeft, Save, GraduationCap, MapPin, User, BrainCircuit, Loader2, Sparkles, Lock, KeyRound, ShieldCheck, AlertCircle, CheckCircle, Image as ImageIcon, Check, Trash2, Eye, EyeOff } from 'lucide-react'
import { motion } from 'framer-motion'

const CAMPUS_LIST = ["Pau", "Bayonne", "Anglet", "Tarbes", "Mont-de-Marsan"]

const AVATARS_LIST = [
  "avatar1.png", "avatar2.png", "avatar3.png", "avatar4.png", 
  "avatar5.png", "avatar6.png", "avatar7.png", "avatar8.png"
]

export default function Profile() {
  const navigate = useNavigate()
  
  // 2. RÉCUPÉRATION DE LA FONCTION DE MISE À JOUR GLOBALE
  const { updateProfile } = useAuth() 

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState(null)
  
  // --- ÉTAT DIRTY (MODIFIÉ) ---
  const [hasChanges, setHasChanges] = useState(false)

  // --- ÉTATS ---
  const [pseudo, setPseudo] = useState('')
  const [sexe, setSexe] = useState('')
  const [birthDate, setBirthDate] = useState('')
  
  const [selectedPublicAvatar, setSelectedPublicAvatar] = useState(AVATARS_LIST[0])
  const [realPhotoFile, setRealPhotoFile] = useState(null)
  const [realPhotoPreview, setRealPhotoPreview] = useState(null)
  const [currentRealPhotoUrl, setCurrentRealPhotoUrl] = useState(null)
  
  const oldPhotoUrlRef = useRef(null)

  const [formationsData, setFormationsData] = useState([])
  const [selectedEtude, setSelectedEtude] = useState('')
  const [selectedTheme, setSelectedTheme] = useState('')
  const [selectedAnnee, setSelectedAnnee] = useState('')
  const [selectedNom, setSelectedNom] = useState('')
  const [selectedParcours, setSelectedParcours] = useState('')
  const [selectedLieu, setSelectedLieu] = useState('')

  const [myVibes, setMyVibes] = useState([])

  // Password
  const [isEditingPassword, setIsEditingPassword] = useState(false)
  const [passwordData, setPasswordData] = useState({ new: '', confirm: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [passMessage, setPassMessage] = useState({ type: '', text: '' })
  const [passLoading, setPassLoading] = useState(false)

  const getPasswordStrength = (pass) => {
    let score = 0
    if (!pass) return 0
    if (pass.length > 5) score += 1
    if (pass.length > 8) score += 1
    if (/[0-9]/.test(pass)) score += 1
    if (/[^A-Za-z0-9]/.test(pass)) score += 1
    return score
  }
  const strength = getPasswordStrength(passwordData.new)
  
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

  // 1. CHARGEMENT
  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return navigate('/')
      setUser(user)

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

      if (profile) {
        setPseudo(profile.pseudo || '')
        setSexe(profile.sexe || '')
        setBirthDate(profile.date_naissance || '')
        setSelectedEtude(profile.type_diplome || '')
        setSelectedTheme(profile.domaine || '')
        setSelectedAnnee(profile.annee_etude || '')
        setSelectedNom(profile.intitule || '')
        setSelectedParcours(profile.parcours || '')
        setSelectedLieu(profile.etudes_lieu || '')
        
        if (profile.avatar_public) setSelectedPublicAvatar(profile.avatar_public)
        if (profile.avatar_prive) {
            setCurrentRealPhotoUrl(profile.avatar_prive)
            oldPhotoUrlRef.current = profile.avatar_prive
        }
      }

      const { data: answers } = await supabase.from('user_answers').select(`question_id,questions(text),options(text)`).eq('user_id', user.id)
      if (answers) {
        const formattedVibes = answers.map(a => ({ question: a.questions?.text, answer: a.options?.text }))
        setMyVibes(formattedVibes)
      }

      const { data: form } = await supabase.from('formations').select('*')
      setFormationsData(form || [])
      
      setLoading(false)
    }
    loadProfile()
  }, [navigate])

  // --- PROTECTION NAVIGATION ---
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasChanges])

  const handleBack = () => {
      if (hasChanges) {
          if (window.confirm("Modifications non enregistrées. Quitter quand même ?")) navigate('/app')
      } else {
          navigate('/app')
      }
  }

  const markChanged = () => { if (!hasChanges) setHasChanges(true) }

  // --- LOGIQUE PHOTO ---
  const handlePhotoUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      setRealPhotoFile(file)
      setRealPhotoPreview(URL.createObjectURL(file))
      markChanged()
    }
  }

  const handleRemovePhoto = () => {
    setRealPhotoFile(null)
    setRealPhotoPreview(null)
    setCurrentRealPhotoUrl(null)
    markChanged()
  }

  const deleteOldAvatar = async () => {
    const oldUrl = oldPhotoUrlRef.current
    if (!oldUrl) return
    const parts = oldUrl.split('/')
    const fileName = parts[parts.length - 1]
    if (fileName) await supabase.storage.from('profiles').remove([fileName])
  }

  // --- SAUVEGARDE (AVEC RECALCUL VECTORIEL & MISE À JOUR GLOBALE) ---
  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
        let finalPrivateUrl = currentRealPhotoUrl
        
        // A. Nouvelle photo
        if (realPhotoFile) {
            await deleteOldAvatar()
            const fileExt = realPhotoFile.name.split('.').pop()
            const fileName = `${user.id}-${Date.now()}.${fileExt}`
            const { error: uploadError } = await supabase.storage.from('profiles').upload(fileName, realPhotoFile)
            if (uploadError) throw uploadError
            
            const { data: { publicUrl } } = supabase.storage.from('profiles').getPublicUrl(fileName)
            finalPrivateUrl = publicUrl
            oldPhotoUrlRef.current = publicUrl
        } 
        // B. Suppression photo
        else if (currentRealPhotoUrl === null && oldPhotoUrlRef.current) {
            await deleteOldAvatar()
            finalPrivateUrl = null
            oldPhotoUrlRef.current = null
        }

        // --- 2. CALCUL DU VECTEUR IA ---
        const vibesText = myVibes.map(v => v.answer).join(". ")
        const narrative = `Étudiant en ${selectedEtude} ${selectedTheme}, ${selectedNom}. Campus : ${selectedLieu}. Genre : ${sexe}. Personnalité : ${vibesText}.`
        
        const vector = await generateProfileVector(narrative)

        // --- 3. MISE À JOUR SQL ---
        const { error } = await supabase.from('profiles').update({
            pseudo, sexe, type_diplome: selectedEtude, domaine: selectedTheme, 
            annee_etude: selectedAnnee, intitule: selectedNom, parcours: selectedParcours || null, 
            etudes_lieu: selectedLieu, avatar_public: selectedPublicAvatar, avatar_prive: finalPrivateUrl,
            embedding: vector 
        }).eq('id', user.id)

        if (error) throw error

        // --- 4. MISE À JOUR DU CONTEXTE GLOBAL (Le Fix !) ---
        // On récupère le profil à jour pour synchroniser toute l'appli
        const { data: freshProfile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        if (freshProfile) {
            updateProfile(freshProfile) // Met à jour le contexte et le localStorage
        }
        
        setHasChanges(false)
        alert("Profil et Univers IA mis à jour avec succès !")

    } catch (error) {
        console.error(error)
        alert("Erreur : " + error.message)
    } finally {
        setSaving(false)
    }
  }

  const handleUpdatePassword = async (e) => {
    e.preventDefault()
    if (strength < 2 || passwordData.new !== passwordData.confirm) return
    setPassLoading(true)
    const { error } = await supabase.auth.updateUser({ password: passwordData.new })
    if (error) setPassMessage({ type: 'error', text: error.message })
    else {
        setPassMessage({ type: 'success', text: "Mot de passe mis à jour !" })
        setIsEditingPassword(false)
        setPasswordData({ new: '', confirm: '' })
    }
    setPassLoading(false)
  }

  const handleRetakeQuiz = () => {
      if (hasChanges && !window.confirm("Sauvegarder avant de partir ?")) return
      navigate('/onboarding', { state: { mode: 'quiz_only' } })
  }

  const etudesOpts = [...new Set(formationsData.map(f => f.etude))].filter(Boolean).sort()
  const themesOpts = [...new Set(formationsData.filter(f => f.etude === selectedEtude).map(f => f.theme))].filter(Boolean).sort()
  const anneesOpts = [...new Set(formationsData.filter(f => f.etude === selectedEtude && f.theme === selectedTheme).map(f => f.annee))].filter(Boolean).sort()
  const nomsOpts = [...new Set(formationsData.filter(f => f.etude === selectedEtude && f.theme === selectedTheme && f.annee === selectedAnnee).map(f => f.nom))].filter(Boolean).sort()
  const parcoursOpts = [...new Set(formationsData.filter(f => f.etude === selectedEtude && f.theme === selectedTheme && f.annee === selectedAnnee && f.nom === selectedNom).map(f => f.parcours))].filter(Boolean).sort()
  const selectStyle = "w-full p-3 rounded-xl bg-slate-800 border border-slate-600 text-white focus:border-philo-primary focus:outline-none appearance-none cursor-pointer placeholder-gray-400"

  if (loading) return <div className="min-h-screen bg-philo-dark flex items-center justify-center text-white"><Loader2 className="animate-spin mr-2"/> Chargement...</div>

  return (
    <div className="min-h-screen bg-philo-dark p-6 md:p-10 text-white pb-32">
      <div className="max-w-3xl mx-auto space-y-8">
        
        <div className="flex items-center gap-4">
          <button onClick={handleBack} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-3xl font-bold">Mon Profil</h1>
        </div>

        <form id="main-profile-form" onSubmit={handleSaveProfile} className="space-y-8">
           {/* SECTION MOI */}
           <div className="bg-white/5 p-6 rounded-3xl border border-white/10 shadow-lg">
            <div className="flex items-center gap-2 mb-6 text-philo-primary">
              <User size={24} /> <h2 className="font-bold uppercase text-sm tracking-wider">Moi</h2>
            </div>

            <div className="mb-8 space-y-6">
                {/* Public Avatar */}
                <div>
                    <label className="text-xs text-gray-400 uppercase block mb-3 font-bold">Avatar Public</label>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                        {AVATARS_LIST.map((avatar) => (
                            <button key={avatar} type="button" onClick={() => { setSelectedPublicAvatar(avatar); markChanged(); }} className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${selectedPublicAvatar === avatar ? 'border-philo-primary scale-110 z-10' : 'border-white/10 opacity-60 hover:opacity-100'}`}>
                                <img src={`/avatars/${avatar}`} alt={avatar} className="w-full h-full object-cover" />
                                {selectedPublicAvatar === avatar && <div className="absolute inset-0 bg-philo-primary/30 flex items-center justify-center"><Check className="text-white" size={16} /></div>}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Real Photo */}
                <div>
                    <label className="text-xs text-gray-400 uppercase block mb-3 font-bold">Vraie Photo</label>
                    <div className="flex gap-2 items-stretch">
                        <label className={`flex-1 flex items-center gap-4 cursor-pointer group bg-black/20 p-3 rounded-xl border border-white/5 hover:bg-black/40 hover:border-white/20 transition`}>
                            <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-dashed border-white/20 flex items-center justify-center overflow-hidden shrink-0">
                                {realPhotoPreview ? <img src={realPhotoPreview} className="w-full h-full object-cover"/> : currentRealPhotoUrl ? <img src={currentRealPhotoUrl} className="w-full h-full object-cover"/> : <ImageIcon className="text-gray-500" size={20}/>}
                            </div>
                            <div className="flex-1">
                                <div className="text-white font-medium text-sm">{realPhotoPreview || currentRealPhotoUrl ? "Changer" : "Ajouter"}</div>
                                <div className="text-gray-500 text-xs">Visible uniquement par amis</div>
                            </div>
                            <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                        </label>
                        {(realPhotoPreview || currentRealPhotoUrl) && (
                            <button type="button" onClick={handleRemovePhoto} className="px-4 flex flex-col items-center justify-center bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-red-400 transition">
                                <Trash2 size={20} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="w-full h-px bg-white/10 my-6"></div>

            <div className="grid gap-6">
              <div>
                <label className="text-xs text-gray-400 uppercase block mb-1">Pseudo</label>
                <input type="text" required value={pseudo} onChange={e => { setPseudo(e.target.value); markChanged(); }} className="w-full bg-slate-800 border border-slate-600 rounded-xl p-3 text-white focus:border-philo-primary focus:outline-none" />
              </div>
              <div className="flex gap-4">
                <div className="w-1/2">
                  <label className="text-xs text-gray-400 uppercase block mb-1">Genre</label>
                  <select required value={sexe} onChange={e => { setSexe(e.target.value); markChanged(); }} className={selectStyle}>
                    <option value="Homme">Homme</option><option value="Femme">Femme</option><option value="Autre">Autre</option>
                  </select>
                </div>
                <div className="w-1/2">
                  <label className="text-xs text-gray-400 uppercase block mb-1 flex justify-between">Naissance <Lock size={10}/></label>
                  <input type="date" value={birthDate} disabled className={`${selectStyle} opacity-50 cursor-not-allowed`} />
                </div>
              </div>
            </div>
          </div>

          {/* FAC */}
          <div className="bg-white/5 p-6 rounded-3xl border border-white/10 shadow-lg">
            <div className="flex items-center gap-2 mb-6 text-philo-secondary"><GraduationCap size={24} /> <h2 className="font-bold uppercase text-sm tracking-wider">Ma Fac</h2></div>
            <div className="space-y-4">
               <div>
                  <label className="text-xs text-gray-400 block mb-1">Diplôme</label>
                  <select required value={selectedEtude} onChange={e => { setSelectedEtude(e.target.value); setSelectedTheme(''); markChanged(); }} className={selectStyle}>
                    {etudesOpts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs text-gray-400 block mb-1">Domaine</label>
                    <select required value={selectedTheme} onChange={e => { setSelectedTheme(e.target.value); setSelectedAnnee(''); markChanged(); }} className={selectStyle}>
                      {themesOpts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                 </div>
                 {!selectedEtude.includes('Doctora') && (
                    <div>
                        <label className="text-xs text-gray-400 block mb-1">Année</label>
                        <select required value={selectedAnnee} onChange={e => { setSelectedAnnee(e.target.value); setSelectedNom(''); markChanged(); }} className={selectStyle}>
                        {anneesOpts.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                 )}
               </div>
               <div>
                  <label className="text-xs text-gray-400 block mb-1">{selectedEtude.includes('Doctora') ? "Matière / Sujet" : "Intitulé Exact"}</label>
                  {selectedEtude.includes('Doctora') ? (
                      <input type="text" value={selectedNom} onChange={e => { setSelectedNom(e.target.value); markChanged(); }} className={selectStyle} />
                  ) : (
                      <select required value={selectedNom} onChange={e => { setSelectedNom(e.target.value); setSelectedParcours(''); markChanged(); }} className={selectStyle}>
                        {nomsOpts.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                  )}
               </div>
               {(parcoursOpts.length > 0 || selectedEtude.includes('Doctora')) && (
                 <div>
                    <label className="text-xs text-gray-400 block mb-1">{selectedEtude.includes('Doctora') ? "Nom de la thèse" : "Option / Parcours"}</label>
                    {selectedEtude.includes('Doctora') ? (
                        <input type="text" value={selectedParcours} onChange={e => { setSelectedParcours(e.target.value); markChanged(); }} className={selectStyle} />
                    ) : (
                        <select value={selectedParcours} onChange={e => { setSelectedParcours(e.target.value); markChanged(); }} className={selectStyle}>
                        <option value="">(Aucune)</option>
                        {parcoursOpts.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    )}
                 </div>
               )}
               <div>
                  <label className="text-xs text-gray-400 block mb-1 flex items-center gap-1"><MapPin size={12}/> Campus</label>
                  <select required value={selectedLieu} onChange={e => { setSelectedLieu(e.target.value); markChanged(); }} className={selectStyle}>
                    {CAMPUS_LIST.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
               </div>
            </div>
          </div>
        </form>

        {/* VIBES */}
        <div className="bg-gradient-to-br from-purple-900/40 to-blue-900/40 p-6 rounded-3xl border border-white/10 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2 text-purple-300"><BrainCircuit size={24} /> <h2 className="font-bold uppercase text-sm tracking-wider">Ma Personnalité</h2></div>
            <button type="button" onClick={handleRetakeQuiz} className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 rounded-xl text-xs font-bold text-purple-200 transition flex items-center gap-2">
              <Sparkles size={14} /> Refaire le test
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {myVibes.map((vibe, idx) => (
              <div key={idx} className="bg-black/30 border border-white/10 rounded-xl p-3">
                <p className="text-[10px] uppercase text-philo-primary font-bold mb-1 opacity-70">{vibe.question}</p>
                <p className="text-sm font-medium text-white">{vibe.answer}</p>
              </div>
            ))}
          </div>
        </div>

        {/* SECU */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-4 text-red-400"><ShieldCheck size={24} /> <h2 className="font-bold uppercase text-sm tracking-wider">Sécurité</h2></div>
            {!isEditingPassword ? (
                <button type="button" onClick={() => setIsEditingPassword(true)} className="w-full flex items-center justify-between p-4 bg-black/20 hover:bg-black/40 border border-white/5 rounded-xl transition group">
                    <div className="flex items-center gap-3"><div className="p-2 bg-white/5 rounded-lg text-gray-400 group-hover:text-white transition"><KeyRound size={20} /></div><div className="text-left"><p className="font-bold text-sm text-gray-200">Mot de passe</p><p className="text-xs text-gray-500">********</p></div></div>
                    <span className="text-xs font-bold text-philo-primary bg-philo-primary/10 px-3 py-1 rounded-full border border-philo-primary/20">Modifier</span>
                </button>
            ) : (
                <form onSubmit={handleUpdatePassword} className="bg-black/20 p-4 rounded-xl border border-white/10 space-y-4">
                    <div className="flex justify-between items-center mb-2"><h3 className="font-bold text-sm text-white">Nouveau mot de passe</h3><button type="button" onClick={() => setIsEditingPassword(false)} className="text-xs text-red-400 hover:underline">Annuler</button></div>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                        <input type={showPassword ? "text" : "password"} placeholder="Nouveau mot de passe" value={passwordData.new} onChange={(e) => setPasswordData({...passwordData, new: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-lg py-3 pl-10 pr-10 text-sm text-white focus:border-philo-primary outline-none transition" />
                         <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-gray-400 px-1"><span>Force</span><span className={strength >= 3 ? "text-green-400" : "text-gray-400"}>{getStrengthLabel()}</span></div>
                      <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden"><motion.div className={`h-full ${getStrengthColor()}`} initial={{ width: 0 }} animate={{ width: `${(strength / 4) * 100}%` }} transition={{ duration: 0.3 }} /></div>
                    </div>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                        <input type={showPassword ? "text" : "password"} placeholder="Confirmer le mot de passe" value={passwordData.confirm} onChange={(e) => setPasswordData({...passwordData, confirm: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-lg py-3 pl-10 pr-10 text-sm text-white focus:border-philo-primary outline-none transition" />
                    </div>
                    {passMessage.text && (<div className={`text-xs p-3 rounded-lg flex items-center gap-2 ${passMessage.type === 'error' ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-green-500/20 text-green-300 border border-green-500/30'}`}>{passMessage.type === 'error' ? <AlertCircle size={14}/> : <CheckCircle size={14}/>}{passMessage.text}</div>)}
                    <button disabled={passLoading || !passwordData.new} type="submit" className="w-full py-3 bg-red-500/80 hover:bg-red-500 rounded-lg font-bold text-white transition flex items-center justify-center gap-2 disabled:opacity-50">{passLoading ? 'Mise à jour...' : 'Enregistrer le mot de passe'}</button>
                </form>
            )}
        </div>

        <div className="sticky bottom-6 pt-4">
           <div className="absolute inset-0 bg-gradient-to-t from-philo-dark via-philo-dark to-transparent -z-10 h-24 -top-10" />
          <button type="submit" form="main-profile-form" disabled={saving} className="w-full py-4 bg-gradient-to-r from-philo-primary to-philo-secondary rounded-2xl font-bold text-white shadow-xl hover:opacity-90 transition-all flex items-center justify-center gap-2">
            {saving ? <Loader2 className="animate-spin"/> : <Save size={20} />} Enregistrer les modifications
          </button>
        </div>

      </div>
    </div>
  )
}