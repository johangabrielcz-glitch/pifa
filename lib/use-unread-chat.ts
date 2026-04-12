import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

export function useUnreadChat(userId?: string, clubId?: string) {
  const [unreadCount, setUnreadCount] = useState(0)
  const lastReadLocalTimeRef = useRef<number>(0)

  useEffect(() => {
    if (!userId || !clubId) return

    const fetchUnreadCount = async () => {
      try {
        // PERIODO DE GRACIA: Si leímos localmente hace menos de 3 seg, forzar 0
        const nowMs = Date.now()
        const localReadAtStr = localStorage.getItem(`pifa_chat_read_at_${userId}`)
        if (localReadAtStr) {
          const localReadMs = new Date(localReadAtStr).getTime()
          if (nowMs - localReadMs < 3000) {
            setUnreadCount(0)
            return
          }
        }

        // 1. Obtener simultáneamente el último leído y el último total
        const [readRes, lastMsgRes] = await Promise.all([
          supabase
            .from('global_chat_read_status')
            .select('last_read_message_id')
            .eq('user_id', userId)
            .eq('club_id', clubId)
            .single(),
          supabase
            .from('global_chat_messages')
            .select('id, created_at')
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
        ])

        const lastReadIdFromDB = readRes.data?.last_read_message_id
        const latestMsg = lastMsgRes.data
        const lastReadIdFromLocal = localStorage.getItem(`pifa_chat_last_id_${userId}`)

        // REGLA DE ORO: Si el ID local o DB coincide con el último mensaje, ES CERO.
        if (latestMsg && (lastReadIdFromLocal === latestMsg.id || lastReadIdFromDB === latestMsg.id)) {
          setUnreadCount(0)
          return
        }

        // 3. Aplicar blindaje por marca de tiempo (backup)
        if (localReadAtStr && latestMsg) {
          const localDate = new Date(localReadAtStr).getTime()
          const latestDate = new Date(latestMsg.created_at).getTime()
          if (latestDate <= localDate) {
            setUnreadCount(0)
            return
          }
        }

        // 4. Si no hay coincidencia directa, calcular el conteo exacto
        const finalLastReadId = lastReadIdFromDB || lastReadIdFromLocal

        if (!finalLastReadId) {
          const { count } = await supabase
            .from('global_chat_messages')
            .select('*', { count: 'exact', head: true })
          setUnreadCount(count || 0)
          return
        }

        // Obtener la fecha del último mensaje leído para contar los nuevos
        const { data: msgData } = await supabase
          .from('global_chat_messages')
          .select('created_at')
          .eq('id', finalLastReadId)
          .single()

        if (!msgData) {
          setUnreadCount(0)
          return
        }

        const { count } = await supabase
          .from('global_chat_messages')
          .select('*', { count: 'exact', head: true })
          .gt('created_at', msgData.created_at)

        setUnreadCount(count || 0)
      } catch (err) {
        console.error('Error fetching unread count:', err)
      }
    }

    fetchUnreadCount()

    // Suscripciones Realtime
    const messagesChannel = supabase
      .channel('unread-chat-messages')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'global_chat_messages' 
      }, () => {
        fetchUnreadCount()
      })
      .subscribe()

    // Evento Local para limpieza instantánea + re-fetch de seguridad
    const handleLocalRead = () => {
      setUnreadCount(0)
      // Actualizar el tiempo de lectura local
      lastReadLocalTimeRef.current = Date.now()
      setTimeout(fetchUnreadCount, 500)
    }
    window.addEventListener('pifa_chat_read', handleLocalRead)

    return () => {
      supabase.removeChannel(messagesChannel)
      window.removeEventListener('pifa_chat_read', handleLocalRead)
    }
  }, [userId, clubId])

  return unreadCount
}
