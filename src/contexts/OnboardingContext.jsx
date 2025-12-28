import { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const OnboardingContext = createContext({})

export const useOnboarding = () => useContext(OnboardingContext)

// --- MOTEUR DE CALCUL DES DIMENSIONS (Le Cœur du Système) ---
const calculateDimensions = (answers) => {
  // On transforme les réponses en un objet de scores cumulés
  // Ex: { social: 120, serieux: 40, ... }
  const scores = answers.reduce((acc, curr) => {
    // Sécurité : On ignore les options sans dimension ou valeur
    if (!curr.dimension || curr.score_value === undefined || curr.score_value === null) return acc;

    // IMPORTANT : On force en minuscule pour correspondre à ton SQL (social vs Social)
    const dimKey = curr.dimension.toLowerCase().trim();

    if (!acc[dimKey]) {
      acc[dimKey] = 0;
    }

    // On additionne les scores
    acc[dimKey] += parseInt(curr.score_value, 10);
    return acc;
  }, {}); 
  
  return scores; 
}

export const OnboardingProvider = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()
  
  const [loading, setLoading] = useState(true)
  const [loadingText, setLoadingText] = useState("Connexion...")
  
  // Modes : 'edit' = Modification Profil, 'quiz_only' = Refaire le test depuis Profil
  const isEditMode = location.state?.mode === 'edit'
  const isQuizOnly = location.state?.mode === 'quiz_only'

  const [dbQuestions, setDbQuestions] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [answersText, setAnswersText] = useState([])
  const [recordedAnswers, setRecordedAnswers] = useState([]) 
  const [questionHistory, setQuestionHistory] = useState([])
  const [isQuestionnaireDone, setIsQuestionnaireDone] = useState(false)

  const [formationsData, setFormationsData] = useState([])
  const [formData, setFormData] = useState({
    pseudo: '', sexe: '', birthDate: '',
    etude: '', theme: '', annee: '', nom: '', parcours: '', lieu: ''
  })
  const [avatarPublic, setAvatarPublic] = useState('avatar1.png')
  const [realPhotoFile, setRealPhotoFile] = useState(null)
  const [realPhotoPreview, setRealPhotoPreview] = useState(null)

  useEffect(() => {
    const initData = async () => {
      setLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        
        const [formationsRes, questionsRes] = await Promise.all([
           supabase.from('formations').select('*'),
           // IMPORTANT : On récupère bien 'dimension' et 'score_value' pour le calcul
           supabase.from('questions')
             .select(`id, text, order, depends_on_option_id, options ( id, text, dimension, score_value )`)
             .order('order', { ascending: true })
        ])

        setFormationsData(formationsRes.data || [])
        
        if (questionsRes.data?.length > 0) {
          setDbQuestions(questionsRes.data)
          setCurrentQuestion(questionsRes.data.find(q => q.depends_on_option_id === null))
        }

        // Pré-remplissage si mode édition
        if ((isEditMode || isQuizOnly) && user) {
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
          if (profile) {
             setFormData({
                pseudo: profile.pseudo || '',
                sexe: profile.sexe || '',
                birthDate: profile.date_naissance || '',
                etude: profile.type_diplome || '',
                theme: profile.domaine || '',
                annee: profile.annee_etude || '',
                nom: profile.intitule || '',
                parcours: profile.parcours || '',
                lieu: profile.etudes_lieu || ''
             })
             if (profile.avatar_public) setAvatarPublic(profile.avatar_public)
          }
        }
      } catch (e) { console.error(e) } 
      finally { setLoading(false) }
    }
    initData()
  }, [isEditMode, isQuizOnly])

  const handleQuizAnswer = (option) => {
    const newHistory = [...questionHistory, currentQuestion]
    const newAnswersText = [...answersText, option.text]
    
    // Capture de la réponse avec ses métadonnées pour le calcul final
    const newRecorded = [...recordedAnswers, { 
      question_id: currentQuestion.id, 
      option_id: option.id,
      score_value: option.score_value || 0,
      dimension: option.dimension || null 
    }]

    setQuestionHistory(newHistory)
    setAnswersText(newAnswersText)
    setRecordedAnswers(newRecorded)

    const child = dbQuestions.find(q => q.depends_on_option_id === option.id)
    if (child) {
      setCurrentQuestion(child)
    } else {
      const next = dbQuestions
        .filter(q => q.depends_on_option_id === null && q.order > currentQuestion.order)
        .sort((a, b) => a.order - b.order)[0]

      if (next) setCurrentQuestion(next)
      else {
        // FIN DU QUIZ : On branche vers la bonne sauvegarde
        if (isQuizOnly) finalizeQuizOnly(newRecorded, newAnswersText)
        else setIsQuestionnaireDone(true)
      }
    }
  }

  const handleBackQuiz = () => {
    if (questionHistory.length === 0) {
        if (isQuizOnly) navigate('/profile')
        return
    }
    const prev = questionHistory[questionHistory.length - 1]
    setCurrentQuestion(prev)
    setQuestionHistory(h => h.slice(0, -1))
    setAnswersText(a => a.slice(0, -1))
    setRecordedAnswers(r => r.slice(0, -1))
  }

  // --- CAS 1 : MISE À JOUR DEPUIS LE PROFIL ("Refaire le test") ---
  const finalizeQuizOnly = async (finalRecorded, finalTexts) => {
      setLoading(true); setLoadingText("Analyse de ta nouvelle personnalité...")
      try {
          const { data: { user } } = await supabase.auth.getUser()
          
          // 1. Sauvegarde des réponses brutes (pour l'historique et "Points communs")
          const cleanAnswers = finalRecorded.map(({score_value, dimension, ...rest}) => ({ user_id: user.id, ...rest }))
          await supabase.from('user_answers').delete().eq('user_id', user.id)
          await supabase.from('user_answers').insert(cleanAnswers)

          // 2. CALCUL ET SAUVEGARDE DES DIMENSIONS
          const dimensionScores = calculateDimensions(finalRecorded)
          
          await supabase.from('profiles').update({ 
            dimensions: dimensionScores // <--- C'est ici que le "Vecteur" est mis à jour
          }).eq('id', user.id)
          
          navigate('/profile') // Retour au profil
      } catch (e) { console.error(e); setLoading(false) }
  }

  // --- CAS 2 : PREMIER ONBOARDING (Depuis Landing) ---
  const submitFullProfile = async () => {
      setLoading(true); setLoadingText("Création de ton univers...")
      try {
          const { data: { user } } = await supabase.auth.getUser()
          
          let photoUrl = null
          if (realPhotoFile) {
              const fileName = `${user.id}-${Date.now()}.${realPhotoFile.name.split('.').pop()}`
              await supabase.storage.from('profiles').upload(fileName, realPhotoFile)
              const { data } = supabase.storage.from('profiles').getPublicUrl(fileName)
              photoUrl = data.publicUrl
          }

          // 1. CALCUL DES DIMENSIONS
          const dimensionScores = calculateDimensions(recordedAnswers)

          // 2. INSERTION/UPDATE DU PROFIL COMPLET
          const updates = {
              id: user.id, email: user.email,
              pseudo: formData.pseudo, sexe: formData.sexe, date_naissance: formData.birthDate,
              type_diplome: formData.etude, domaine: formData.theme, 
              annee_etude: formData.etude.includes('Doctora') ? null : formData.annee,
              intitule: formData.nom, parcours: formData.parcours || null, etudes_lieu: formData.lieu,
              
              dimensions: dimensionScores, // <--- Injection du "Vecteur"
              
              avatar_public: avatarPublic, avatar_prive: photoUrl,
              tags: [] 
          }
          
          const { error } = await supabase.from('profiles').upsert(updates)
          if (error) throw error

          // 3. SAUVEGARDE DES REPONSES
          if (!isEditMode) {
              const cleanAnswers = recordedAnswers.map(({score_value, dimension, ...rest}) => ({ user_id: user.id, ...rest }))
              await supabase.from('user_answers').delete().eq('user_id', user.id)
              await supabase.from('user_answers').insert(cleanAnswers)
          }

          navigate('/app') // Direction Dashboard
      } catch (e) { alert(e.message); setLoading(false) }
  }

  const updateFormData = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

  return (
    <OnboardingContext.Provider value={{
      loading, loadingText, isEditMode, isQuizOnly,
      currentQuestion, isQuestionnaireDone, setIsQuestionnaireDone, handleQuizAnswer, handleBackQuiz, questionHistory,
      formData, updateFormData, formationsData,
      avatarPublic, setAvatarPublic, realPhotoFile, setRealPhotoFile, realPhotoPreview, setRealPhotoPreview,
      submitFullProfile
    }}>
      {children}
    </OnboardingContext.Provider>
  )
}