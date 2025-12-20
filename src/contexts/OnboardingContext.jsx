import { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { generateProfileVector } from '../lib/ai'

const OnboardingContext = createContext({})

export const useOnboarding = () => useContext(OnboardingContext)

export const OnboardingProvider = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()
  
  // --- ÉTATS ---
  const [loading, setLoading] = useState(true)
  const [loadingText, setLoadingText] = useState("Connexion...")
  
  // Modes
  const isEditMode = location.state?.mode === 'edit'
  const isQuizOnly = location.state?.mode === 'quiz_only'

  // Quiz Data
  const [dbQuestions, setDbQuestions] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [answersText, setAnswersText] = useState([])
  const [recordedAnswers, setRecordedAnswers] = useState([])
  const [questionHistory, setQuestionHistory] = useState([])
  const [isQuestionnaireDone, setIsQuestionnaireDone] = useState(false)

  // Form Data
  const [formationsData, setFormationsData] = useState([])
  const [formData, setFormData] = useState({
    pseudo: '', sexe: '', birthDate: '',
    etude: '', theme: '', annee: '', nom: '', parcours: '', lieu: ''
  })

  // Avatar Data
  const [avatarPublic, setAvatarPublic] = useState('avatar1.png')
  const [realPhotoFile, setRealPhotoFile] = useState(null)
  const [realPhotoPreview, setRealPhotoPreview] = useState(null)

  // --- INITIALISATION ---
  useEffect(() => {
    const initData = async () => {
      setLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        
        // 1. Charger les formations et questions
        const [formationsRes, questionsRes] = await Promise.all([
           supabase.from('formations').select('*'),
           supabase.from('questions').select(`id, text, order, depends_on_option_id, options ( id, text )`).order('order', { ascending: true })
        ])

        setFormationsData(formationsRes.data || [])
        
        if (questionsRes.data?.length > 0) {
          setDbQuestions(questionsRes.data)
          setCurrentQuestion(questionsRes.data.find(q => q.depends_on_option_id === null))
        }

        // 2. Pré-remplissage si mode Edit/QuizOnly
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

  // --- LOGIQUE QUIZ ---
  const handleQuizAnswer = (option) => {
    const newHistory = [...questionHistory, currentQuestion]
    const newAnswersText = [...answersText, option.text]
    const newRecorded = [...recordedAnswers, { question_id: currentQuestion.id, option_id: option.id }]

    setQuestionHistory(newHistory)
    setAnswersText(newAnswersText)
    setRecordedAnswers(newRecorded)

    // Calcul prochaine question
    const child = dbQuestions.find(q => q.depends_on_option_id === option.id)
    if (child) {
      setCurrentQuestion(child)
    } else {
      const next = dbQuestions
        .filter(q => q.depends_on_option_id === null && q.order > currentQuestion.order)
        .sort((a, b) => a.order - b.order)[0]

      if (next) setCurrentQuestion(next)
      else {
        // FIN DU QUIZ
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

  // --- LOGIQUE FINALE ---
  const finalizeQuizOnly = async (finalRecorded, finalTexts) => {
      setLoading(true); setLoadingText("Mise à jour IA...")
      try {
          const { data: { user } } = await supabase.auth.getUser()
          
          // Sauvegarde réponses
          await supabase.from('user_answers').delete().eq('user_id', user.id)
          await supabase.from('user_answers').insert(finalRecorded.map(a => ({ user_id: user.id, ...a })))

          // IA Vector
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
          const narrative = `Étudiant en ${profile.type_diplome} ${profile.domaine}. Personnalité : ${finalTexts.join(". ")}.`
          const vector = await generateProfileVector(narrative)
          
          await supabase.from('profiles').update({ embedding: vector }).eq('id', user.id)
          navigate('/profile')
      } catch (e) { console.error(e); setLoading(false) }
  }

  const submitFullProfile = async () => {
      setLoading(true); setLoadingText("Création de ton univers...")
      try {
          const { data: { user } } = await supabase.auth.getUser()
          
          // Upload Photo
          let photoUrl = null
          if (realPhotoFile) {
              const fileName = `${user.id}-${Date.now()}.${realPhotoFile.name.split('.').pop()}`
              await supabase.storage.from('profiles').upload(fileName, realPhotoFile)
              const { data } = supabase.storage.from('profiles').getPublicUrl(fileName)
              photoUrl = data.publicUrl
          }

          // IA Vector
          const narrative = `Étudiant en ${formData.etude} ${formData.theme}, ${formData.nom}. Campus : ${formData.lieu}. Genre : ${formData.sexe}. Personnalité : ${answersText.join(". ")}.`
          const vector = await generateProfileVector(narrative)

          // Upsert Profile
          const updates = {
              id: user.id, email: user.email,
              pseudo: formData.pseudo, sexe: formData.sexe, date_naissance: formData.birthDate,
              type_diplome: formData.etude, domaine: formData.theme, 
              annee_etude: formData.etude.includes('Doctora') ? null : formData.annee,
              intitule: formData.nom, parcours: formData.parcours || null, etudes_lieu: formData.lieu,
              embedding: vector, avatar_public: avatarPublic, avatar_prive: photoUrl,
              tags: [] // Reset tags par défaut
          }
          
          const { error } = await supabase.from('profiles').upsert(updates)
          if (error) throw error

          // Save Answers (si pas mode edit)
          if (!isEditMode) {
              await supabase.from('user_answers').delete().eq('user_id', user.id)
              await supabase.from('user_answers').insert(recordedAnswers.map(a => ({ user_id: user.id, ...a })))
          }

          navigate('/app')
      } catch (e) { alert(e.message); setLoading(false) }
  }

  const updateFormData = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

  return (
    <OnboardingContext.Provider value={{
      loading, loadingText, isEditMode, isQuizOnly,
      // Quiz
      currentQuestion, isQuestionnaireDone, setIsQuestionnaireDone, handleQuizAnswer, handleBackQuiz, questionHistory,
      // Form
      formData, updateFormData, formationsData,
      // Avatar
      avatarPublic, setAvatarPublic, realPhotoFile, setRealPhotoFile, realPhotoPreview, setRealPhotoPreview,
      submitFullProfile
    }}>
      {children}
    </OnboardingContext.Provider>
  )
}