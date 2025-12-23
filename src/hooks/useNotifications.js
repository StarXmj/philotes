// src/hooks/useNotifications.js
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

export function useNotifications() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState({}) 
  // Structure: { [userId]: { unreadCount: 0, hasPendingRequest: false } }

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return

    // 1. Récupérer les messages non lus (read_at IS NULL)
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('receiver_id', user.id)
      .is('read_at', null)

    // 2. Récupérer les demandes (pending)
    const { data: requests, error: reqError } = await supabase
      .from('connections')
      .select('sender_id')
      .eq('receiver_id', user.id)
      .eq('status', 'pending')

    if (msgError || reqError) {
      console.error("Erreur notifications", msgError || reqError)
      return
    }

    const newNotifs = {}

    // Compter les messages
    messages?.forEach(msg => {
      if (!newNotifs[msg.sender_id]) newNotifs[msg.sender_id] = { unreadCount: 0, hasPendingRequest: false }
      newNotifs[msg.sender_id].unreadCount += 1
    })

    // Marquer les demandes
    requests?.forEach(req => {
      if (!newNotifs[req.sender_id]) newNotifs[req.sender_id] = { unreadCount: 0, hasPendingRequest: false }
      newNotifs[req.sender_id].hasPendingRequest = true
    })

    setNotifications(newNotifs)
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return

    fetchNotifications()

    // On écoute TOUT sur les messages reçus.
    // INSERT : Nouveau message -> Notif apparaît
    // UPDATE : Message lu (read_at change) -> Notif disparaît
    const channel = supabase.channel('global-notifications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        () => {
            fetchNotifications()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'connections', filter: `receiver_id=eq.${user.id}` },
        () => fetchNotifications()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, fetchNotifications])

  return notifications
}