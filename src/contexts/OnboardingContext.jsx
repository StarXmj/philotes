import { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { generateProfileVector } from '../lib/ai'

const OnboardingContext = createContext({})

export const useOnboarding = () => useContext(OnboardingContext)

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
  const [recordedAnswers, setRecordedAnswers] = useState([]) // Stocke score_value !
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
           // ICI: On récupère score_value et dimension
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
    
    // ICI: On garde le score pour le calcul final
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

  // Helper pour calculer le score
  const calculateIsolationScore = (recs) => {
    let score = 0
    recs.forEach(r => { if(r.dimension === 'isolation') score += r.score_value })
    return Math.min(Math.max(score, 0), 1)
  }

  const finalizeQuizOnly = async (finalRecorded, finalTexts) => {
      setLoading(true); setLoadingText("Analyse de ta personnalité...")
      try {
          const { data: { user } } = await supabase.auth.getUser()
          
          // 1. Sauvegarde des réponses (nettoyées)
          const cleanAnswers = finalRecorded.map(({score_value, dimension, ...rest}) => ({ user_id: user.id, ...rest }))
          await supabase.from('user_answers').delete().eq('user_id', user.id)
          await supabase.from('user_answers').insert(cleanAnswers)

          // 2. IA ANTI-SILO (Focus Personnalité)
          const narrative = `Personnalité et fonctionnement : ${finalTexts.join(". ")}. Centres d'intérêt : ${finalTexts.join(", ")}.`
          const vector = await generateProfileVector(narrative)
          
          // 3. SCORE ISOLEMENT
          const isoScore = calculateIsolationScore(finalRecorded)
          
          await supabase.from('profiles').update({ embedding: vector, isolation_score: isoScore }).eq('id', user.id)
          navigate('/profile')
      } catch (e) { console.error(e); setLoading(false) }
  }

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

          // 2. IA ANTI-SILO : On enlève la formation du texte principal !
          const narrative = `
            Personnalité : ${answersText.join(". ")}.
            Goûts : ${answersText.join(", ")}.
            Genre : ${formData.sexe}.
          `.trim()
          
          const vector = await generateProfileVector(narrative)
          const isoScore = calculateIsolationScore(recordedAnswers)

          const updates = {
              id: user.id, email: user.email,
              pseudo: formData.pseudo, sexe: formData.sexe, date_naissance: formData.birthDate,
              type_diplome: formData.etude, domaine: formData.theme, 
              annee_etude: formData.etude.includes('Doctora') ? null : formData.annee,
              intitule: formData.nom, parcours: formData.parcours || null, etudes_lieu: formData.lieu,
              embedding: vector, 
              isolation_score: isoScore, // <-- Sauvegardé
              avatar_public: avatarPublic, avatar_prive: photoUrl,
              tags: [] 
          }
          
          const { error } = await supabase.from('profiles').upsert(updates)
          if (error) throw error

          if (!isEditMode) {
              const cleanAnswers = recordedAnswers.map(({score_value, dimension, ...rest}) => ({ user_id: user.id, ...rest }))
              await supabase.from('user_answers').delete().eq('user_id', user.id)
              await supabase.from('user_answers').insert(cleanAnswers)
          }

          navigate('/app')
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