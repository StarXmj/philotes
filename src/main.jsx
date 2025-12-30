import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query' // <-- Import
import './index.css'
import App from './App.jsx'

// Création du client React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1, // Ne réessaie qu'une fois en cas d'erreur
      refetchOnWindowFocus: false, // Évite de recharger dès qu'on change de fenêtre (optionnel)
    },
  },
})

createRoot(document.getElementById('root')).render(
  
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
 ,
)