import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useOnboarding } from '../../contexts/OnboardingContext'

export default function QuizStep() {
  const { currentQuestion, handleQuizAnswer, handleBackQuiz, questionHistory } = useOnboarding()

  if (!currentQuestion) return null

  return (
    <div className="flex flex-col items-center justify-center p-6 relative w-full max-w-lg mx-auto">
      {questionHistory.length > 0 && (
        <button onClick={handleBackQuiz} className="absolute top-0 left-0 p-2 rounded-full bg-white/5 text-white hover:bg-white/10 transition">
           <ArrowLeft size={24} />
        </button>
      )}
      
      <AnimatePresence mode='wait'>
        <motion.div 
          key={currentQuestion.id} 
          initial={{ x: 50, opacity: 0 }} 
          animate={{ x: 0, opacity: 1 }} 
          exit={{ x: -50, opacity: 0 }} 
          className="w-full"
        >
          <h2 className="text-2xl font-bold text-white mb-8 text-center">{currentQuestion.text}</h2>
          <div className="grid gap-3">
            {currentQuestion.options.map((option) => (
              <button 
                key={option.id} 
                onClick={() => handleQuizAnswer(option)} 
                className="group relative p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-philo-primary hover:bg-white/10 transition-all text-left w-full"
              >
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