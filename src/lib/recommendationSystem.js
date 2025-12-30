// src/lib/recommendationSystem.js

// Petites questions fun si on a peu de points communs
const FUN_QUESTIONS = [
    "Si tu pouvais te téléporter n'importe où maintenant, tu irais où ?",
    "Plutôt équipe matin ou nuit blanche pour réviser ?",
    "C'est quoi la série que tu pourrais regarder 10 fois sans te lasser ?",
    "Un talent caché inutile dont tu es fier ?",
    "Pizza ananas : génie ou crime contre l'humanité ?",
    "Ton avis honnête sur le RU cette année ?"
];

export const generateIcebreakers = (me, other) => {
    const suggestions = [];

    if (!me || !other) return ["Salut ! 👋"];

    // 1. ANALYSE DES POINTS COMMUNS (La "Data")
    
    // Même Campus
    if (me.etudes_lieu && other.etudes_lieu && me.etudes_lieu === other.etudes_lieu) {
        suggestions.push(`Tu es aussi sur le campus de ${me.etudes_lieu} ?`);
    }

    // Même Domaine d'étude
    if (me.domaine && other.domaine && me.domaine === other.domaine) {
        suggestions.push(`Sympa, on est tous les deux en ${me.domaine} ! C'est comment de ton côté ?`);
    }

    // Même Diplôme (approximatif)
    if (me.type_diplome && other.type_diplome && me.type_diplome === other.type_diplome) {
        suggestions.push(`Toi aussi en ${me.type_diplome} ? La charge de travail ça va ?`);
    }

    // 2. ANALYSE DE LA PERSONNALITÉ (Les "Vibes")
    // On suppose que score est entre 0 et 1 ou 0 et 100
    const score = other.personality_score > 1 ? other.personality_score : other.personality_score * 100;

    if (score >= 85) {
        suggestions.push(`Wow, ${Math.round(score)}% de compatibilité ! L'algo dit qu'on devrait bien s'entendre 😄`);
    } else if (score >= 60) {
        suggestions.push(`On a de bonnes vibes en commun apparemment !`);
    }

    // 3. COMPLÉTER AVEC DU FUN (Si on n'a pas assez de points communs)
    // On mélange les questions funs pour ne pas avoir toujours les mêmes
    const shuffledFun = [...FUN_QUESTIONS].sort(() => 0.5 - Math.random());
    
    // On remplit jusqu'à avoir 3 suggestions
    while (suggestions.length < 3) {
        const nextFun = shuffledFun.pop();
        if (nextFun) suggestions.push(nextFun);
        else break;
    }

    // On retourne les 3 premières (mélange de contextuel et de fun)
    return suggestions.slice(0, 3);
};