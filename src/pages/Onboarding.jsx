import { useState } from 'react'
import { motion } from 'framer-motion'
import { BrainCircuit, ArrowLeft } from 'lucide-react'
import { OnboardingProvider, useOnboarding } from '../contexts/OnboardingContext'
import QuizStep from '../components/onboarding/QuizStep'
import InfoFormStep from '../components/onboarding/InfoFormStep'
import AvatarStep from '../components/onboarding/AvatarStep'

// Composant interne qui consomme le contexte
function OnboardingContent() {
  const { loading, loadingText, isQuestionnaireDone, setIsQuestionnaireDone, isQuizOnly } = useOnboarding()
  const [step, setStep] = useState('quiz') // 'quiz', 'info', 'avatars'

  // Gestionnaire d'affichage
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center">
        <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} className="mb-8">
          <BrainCircuit className="w-24 h-24 text-philo-primary" />
        </motion.div>
        <p className="text-xl font-bold text-white text-center">{loadingText}</p>
      </div>
    )
  }

  // 1. Mode Quiz (Prioritaire)
  if (!isQuestionnaireDone) {
      return <QuizStep />
  }

  // Si on est ici, le quiz est fini.
  // En mode "QuizOnly", le contexte gère la redirection, donc on affiche rien ou un loader.
  if (isQuizOnly) return null 

  // 2. Mode Formulaire & Avatar
  return (
      <div className="relative w-full flex justify-center">
          {/* Bouton Retour Step */}
          {step === 'avatars' && (
              <button onClick={() => setStep('info')} className="absolute top-0 left-4 p-2 rounded-full bg-white/5 text-gray-400 hover:text-white z-10">
                  <ArrowLeft size={24} />
              </button>
          )}
          {step === 'info' && (
              <button onClick={() => setIsQuestionnaireDone(false)} className="absolute top-0 left-4 p-2 rounded-full bg-white/5 text-gray-400 hover:text-white z-10">
                  <ArrowLeft size={24} />
              </button>
          )}

          {step === 'info' ? (
              <InfoFormStep onNext={() => setStep('avatars')} />
          ) : (
              <AvatarStep />
          )}
      </div>
  )
}

export default function Onboarding() {
  return (
    <OnboardingProvider>
      <div className="min-h-screen bg-philo-dark flex items-center justify-center p-4 relative overflow-hidden">
         <OnboardingContent />
      </div>
    </OnboardingProvider>
  )
}