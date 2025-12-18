import { pipeline, env } from '@xenova/transformers';

// --- CONFIGURATION ANTI-BUG ---
// 1. On interdit strictement le local (pour éviter l'erreur <doctype)
env.allowLocalModels = false;
env.allowRemoteModels = true;

// 2. CRUCIAL : On désactive le cache pour ce test
// Cela oblige le navigateur à retélécharger le bon modèle et écraser le fichier corrompu
env.useBrowserCache = true; 

class AIEmbedding {
  static task = 'feature-extraction';
  static model = 'Xenova/all-MiniLM-L6-v2';
  static instance = null;

  static async getInstance() {
    if (this.instance === null) {
      this.instance = await pipeline(this.task, this.model);
    }
    return this.instance;
  }
}

export async function generateProfileVector(text) {
  const extractor = await AIEmbedding.getInstance();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}