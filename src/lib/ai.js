import { pipeline, env } from '@huggingface/transformers';

// --- CONFIGURATION ---
// 1. On interdit le local pour éviter les erreurs de chemin sur Vite/Netlify
env.allowLocalModels = false;
env.allowRemoteModels = true;

// 2. GESTION DU CACHE
// Mettez 'false' UNIQUEMENT si vous développez et que vous avez corrompu le modèle.
env.useBrowserCache = true; 

class AIEmbedding {
  static task = 'feature-extraction';
  static model = 'Xenova/all-MiniLM-L6-v2';
  static instance = null;

  static async getInstance() {
    if (this.instance === null) {
      console.log("🚀 Démarrage du chargement du modèle IA...");
      this.instance = await pipeline(this.task, this.model, {
        progress_callback: (data) => {
          if (data.status === 'progress') {
             // Optionnel : Log de progression
             // console.log(`Chargement modèle: ${Math.round(data.progress)}%`);
          }
        }
      });
      console.log("✅ Modèle IA chargé et prêt !");
    }
    return this.instance;
  }
}

// 1. Fonction pour précharger l'IA sans bloquer (Utilisée par Landing.jsx)
export const preloadModel = () => {
  AIEmbedding.getInstance().catch(err => console.error("Erreur préchargement IA:", err));
};

// 2. Génère le vecteur mathématique à partir du texte (Utilisée par QuizStep.jsx)
export async function generateProfileVector(text) {
  const extractor = await AIEmbedding.getInstance();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// 3. Helper pour transformer les réponses du Quiz en texte riche (Utilisée par QuizStep.jsx)
export function buildNarrativeProfile(answers, questionsList) {
  let personalityTraits = [];
  let values = [];
  let hobbies = [];

  // 1. On trie les réponses par importance (basé sur la catégorie de la question)
  Object.entries(answers).forEach(([qId, optionId]) => {
    const question = questionsList.find(q => q.id === qId);
    const option = question?.options?.find(o => o.id === optionId);
    
    if (option && option.text) {
      // Tu peux ajouter une propriété 'category' dans tes questions SQL pour affiner ça
      // Pour l'instant, on met tout ensemble, mais l'IA comprendra le contexte sémantique
      personalityTraits.push(option.text);
    }
  });

  // 2. LA STRATÉGIE "ANTI-SILO" :
  // On construit un texte où la personnalité écrase le statut scolaire.
  // On N'INCLUT PAS la filière/formation ici explicitement, 
  // ou alors on la met à la toute fin avec peu d'importance.
  
  const narrative = `
    D'un point de vue personnel et psychologique : ${personalityTraits.join(". ")}.
    
    Mes valeurs profondes et mon fonctionnement social : ${personalityTraits.join(", ")}.
    
    Ce que je recherche avant tout : Une connexion humaine basée sur ces traits de caractère.
  `;

  return narrative.trim();
}