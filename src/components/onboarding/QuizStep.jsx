import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useOnboarding } from '../../contexts/OnboardingContext'

export default function QuizStep() {
  // On consomme directement le Context qui gère déjà la logique conditionnelle "parent/enfant"
  const { currentQuestion, handleQuizAnswer, handleBackQuiz, questionHistory } = useOnboarding()

  if (!currentQuestion) return null

  return (
    <div className="flex flex-col items-center justify-center p-6 relative w-full max-w-lg mx-auto">
      {/* Bouton retour si on n'est pas à la première question */}
      {questionHistory.length > 0 && (
        <button onClick={handleBackQuiz} className="absolute top-0 left-0 p-2 rounded-full bg-white/5 text-white hover:bg-white/10 transition z-10">
           <ArrowLeft size={24} />
        </button>
      )}
      
      <AnimatePresence mode='wait'>
        <motion.div 
          key={currentQuestion.id} 
          initial={{ x: 50, opacity: 0 }} 
          animate={{ x: 0, opacity: 1 }} 
          exit={{ x: -50, opacity: 0 }} 
          transition={{ duration: 0.3 }}
          className="w-full mt-12"
        >
          {/* Texte de la question */}
          <h2 className="text-2xl font-bold text-white mb-8 text-center leading-relaxed">
            {currentQuestion.text}
          </h2>

          {/* Liste des options */}
          <div className="grid gap-3">
            {currentQuestion.options.map((option) => (
              <button 
                key={option.id} 
                onClick={() => handleQuizAnswer(option)} 
                className="group relative p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-philo-primary hover:bg-white/10 hover:shadow-lg hover:shadow-philo-primary/10 transition-all text-left w-full"
              >
                <span className="text-lg text-gray-200 group-hover:text-white font-medium">
                  {option.text}
                </span>
                <ArrowRight className="absolute right-5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-philo-primary transition-all transform translate-x-[-10px] group-hover:translate-x-0" />
              </button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}