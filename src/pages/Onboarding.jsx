import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom' // <-- Ajout de useLocation
import { supabase } from '../lib/supabaseClient'
import { generateProfileVector } from '../lib/ai'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ArrowLeft, GraduationCap, MapPin, BookOpen, Calendar, Layers, UserCircle, BrainCircuit, Loader2 } from 'lucide-react'

// Campus en dur
const CAMPUS_LIST = ["Pau", "Bayonne", "Anglet", "Tarbes", "Mont-de-Marsan"]

// Phrases de chargement... (Garde ta constante LOADING_PHRASES ici)
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
  const location = useLocation() // <-- Pour récupérer le mode 'edit'
  
  // Est-ce qu'on vient du profil ?
  const isEditMode = location.state?.mode === 'edit'

  // --- ÉTATS ---
  const [loading, setLoading] = useState(true)
  const [loadingText, setLoadingText] = useState(LOADING_PHRASES[0])
  
  const [dbQuestions, setDbQuestions] = useState([]) 
  const [currentQuestion, setCurrentQuestion] = useState(null) 
  
  const [answersText, setAnswersText] = useState([]) 
  const [recordedAnswers, setRecordedAnswers] = useState([]) 
  
  const [questionHistory, setQuestionHistory] = useState([]) 
  const [isQuestionnaireDone, setIsQuestionnaireDone] = useState(false)

  // Formulaire Scolaire & Perso
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

  // 1. ANIMATION TEXTE
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

  // 2. CHARGEMENT INITIAL (Données + Profil existant si Edit Mode)
  useEffect(() => {
    const initData = async () => {
      setLoading(true)
      
      const { data: { user } } = await supabase.auth.getUser()
      const { data: form } = await supabase.from('formations').select('*')
      setFormationsData(form || [])

      const { data: quest, error } = await supabase
        .from('questions')
        .select(`id, text, order, depends_on_option_id, options ( id, text )`)
        .order('order', { ascending: true })

      if (quest && quest.length > 0) {
        setDbQuestions(quest)
        const firstQ = quest.find(q => q.depends_on_option_id === null)
        setCurrentQuestion(firstQ)
      }

      // --- SI MODE ÉDITION : ON PRÉ-REMPLIT LES INFOS ---
      // C'est crucial : même si on cache les champs, les variables d'état (pseudo, etc.) 
      // doivent contenir les valeurs pour ne pas écraser la base de données avec du vide.
      if (isEditMode && user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        
        if (profile) {
          setPseudo(profile.pseudo || '')
          setSexe(profile.sexe || '')
          setBirthDate(profile.date_naissance || '')
          // On pré-remplit aussi le scolaire pour le confort
          setSelectedEtude(profile.type_diplome || '')
          setSelectedTheme(profile.domaine || '')
          setSelectedAnnee(profile.annee_etude || '')
          setSelectedNom(profile.intitule || '')
          setSelectedParcours(profile.parcours || '')
          setSelectedLieu(profile.etudes_lieu || '')
        }
      }

      setLoading(false)
    }
    initData()
  }, [isEditMode]) // On recharge si le mode change


  // --- NAVIGATION (AVANCER) ---
  const handleAnswer = (option) => {
    setQuestionHistory([...questionHistory, currentQuestion])
    setAnswersText([...answersText, option.text])
    setRecordedAnswers([...recordedAnswers, { question_id: currentQuestion.id, option_id: option.id }])

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
        setIsQuestionnaireDone(true)
      }
    }
  }

  // --- NAVIGATION (RECULER) ---
  const handleBack = () => {
    if (isQuestionnaireDone) {
      setIsQuestionnaireDone(false)
      setAnswersText(prev => prev.slice(0, -1))
      setRecordedAnswers(prev => prev.slice(0, -1))
      const previousQuestion = questionHistory[questionHistory.length - 1]
      setCurrentQuestion(previousQuestion || currentQuestion)
      setQuestionHistory(prev => prev.slice(0, -1))
      return
    }
    if (questionHistory.length > 0) {
      const previousQuestion = questionHistory[questionHistory.length - 1]
      const newHistory = questionHistory.slice(0, -1)
      setCurrentQuestion(previousQuestion)
      setQuestionHistory(newHistory)
      setAnswersText(prev => prev.slice(0, -1))
      setRecordedAnswers(prev => prev.slice(0, -1))
    }
  }

  // --- FILTRES SCOLAIRES ---
  const etudesOpts = [...new Set(formationsData.map(f => f.etude))].filter(Boolean).sort()
  const themesOpts = [...new Set(formationsData.filter(f => f.etude === selectedEtude).map(f => f.theme))].filter(Boolean).sort()
  const anneesOpts = [...new Set(formationsData.filter(f => f.etude === selectedEtude && f.theme === selectedTheme).map(f => f.annee))].filter(Boolean).sort()
  const nomsOpts = [...new Set(formationsData.filter(f => f.etude === selectedEtude && f.theme === selectedTheme && f.annee === selectedAnnee).map(f => f.nom))].filter(Boolean).sort()
  const parcoursOpts = [...new Set(formationsData.filter(f => f.etude === selectedEtude && f.theme === selectedTheme && f.annee === selectedAnnee && f.nom === selectedNom).map(f => f.parcours))].filter(Boolean).sort()

  useEffect(() => {
    if (selectedEtude && !selectedTheme && themesOpts.length === 1) setSelectedTheme(themesOpts[0])
    if (selectedTheme && !selectedAnnee && anneesOpts.length === 1) setSelectedAnnee(anneesOpts[0])
    if (selectedAnnee && !selectedNom && nomsOpts.length === 1) setSelectedNom(nomsOpts[0])
    if (selectedNom && !selectedParcours && parcoursOpts.length === 1) setSelectedParcours(parcoursOpts[0])
  }, [selectedEtude, selectedTheme, selectedAnnee, selectedNom, themesOpts, anneesOpts, nomsOpts, parcoursOpts])


  // --- SAUVEGARDE FINALE ---
  const handleFinish = async (e) => {
    e.preventDefault()
    setLoading(true) 

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Non connecté")

      let profileNarrative = `
        Étudiant en ${selectedEtude} ${selectedTheme}, ${selectedNom}.
        Campus : ${selectedLieu}. Genre : ${sexe}. Né le : ${birthDate}.
        Ma personnalité : ${answersText.join(". ")}.
      `

      const aiVector = await generateProfileVector(profileNarrative)

      const { error: profileError } = await supabase.from('profiles').upsert({
          id: user.id, email: user.email,
          pseudo, sexe, date_naissance: birthDate,
          type_diplome: selectedEtude, domaine: selectedTheme, annee_etude: selectedAnnee,
          intitule: selectedNom, parcours: selectedParcours || null, etudes_lieu: selectedLieu,
          embedding: aiVector,
          tags: []
      })
      if (profileError) throw profileError

      // Sauvegarde des réponses
      await supabase.from('user_answers').delete().eq('user_id', user.id)
      const answersToInsert = recordedAnswers.map(ans => ({
        user_id: user.id, question_id: ans.question_id, option_id: ans.option_id
      }))
      const { error: answersError } = await supabase.from('user_answers').insert(answersToInsert)
      if (answersError) throw answersError

      navigate('/app')

    } catch (error) {
      console.error(error); alert("Erreur: " + error.message)
      setLoading(false)
    }
  }

  const selectStyle = "w-full p-3 rounded-xl bg-slate-800 border border-slate-600 text-white focus:border-philo-primary focus:outline-none appearance-none cursor-pointer placeholder-gray-400"

  // --- VUE CHARGEMENT ---
  if (loading) {
    return (
      <div className="min-h-screen bg-philo-dark flex flex-col items-center justify-center p-4">
        <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} className="mb-8">
          <BrainCircuit className="w-24 h-24 text-philo-primary" />
        </motion.div>
        <motion.p key={loadingText} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="text-xl font-bold text-white text-center max-w-md">
          {loadingText}
        </motion.p>
        <p className="text-gray-500 text-sm mt-4">Ne ferme pas la page...</p>
      </div>
    )
  }

  // --- VUE QUIZ ---
  if (!isQuestionnaireDone && currentQuestion) {
    return (
      <div className="min-h-screen bg-philo-dark flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {questionHistory.length > 0 && (
          <button onClick={handleBack} className="absolute top-6 left-6 p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition">
            <ArrowLeft size={24} />
          </button>
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

  // --- VUE FORMULAIRE FINAL ---
  return (
     <div className="min-h-screen bg-philo-dark flex items-center justify-center p-4 relative">
        <button onClick={handleBack} className="absolute top-6 left-6 p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition z-10">
            <ArrowLeft size={24} />
        </button>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-lg bg-slate-900/80 backdrop-blur-md p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl">
           <div className="text-center mb-6">
            <GraduationCap className="w-12 h-12 text-philo-primary mx-auto mb-3" />
            <h2 className="text-2xl font-bold text-white">Profil Étudiant</h2>
          </div>

          <form onSubmit={handleFinish} className="space-y-5">
             
             {/* SECTION INFOS PERSOS (Pseudo, Sexe, Age)
                On l'affiche SEULEMENT si on n'est PAS en mode Edit.
                En mode Edit, on suppose que ces infos ne changent pas ici (ou sont déjà gérées dans Profil).
             */}
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

            {/* SECTION SCOLAIRE (Toujours visible pour vérifier/confirmer) */}
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

            {selectedTheme && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <label className="text-xs font-bold text-purple-400 uppercase mb-1">Année</label>
              <select required value={selectedAnnee} onChange={e => { setSelectedAnnee(e.target.value); setSelectedNom(''); }} className={selectStyle}>
                <option value="">...</option>{anneesOpts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </motion.div>}

            {selectedAnnee && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <label className="text-xs font-bold text-pink-400 uppercase mb-1">Intitulé</label>
              <select required value={selectedNom} onChange={e => { setSelectedNom(e.target.value); setSelectedParcours(''); }} className={selectStyle}>
                <option value="">...</option>{nomsOpts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </motion.div>}

            {selectedNom && parcoursOpts.length > 0 && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <label className="text-xs font-bold text-yellow-400 uppercase mb-1">Option</label>
              <select value={selectedParcours} onChange={e => setSelectedParcours(e.target.value)} className={selectStyle}>
                <option value="">(Facultatif)</option>{parcoursOpts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </motion.div>}

            {selectedNom && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <label className="text-xs font-bold text-green-400 uppercase mb-1">Campus</label>
              <select required value={selectedLieu} onChange={e => setSelectedLieu(e.target.value)} className={selectStyle}>
                <option value="">...</option>{CAMPUS_LIST.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </motion.div>}

            <button disabled={loading} type="submit" className="w-full py-4 mt-6 bg-gradient-to-r from-philo-primary to-philo-secondary rounded-xl font-bold text-white hover:opacity-90 shadow-lg flex items-center justify-center gap-2">
              {isEditMode ? "Mettre à jour" : "Valider mon profil"} <BrainCircuit size={18}/>
            </button>
          </form>
        </motion.div>
    </div>
  )
}