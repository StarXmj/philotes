import { pipeline, env } from '@huggingface/transformers'; // <-- Migration effectuée

// --- CONFIGURATION ---
// 1. On interdit le local pour éviter les erreurs de chemin sur Vite/Netlify
env.allowLocalModels = false;
env.allowRemoteModels = true;

// 2. GESTION DU CACHE
// Mettez 'false' UNIQUEMENT si vous développez et que vous avez corrompu le modèle.
// Pour la prod et l'expérience utilisateur, il faut absolument 'true'.
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
          // On pourrait utiliser ça pour une barre de chargement globale
          if (data.status === 'progress') {
             // console.log(`Chargement modèle: ${Math.round(data.progress)}%`);
          }
        }
      });
      console.log("✅ Modèle IA chargé et prêt !");
    }
    return this.instance;
  }
}

// Nouvelle fonction pour précharger l'IA sans bloquer
export const preloadModel = () => {
  AIEmbedding.getInstance().catch(err => console.error("Erreur préchargement IA:", err));
};

export async function generateProfileVector(text) {
  const extractor = await AIEmbedding.getInstance();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}