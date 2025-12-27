import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useNotifications(user) {
  const [unreadCounts, setUnreadCounts] = useState({})
  // On garde une ref du user pour l'utiliser dans les callbacks du realtime sans soucis de closure
  const userRef = useRef(user)
  
  useEffect(() => {
    userRef.current = user
  }, [user])

  // 1. CHARGEMENT INITIAL DES NON-LUS (Persistance)
  useEffect(() => {
    if (!user) return

    const fetchInitialCounts = async () => {
      // On utilise la fonction RPC créée en Phase 1 pour la rapidité
      // SINON (si tu n'as pas mis la RPC), utilise la méthode classique ci-dessous :
      const { data, error } = await supabase
        .from('messages')
        .select('sender_id')
        .eq('receiver_id', user.id)
        .is('read_at', null)

      if (data) {
        // On transforme la liste en objet de comptage { id_sender: nombre }
        const counts = data.reduce((acc, msg) => {
          acc[msg.sender_id] = (acc[msg.sender_id] || 0) + 1
          return acc
        }, {})
        setUnreadCounts(counts)
      }
    }

    fetchInitialCounts()
  }, [user])

  // 2. ÉCOUTE TEMPS RÉEL (Le cœur du système)
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('global-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}` // On n'écoute que ce qui nous est destiné
        },
        (payload) => {
          // Un nouveau message arrive pour moi !
          const senderId = payload.new.sender_id
          
          setUnreadCounts((prev) => ({
            ...prev,
            [senderId]: (prev[senderId] || 0) + 1
          }))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  // 3. FONCTION POUR MARQUER COMME LU (Quand on ouvre le chat)
  const markAsRead = async (senderId) => {
    // A. Mise à jour visuelle immédiate (Optimiste)
    setUnreadCounts((prev) => {
      const newCounts = { ...prev }
      delete newCounts[senderId] // On supprime le compteur pour cette personne
      return newCounts
    })

    // B. Mise à jour Base de données
    if (user) {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('receiver_id', user.id)     // C'est moi le receveur
        .eq('sender_id', senderId)      // C'est lui l'envoyeur
        .is('read_at', null)            // Seulement ceux pas encore lus
    }
  }

  return { unreadCounts, markAsRead }
}