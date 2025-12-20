import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { generateProfileVector } from '../lib/ai'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ArrowLeft, GraduationCap, UserCircle, BrainCircuit, Camera, Image as ImageIcon, Check } from 'lucide-react'

const CAMPUS_LIST = ["Pau", "Bayonne", "Anglet", "Tarbes", "Mont-de-Marsan"]

const AVATARS_LIST = [
  "avatar1.png", "avatar2.png", "avatar3.png", "avatar4.png", 
  "avatar5.png", "avatar6.png", "avatar7.png", "avatar8.png"
]

const LOADING_PHRASES = [
  "Connexion au cerveau de Philotès... 🧠",
  "Analyse sémantique de ton profil... 🧐",
  "Vectorisation de ta personnalité... 📐",
  "Calcul de tes coordonnées sociales... 🛰️",
  "Sauvegarde de tes réponses... 💾",
  "Alignement des planètes... ✨",
  "Sauvegarde dans la constellation... 🚀"
]

export default function Onboarding() {
  const navigate = useNavigate()
  const location = useLocation()
  
  const isEditMode = location.state?.mode === 'edit'
  // NOUVEAU : Mode "Juste le test" (venant du profil)
  const isQuizOnly = location.state?.mode === 'quiz_only' 

  // --- ÉTATS ---
  const [loading, setLoading] = useState(true)
  const [loadingText, setLoadingText] = useState(LOADING_PHRASES[0])
  
  // Quiz
  const [dbQuestions, setDbQuestions] = useState([]) 
  const [currentQuestion, setCurrentQuestion] = useState(null) 
  const [answersText, setAnswersText] = useState([]) 
  const [recordedAnswers, setRecordedAnswers] = useState([]) 
  const [questionHistory, setQuestionHistory] = useState([]) 
  const [isQuestionnaireDone, setIsQuestionnaireDone] = useState(false)

  // Navigation Formulaire
  const [formStep, setFormStep] = useState('info') 

  // Données Formulaire
  const [pseudo, setPseudo] = useState('')
  const [sexe, setSexe] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [formationsData, setFormationsData] = useState([])
  
  // Sélections Scolaires
  const [selectedEtude, setSelectedEtude] = useState('')
  const [selectedTheme, setSelectedTheme] = useState('')
  const [selectedAnnee, setSelectedAnnee] = useState('')
  const [selectedNom, setSelectedNom] = useState('')
  const [selectedParcours, setSelectedParcours] = useState('')
  const [selectedLieu, setSelectedLieu] = useState('')

  // AVATARS
  const [selectedPublicAvatar, setSelectedPublicAvatar] = useState(AVATARS_LIST[0]) 
  const [realPhotoFile, setRealPhotoFile] = useState(null)
  const [realPhotoPreview, setRealPhotoPreview] = useState(null)

  const isDoctorat = (val) => val && val.includes('Doctora')

  useEffect(() => {
    let interval
    if (loading) {
      let i = 0
      interval = setInterval(() => {
        i = (i + 1) % LOADING_PHRASES.length
        setLoadingText(LOADING_PHRASES[i])
      }, 800)
    }
    return () => clearInterval(interval)
  }, [loading])

  // CHARGEMENT INITIAL
  useEffect(() => {
    const initData = async () => {
      setLoading(true)
      
      const { data: { user } } = await supabase.auth.getUser()
      const { data: form } = await supabase.from('formations').select('*')
      setFormationsData(form || [])

      const { data: quest } = await supabase
        .from('questions')
        .select(`id, text, order, depends_on_option_id, options ( id, text )`)
        .order('order', { ascending: true })

      if (quest && quest.length > 0) {
        setDbQuestions(quest)
        const firstQ = quest.find(q => q.depends_on_option_id === null)
        setCurrentQuestion(firstQ)
      }

      // Pré-remplissage (utile si on refait le onboarding complet, moins critique pour quiz_only)
      if ((isEditMode || isQuizOnly) && user) {
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
        }
      }

      setLoading(false)
    }
    initData()
  }, [isEditMode, isQuizOnly])

  // --- NAVIGATION QUIZ ---
  const handleAnswer = (option) => {
    // 1. Sauvegarde locale de la réponse
    const newHistory = [...questionHistory, currentQuestion]
    const newAnswersText = [...answersText, option.text]
    const newRecordedAnswers = [...recordedAnswers, { question_id: currentQuestion.id, option_id: option.id }]

    setQuestionHistory(newHistory)
    setAnswersText(newAnswersText)
    setRecordedAnswers(newRecordedAnswers)

    // 2. Calculer la prochaine question
    const childQuestion = dbQuestions.find(q => q.depends_on_option_id === option.id)

    if (childQuestion) {
      setCurrentQuestion(childQuestion)
    } else {
      const currentOrder = currentQuestion.order
      const nextGeneralQuestion = dbQuestions
        .filter(q => q.depends_on_option_id === null && q.order > currentOrder)
        .sort((a, b) => a.order - b.order)[0]

      if (nextGeneralQuestion) {
        setCurrentQuestion(nextGeneralQuestion)
      } else {
        // C'EST LA FIN DU QUIZ
        if (isQuizOnly) {
            // SI MODE "JUSTE LE TEST" -> ON SAUVEGARDE DIRECT (Pas de formulaire)
            // On doit passer les réponses actuelles car le state n'est pas encore mis à jour dans cette closure
            handleFinishQuizOnly(newRecordedAnswers, newAnswersText) 
        } else {
            // MODE NORMAL -> ON AFFICHE LE FORMULAIRE
            setIsQuestionnaireDone(true)
        }
      }
    }
  }

  // --- SAUVEGARDE SPÉCIALE (MODE QUIZ ONLY) ---
  const handleFinishQuizOnly = async (finalRecordedAnswers, finalAnswersText) => {
      setLoading(true)
      setLoadingText("Mise à jour de ta personnalité...")
      
      try {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) throw new Error("Non connecté")

          // 1. Sauvegarder les nouvelles réponses
          await supabase.from('user_answers').delete().eq('user_id', user.id)
          const answersToInsert = finalRecordedAnswers.map(ans => ({
            user_id: user.id, question_id: ans.question_id, option_id: ans.option_id
          }))
          const { error: ansError } = await supabase.from('user_answers').insert(answersToInsert)
          if (ansError) throw ansError

          // 2. Re-générer l'IA (On a besoin des infos du profil existant)
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
          
          let profileNarrative = `
            Étudiant en ${profile.type_diplome} ${profile.domaine}, ${profile.intitule}.
            Campus : ${profile.etudes_lieu}. Genre : ${profile.sexe}. Né le : ${profile.date_naissance}.
            Ma personnalité : ${finalAnswersText.join(". ")}.
          `
          if (isDoctorat(profile.type_diplome)) {
             profileNarrative += ` Thèse : ${profile.parcours} (Sujet : ${profile.intitule}).`
          }

          const aiVector = await generateProfileVector(profileNarrative)
          
          const { error: embError } = await supabase.from('profiles').update({ embedding: aiVector }).eq('id', user.id)
          if (embError) throw embError

          // 3. Retour au profil
          navigate('/profile')

      } catch (error) {
          console.error(error)
          alert("Erreur lors de la mise à jour : " + error.message)
          setLoading(false)
      }
  }

  // --- GESTION RETOUR ---
  const handleBack = () => {
    // Si Quiz Only, retour au profil direct si on annule
    if (isQuizOnly && questionHistory.length === 0) {
        navigate('/profile')
        return
    }

    if (isQuestionnaireDone && formStep === 'avatars') { setFormStep('info'); return }
    if (isQuestionnaireDone && formStep === 'info') {
      setIsQuestionnaireDone(false)
      // Retour à la dernière question
      const previousQuestion = questionHistory[questionHistory.length - 1]
      setCurrentQuestion(previousQuestion || currentQuestion)
      // Nettoyage des réponses
      setAnswersText(prev => prev.slice(0, -1))
      setRecordedAnswers(prev => prev.slice(0, -1))
      setQuestionHistory(prev => prev.slice(0, -1))
      return
    }
    if (questionHistory.length > 0) {
      const previousQuestion = questionHistory[questionHistory.length - 1]
      setCurrentQuestion(previousQuestion)
      setQuestionHistory(prev => prev.slice(0, -1))
      setAnswersText(prev => prev.slice(0, -1))
      setRecordedAnswers(prev => prev.slice(0, -1))
    }
  }

  // --- (Le reste du code pour les filtres et le formulaire NORMAL reste identique pour le onboarding initial) ---
  const etudesOpts = [...new Set(formationsData.map(f => f.etude))].filter(Boolean).sort()
  const themesOpts = [...new Set(formationsData.filter(f => f.etude === selectedEtude).map(f => f.theme))].filter(Boolean).sort()
  const anneesOpts = [...new Set(formationsData.filter(f => f.etude === selectedEtude && f.theme === selectedTheme).map(f => f.annee))].filter(Boolean).sort()
  const nomsOpts = [...new Set(formationsData.filter(f => f.etude === selectedEtude && f.theme === selectedTheme && f.annee === selectedAnnee).map(f => f.nom))].filter(Boolean).sort()
  const parcoursOpts = [...new Set(formationsData.filter(f => f.etude === selectedEtude && f.theme === selectedTheme && f.annee === selectedAnnee && f.nom === selectedNom).map(f => f.parcours))].filter(Boolean).sort()

  useEffect(() => {
    if (selectedEtude && !selectedTheme && themesOpts.length === 1) setSelectedTheme(themesOpts[0])
    if (!isDoctorat(selectedEtude)) {
        if (selectedTheme && !selectedAnnee && anneesOpts.length === 1) setSelectedAnnee(anneesOpts[0])
        if (selectedAnnee && !selectedNom && nomsOpts.length === 1) setSelectedNom(nomsOpts[0])
        if (selectedNom && !selectedParcours && parcoursOpts.length === 1) setSelectedParcours(parcoursOpts[0])
    }
  }, [selectedEtude, selectedTheme, selectedAnnee, selectedNom, themesOpts, anneesOpts, nomsOpts, parcoursOpts])

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      setRealPhotoFile(file)
      setRealPhotoPreview(URL.createObjectURL(file))
    }
  }

  const goToAvatars = (e) => {
    e.preventDefault()
    if (!pseudo || !sexe || !birthDate || !selectedEtude || !selectedTheme || !selectedLieu) {
        alert("Merci de remplir tous les champs obligatoires.")
        return
    }
    setFormationsData([]) 
    setFormStep('avatars')
  }

  const handleFinish = async () => {
    setLoading(true) 
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Non connecté")

      let realPhotoUrl = null
      if (realPhotoFile) {
          const fileExt = realPhotoFile.name.split('.').pop()
          const fileName = `${user.id}-${Date.now()}.${fileExt}`
          const { error: uploadError } = await supabase.storage.from('profiles').upload(fileName, realPhotoFile)
          if (uploadError) throw uploadError
          const { data: { publicUrl } } = supabase.storage.from('profiles').getPublicUrl(fileName)
          realPhotoUrl = publicUrl
      }

      let profileNarrative = `
        Étudiant en ${selectedEtude} ${selectedTheme}, ${selectedNom}.
        Campus : ${selectedLieu}. Genre : ${sexe}. Né le : ${birthDate}.
        Ma personnalité : ${answersText.join(". ")}.
      `
      if (isDoctorat(selectedEtude)) {
          profileNarrative += ` Thèse : ${selectedParcours} (Sujet : ${selectedNom}).`
      }
      const aiVector = await generateProfileVector(profileNarrative)

      const updates = {
          id: user.id, email: user.email,
          pseudo, sexe, date_naissance: birthDate,
          type_diplome: selectedEtude, domaine: selectedTheme, 
          annee_etude: isDoctorat(selectedEtude) ? null : selectedAnnee,
          intitule: selectedNom, parcours: selectedParcours || null, etudes_lieu: selectedLieu,
          embedding: aiVector, avatar_public: selectedPublicAvatar, avatar_prive: realPhotoUrl,
          tags: []
      }

      const { error: profileError } = await supabase.from('profiles').upsert(updates)
      if (profileError) throw profileError

      if (!isEditMode) { 
          await supabase.from('user_answers').delete().eq('user_id', user.id)
          const answersToInsert = recordedAnswers.map(ans => ({
            user_id: user.id, question_id: ans.question_id, option_id: ans.option_id
          }))
          const { error: answersError } = await supabase.from('user_answers').insert(answersToInsert)
          if (answersError) throw answersError
      }

      navigate('/app')

    } catch (error) {
      console.error(error); alert("Erreur: " + error.message)
      setLoading(false)
    }
  }

  const selectStyle = "w-full p-3 rounded-xl bg-slate-800 border border-slate-600 text-white focus:border-philo-primary focus:outline-none appearance-none cursor-pointer placeholder-gray-400"

  // --- VUES ---
  if (loading) {
    return (
      <div className="min-h-screen bg-philo-dark flex flex-col items-center justify-center p-4">
        <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} className="mb-8">
          <BrainCircuit className="w-24 h-24 text-philo-primary" />
        </motion.div>
        <motion.p className="text-xl font-bold text-white text-center max-w-md">{loadingText}</motion.p>
      </div>
    )
  }

  if (!isQuestionnaireDone && currentQuestion) {
    return (
      <div className="min-h-screen bg-philo-dark flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {questionHistory.length > 0 && <button onClick={handleBack} className="absolute top-6 left-6 p-2 rounded-full bg-white/5 text-white"><ArrowLeft size={24} /></button>}
        {/* Si Quiz Only et pas d'historique, bouton pour annuler et revenir au profil */}
        {isQuizOnly && questionHistory.length === 0 && (
            <button onClick={() => navigate('/profile')} className="absolute top-6 left-6 p-2 rounded-full bg-white/5 text-white"><ArrowLeft size={24} /></button>
        )}
        
        <AnimatePresence mode='wait'>
          <motion.div key={currentQuestion.id} initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -50, opacity: 0 }} className="w-full max-w-lg">
            <h2 className="text-2xl font-bold text-white mb-8 text-center">{currentQuestion.text}</h2>
            <div className="grid gap-3">
              {currentQuestion.options.map((option) => (
                <button key={option.id} onClick={() => handleAnswer(option)} className="group relative p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-philo-primary hover:bg-white/10 transition-all text-left">
                  <span className="text-lg text-gray-200 group-hover:text-white">{option.text}</span>
                  <ArrowRight className="absolute right-5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-philo-primary transition-opacity" />
                </button>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    )
  }

  return (
     <div className="min-h-screen bg-philo-dark flex items-center justify-center p-4 relative">
        <button onClick={handleBack} className="absolute top-6 left-6 p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition z-10"><ArrowLeft size={24} /></button>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-lg bg-slate-900/80 backdrop-blur-md p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl">
           
           {/* PARTIE 1 : INFOS */}
           {formStep === 'info' && (
             <form onSubmit={goToAvatars} className="space-y-5">
                <div className="text-center mb-6"><GraduationCap className="w-12 h-12 text-philo-primary mx-auto mb-3" /><h2 className="text-2xl font-bold text-white">Profil Étudiant</h2></div>

                {!isEditMode && (
                <>
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-2 flex items-center gap-2"><UserCircle size={14} /> Pseudo</label>
                    <input type="text" required autoFocus value={pseudo} onChange={e => setPseudo(e.target.value)} className="w-full bg-transparent text-white text-lg font-medium focus:outline-none placeholder-gray-500" placeholder="Ton nom de scène ?" />
                    </div>
                    <div className="flex gap-4">
                    <div className="w-1/2">
                        <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Genre</label>
                        <select required value={sexe} onChange={e => setSexe(e.target.value)} className={selectStyle}>
                        <option value="">...</option><option value="Homme">Homme</option><option value="Femme">Femme</option><option value="Autre">Autre</option>
                        </select>
                    </div>
                    <div className="w-1/2">
                        <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Naissance</label>
                        <input type="date" required value={birthDate} onChange={e => setBirthDate(e.target.value)} className={`${selectStyle} text-sm`} />
                    </div>
                    </div>
                    <div className="w-full h-px bg-white/10 my-2"></div>
                </>
                )}

                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                <label className="text-xs font-bold text-philo-primary uppercase mb-1">Diplôme</label>
                <select required value={selectedEtude} onChange={e => { setSelectedEtude(e.target.value); setSelectedTheme(''); }} className={selectStyle}>
                    <option value="">...</option>{etudesOpts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                </motion.div>

                {selectedEtude && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <label className="text-xs font-bold text-philo-secondary uppercase mb-1">Domaine</label>
                <select required value={selectedTheme} onChange={e => { setSelectedTheme(e.target.value); setSelectedAnnee(''); }} className={selectStyle}>
                    <option value="">...</option>{themesOpts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                </motion.div>}

                {selectedTheme && !isDoctorat(selectedEtude) && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <label className="text-xs font-bold text-purple-400 uppercase mb-1">Année</label>
                    <select required value={selectedAnnee} onChange={e => { setSelectedAnnee(e.target.value); setSelectedNom(''); }} className={selectStyle}>
                        <option value="">...</option>{anneesOpts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    </motion.div>
                )}

                {((!isDoctorat(selectedEtude) && selectedAnnee) || (isDoctorat(selectedEtude) && selectedTheme)) && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    {isDoctorat(selectedEtude) ? (
                    <>
                        <label className="text-xs font-bold text-pink-400 uppercase mb-1">Matière de la thèse</label>
                        <input type="text" required value={selectedNom} onChange={e => { setSelectedNom(e.target.value); }} className={selectStyle} placeholder="Ex: Biologie, Droit..." />
                    </>
                    ) : (
                    <>
                        <label className="text-xs font-bold text-pink-400 uppercase mb-1">Intitulé</label>
                        <select required value={selectedNom} onChange={e => { setSelectedNom(e.target.value); setSelectedParcours(''); }} className={selectStyle}>
                        <option value="">...</option>{nomsOpts.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </>
                    )}
                </motion.div>
                )}

                {selectedNom && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    {isDoctorat(selectedEtude) ? (
                    <>
                        <label className="text-xs font-bold text-yellow-400 uppercase mb-1">Nom de la thèse</label>
                        <input type="text" required value={selectedParcours} onChange={e => setSelectedParcours(e.target.value)} className={selectStyle} placeholder="Titre complet de la thèse..." />
                    </>
                    ) : (
                    parcoursOpts.length > 0 && (
                        <>
                            <label className="text-xs font-bold text-yellow-400 uppercase mb-1">Option</label>
                            <select value={selectedParcours} onChange={e => setSelectedParcours(e.target.value)} className={selectStyle}>
                            <option value="">(Facultatif)</option>{parcoursOpts.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </>
                    )
                    )}
                </motion.div>
                )}

                {selectedNom && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <label className="text-xs font-bold text-green-400 uppercase mb-1">Campus</label>
                <select required value={selectedLieu} onChange={e => setSelectedLieu(e.target.value)} className={selectStyle}>
                    <option value="">...</option>{CAMPUS_LIST.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                </motion.div>}

                <button type="submit" className="w-full py-4 mt-6 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-white transition flex items-center justify-center gap-2">
                Choisir mon Avatar <ArrowRight size={18}/>
                </button>
             </form>
           )}

           {/* PARTIE 2 : AVATARS */}
           {formStep === 'avatars' && (
             <div className="space-y-6">
                <div className="text-center mb-6"><UserCircle className="w-12 h-12 text-philo-primary mx-auto mb-3" /><h2 className="text-2xl font-bold text-white">Ton Visage</h2><p className="text-gray-400 text-sm">Choisis comment tu apparais dans la constellation.</p></div>

                <div>
                   <h3 className="text-sm font-bold text-philo-primary uppercase mb-3 flex items-center gap-2"><BrainCircuit size={14}/> Avatar Public (Obligatoire)</h3>
                   <div className="grid grid-cols-5 gap-3">
                      {AVATARS_LIST.map((avatar) => (
                          <button key={avatar} onClick={() => setSelectedPublicAvatar(avatar)} className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${selectedPublicAvatar === avatar ? 'border-philo-primary scale-105 shadow-[0_0_15px_rgba(139,92,246,0.5)]' : 'border-white/10 hover:border-white/30 opacity-70 hover:opacity-100'}`}>
                             <img src={`/avatars/${avatar}`} alt={avatar} className="w-full h-full object-cover" />
                             {selectedPublicAvatar === avatar && <div className="absolute inset-0 bg-philo-primary/40 flex items-center justify-center"><Check className="text-white drop-shadow-md" size={24} /></div>}
                          </button>
                      ))}
                   </div>
                </div>

                <div className="w-full h-px bg-white/10 my-4"></div>

                <div>
                   <h3 className="text-sm font-bold text-pink-400 uppercase mb-3 flex items-center gap-2"><Camera size={14}/> Vraie Photo (Visible aux amis)</h3>
                   <label className="flex items-center gap-4 cursor-pointer group">
                      <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-dashed border-white/20 group-hover:border-white/50 flex items-center justify-center overflow-hidden relative">
                         {realPhotoPreview ? <img src={realPhotoPreview} alt="Preview" className="w-full h-full object-cover" /> : <ImageIcon className="text-gray-500 group-hover:text-white" size={24} />}
                      </div>
                      <div className="flex-1">
                         <div className="text-white font-medium text-sm group-hover:text-philo-secondary transition">Ajouter une photo</div>
                         <div className="text-gray-500 text-xs">Optionnel • Sera floutée pour les inconnus</div>
                      </div>
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                   </label>
                </div>

                <button onClick={handleFinish} disabled={loading} className="w-full py-4 mt-6 bg-gradient-to-r from-philo-primary to-philo-secondary rounded-xl font-bold text-white hover:opacity-90 shadow-lg flex items-center justify-center gap-2">
                {isEditMode ? "Sauvegarder" : "Entrer dans la constellation"} <BrainCircuit size={18}/>
                </button>
             </div>
           )}

        </motion.div>
    </div>
  )
}