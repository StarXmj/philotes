// src/hooks/useNotifications.js
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

export function useNotifications() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState({}) 
  // Structure: { [userId]: { unreadCount: 0, hasPendingRequest: false } }

  const fetchNotifications = async () => {
    if (!user?.id) return

    // 1. Récupérer les messages non lus reçus
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('receiver_id', user.id)
      .is('read_at', null)

    // 2. Récupérer les demandes de connexion reçues (en attente)
    const { data: requests, error: reqError } = await supabase
      .from('connections')
      .select('sender_id')
      .eq('receiver_id', user.id)
      .eq('status', 'pending')

    if (msgError || reqError) {
      console.error("Erreur notifications", msgError || reqError)
      return
    }

    // 3. Agréger les données par utilisateur (sender)
    const newNotifs = {}

    messages.forEach(msg => {
      if (!newNotifs[msg.sender_id]) newNotifs[msg.sender_id] = { unreadCount: 0, hasPendingRequest: false }
      newNotifs[msg.sender_id].unreadCount += 1
    })

    requests.forEach(req => {
      if (!newNotifs[req.sender_id]) newNotifs[req.sender_id] = { unreadCount: 0, hasPendingRequest: false }
      newNotifs[req.sender_id].hasPendingRequest = true
    })

    setNotifications(newNotifs)
  }

  useEffect(() => {
    if (!user?.id) return

    // Charger l'état initial
    fetchNotifications()

    // Configuration Realtime : on écoute tout ce qui nous concerne
    const channel = supabase.channel('global-notifications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        () => fetchNotifications() // On re-fetch pour être sûr d'avoir le compte exact (plus simple et robuste)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'connections', filter: `receiver_id=eq.${user.id}` },
        () => fetchNotifications()
      )
      // Cas spécifique : Si JE lis un message (update read_at), la notif doit disparaitre
      // (Supabase envoie l'event UPDATE au receiver_id si la policy le permet, sinon on peut écouter globalement ou gérer via l'UI)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id])

  return notifications
}