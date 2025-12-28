import { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const OnboardingContext = createContext({})

export const useOnboarding = () => useContext(OnboardingContext)

// --- MOTEUR DE CALCUL DES DIMENSIONS ---
const calculateDimensions = (answers) => {
  const scores = answers.reduce((acc, curr) => {
    // Sécurité stricte
    if (!curr.dimension || curr.score_value === undefined || curr.score_value === null) return acc;

    const dimKey = curr.dimension.toLowerCase().trim();

    if (!acc[dimKey]) {
      acc[dimKey] = 0;
    }

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
           supabase.from('questions')
             .select(`id, text, order, depends_on_option_id, options ( id, text, dimension, score_value )`)
             .order('order', { ascending: true })
        ])

        setFormationsData(formationsRes.data || [])
        
        if (questionsRes.data?.length > 0) {
          setDbQuestions(questionsRes.data)
          setCurrentQuestion(questionsRes.data.find(q => q.depends_on_option_id === null))
        }

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

  const finalizeQuizOnly = async (finalRecorded, finalTexts) => {
      setLoading(true); setLoadingText("Analyse de ta personnalité...")
      try {
          const { data: { user } } = await supabase.auth.getUser()
          
          const cleanAnswers = finalRecorded.map(({score_value, dimension, ...rest}) => ({ user_id: user.id, ...rest }))
          await supabase.from('user_answers').delete().eq('user_id', user.id)
          await supabase.from('user_answers').insert(cleanAnswers)

          const dimensionScores = calculateDimensions(finalRecorded)
          
          await supabase.from('profiles').update({ 
            dimensions: dimensionScores
          }).eq('id', user.id)
          
          navigate('/profile')
      } catch (e) { console.error(e); setLoading(false) }
  }

  // --- CORRECTION CRITIQUE ICI (Erreur 400) ---
  // src/contexts/OnboardingContext.jsx

// ... (début du fichier inchangé)

  const submitFullProfile = async () => {
      setLoading(true); setLoadingText("Création de ton univers...")
      try {
          const { data: { user } } = await supabase.auth.getUser()
          
          // 1. Validation de sécurité (puisque le HTML required n'est plus là)
          if (!formData.birthDate) {
             throw new Error("La date de naissance est obligatoire.")
          }

          let photoUrl = null
          if (realPhotoFile) {
              const fileName = `${user.id}-${Date.now()}.${realPhotoFile.name.split('.').pop()}`
              await supabase.storage.from('profiles').upload(fileName, realPhotoFile)
              const { data } = supabase.storage.from('profiles').getPublicUrl(fileName)
              photoUrl = data.publicUrl
          }

          const dimensionScores = calculateDimensions(recordedAnswers)

          // 2. Préparation des données (Nettoyage)
          const updates = {
              id: user.id,
              pseudo: formData.pseudo, 
              sexe: formData.sexe, 
              
              // CORRECTION ICI : On s'assure que c'est une date valide ou NULL (jamais "")
              date_naissance: formData.birthDate || null,
              
              type_diplome: formData.etude, 
              domaine: formData.theme, 
              annee_etude: formData.etude?.includes('Doctora') ? null : formData.annee,
              intitule: formData.nom, 
              parcours: formData.parcours || null, 
              etudes_lieu: formData.lieu,
              
              dimensions: dimensionScores, 
              
              avatar_public: avatarPublic, 
              avatar_prive: photoUrl,
          }
          
          const { error } = await supabase.from('profiles').upsert(updates)
          if (error) throw error

          if (!isEditMode) {
              const cleanAnswers = recordedAnswers.map(({score_value, dimension, ...rest}) => ({ user_id: user.id, ...rest }))
              await supabase.from('user_answers').delete().eq('user_id', user.id)
              await supabase.from('user_answers').insert(cleanAnswers)
          }

          navigate('/app')
      } catch (e) { 
        console.error(e)
        alert("Erreur lors de la sauvegarde : " + e.message)
        setLoading(false) 
      }
  }

// ... (reste du fichier inchangé)

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