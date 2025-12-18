/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // La charte graphique Philotès (Dark & Neon)
        philo: {
          dark: '#0f172a',    // Fond sombre
          primary: '#8b5cf6', // Violet principal
          secondary: '#3b82f6', // Bleu secondaire
          accent: '#10b981',  // Vert (Validation)
        }
      }
    },
  },
  plugins: [],
}