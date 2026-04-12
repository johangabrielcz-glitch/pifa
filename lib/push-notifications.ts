import { supabase } from './supabase'

/**
 * Envía una notificación push a través del servicio de Expo o el proxy interno.
 * Soporta múltiples tokens para envío masivo.
 */
export async function sendExpoPush(tokens: string[], title: string, body: string, data?: any) {
  if (!tokens || tokens.length === 0) return { success: true, sentCount: 0 }

  // Filtrar tokens duplicados o vacíos
  const uniqueTokens = [...new Set(tokens)].filter(t => t.startsWith('ExponentPushToken'))
  if (uniqueTokens.length === 0) return { success: true, sentCount: 0 }

  // DETERMINAR SI USAR PROXY (Browser) O DIRECTO (Server)
  const isBrowser = typeof window !== 'undefined'

  if (isBrowser) {
    try {
      const response = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: uniqueTokens, title, message: body, data }),
      })
      return await response.json()
    } catch (error) {
      console.error('Error calling Push Proxy:', error)
      return { success: false, error: 'Error de red al llamar al proxy de notificaciones' }
    }
  }

  // SI ES SERVIDOR (API Routes o Motores) - Llamada directa a Expo
  const messages = uniqueTokens.map(token => ({
    to: token,
    sound: 'default',
    title,
    body,
    data,
    priority: 'high',
    channelId: 'default',
  }))

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    })

    const result = await response.json()
    console.log('Expo Push Server Result:', result)
    return { success: true, sentCount: uniqueTokens.length, result }
  } catch (error) {
    console.error('Error sending Expo Push from Server:', error)
    return { success: false, error }
  }
}

/**
 * Busca todos los tokens de todos los miembros de un club y envía la notificación.
 */
export async function sendPushToClub(clubId: string, title: string, body: string, data?: any) {
  try {
    // Join entre tokens y usuarios para filtrar por club
    const { data: tokenData, error } = await supabase
      .from('user_push_tokens')
      .select('expo_push_token, users!inner(club_id)')
      .eq('users.club_id', clubId)

    if (error) throw error

    const tokens = (tokenData as any[] || []).map(t => t.expo_push_token)
    return await sendExpoPush(tokens, title, body, data)
  } catch (err) {
    console.error(`Error sending push to club ${clubId}:`, err)
    return { success: false, error: err }
  }
}

/**
 * Envía una notificación a un usuario específico (a todos sus dispositivos registrados).
 */
export async function sendPushToUser(userId: string, title: string, body: string, data?: any) {
  try {
    const { data: tokenData, error } = await supabase
      .from('user_push_tokens')
      .select('expo_push_token')
      .eq('user_id', userId)

    if (error) throw error

    const tokens = (tokenData as any[] || []).map(t => t.expo_push_token)
    return await sendExpoPush(tokens, title, body, data)
  } catch (err) {
    console.error(`Error sending push to user ${userId}:`, err)
    return { success: false, error: err }
  }
}

/**
 * Envía una notificación a TODOS los usuarios registrados.
 */
export async function sendPushToAll(title: string, body: string, data?: any, excludeUserId?: string) {
  try {
    let query = supabase
      .from('user_push_tokens')
      .select('expo_push_token')

    if (excludeUserId) {
      query = query.neq('user_id', excludeUserId)
    }

    const { data: tokenData, error } = await query

    if (error) throw error

    const tokens = (tokenData as any[] || []).map(t => t.expo_push_token)
    return await sendExpoPush(tokens, title, body, data)
  } catch (err) {
    console.error(`Error sending push to all:`, err)
    return { success: false, error: err }
  }
}

/**
 * Sincroniza el token de push de Expo con la base de datos de Supabase.
 * @param userId ID del usuario (DT o Admin)
 * @param userName Nombre del usuario para referencia
 * @param action 'login' para registrarlo, 'logout' para eliminarlo
 * @param tokenOverride Token opcional si se recibe directamente de la URL
 */
export async function syncPushToken(userId: string, userName: string, action: 'login' | 'logout', tokenOverride?: string): Promise<{ success: boolean; error?: string }> {
  const token = tokenOverride || (typeof window !== 'undefined' ? localStorage.getItem('expoPushToken') : null)
  
  console.log('🔗 [PUSH DEBUG] Intentando sincronizar:', { 
    userId, 
    userName, 
    action, 
    tokenFound: !!token,
    tokenPreview: token ? `${token.substring(0, 20)}...` : 'N/A'
  })

  if (!token) {
    if (action === 'login') {
      console.warn('⚠️ [PUSH DEBUG] Cancelado: No se encontró ningún expoPushToken en LocalStorage.')
      return { success: false, error: 'No se encontró el token en el dispositivo' }
    }
    return { success: true }
  }

  try {
    if (action === 'login') {
      const { error } = await (supabase.from('user_push_tokens') as any)
        .upsert({
          user_id: userId,
          user_name: userName,
          expo_push_token: token,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,expo_push_token' })

      if (error) {
        console.error('❌ [PUSH DEBUG] Error de Supabase al guardar:', error.message, error.details)
        throw error
      }
      
      console.log('✅ [PUSH DEBUG] Token sincronizado con éxito en DB.')
      return { success: true }
    } else {
      // Eliminar solo el token de este dispositivo al cerrar sesión, no todos
      const { error } = await supabase
        .from('user_push_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('expo_push_token', token)

      if (error) throw error
      console.log('Push token removed successfully for user:', userName)
      return { success: true }
    }
  } catch (err: any) {
    console.error('Error syncing push token:', err)
    return { success: false, error: err.message || 'Error desconocido de red' }
  }
}
