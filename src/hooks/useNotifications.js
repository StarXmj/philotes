import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

export function useNotifications() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState({}) 

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return

    // 1. Messages non lus
    const { data: messages } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('receiver_id', user.id)
      .is('read_at', null)

    // 2. Demandes d'amis
    const { data: requests } = await supabase
      .from('connections')
      .select('sender_id')
      .eq('receiver_id', user.id)
      .eq('status', 'pending')

    const newNotifs = {}

    messages?.forEach(m => {
      if (!newNotifs[m.sender_id]) newNotifs[m.sender_id] = { unreadCount: 0, hasPendingRequest: false }
      newNotifs[m.sender_id].unreadCount += 1
    })

    requests?.forEach(r => {
      if (!newNotifs[r.sender_id]) newNotifs[r.sender_id] = { unreadCount: 0, hasPendingRequest: false }
      newNotifs[r.sender_id].hasPendingRequest = true
    })

    setNotifications(newNotifs)
  }, [user?.id])

  // LA FONCTION MANQUANTE
  const markAsRead = async (senderId) => {
    // Optimiste
    setNotifications(prev => {
        const copy = { ...prev }
        if (copy[senderId]) copy[senderId] = { ...copy[senderId], unreadCount: 0 }
        return copy
    })
    // BDD
    if (user?.id) {
        await supabase.from('messages').update({ read_at: new Date().toISOString() })
          .eq('receiver_id', user.id).eq('sender_id', senderId).is('read_at', null)
    }
  }

  useEffect(() => {
    if (!user?.id) return
    fetchNotifications()

    const channel = supabase.channel('global-notifs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, fetchNotifications)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections', filter: `receiver_id=eq.${user.id}` }, fetchNotifications)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id, fetchNotifications])

  // IMPORTANT : On retourne un objet structuré
  return { notifications, markAsRead }
}