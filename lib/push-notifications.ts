import { supabase } from './supabase'

/**
 * Sincroniza el token de push de Expo con la base de datos de Supabase.
 * @param userId ID del usuario (DT o Admin)
 * @param userName Nombre del usuario para referencia
 * @param action 'login' para registrarlo, 'logout' para eliminarlo
 * @param tokenOverride Token opcional si se recibe directamente de la URL
 */
export async function syncPushToken(userId: string, userName: string, action: 'login' | 'logout', tokenOverride?: string): Promise<{ success: boolean; error?: string }> {
  const token = tokenOverride || (typeof window !== 'undefined' ? localStorage.getItem('expoPushToken') : null)
  
  if (!token) {
    if (action === 'login') {
      console.log('No push token found to sync (login).')
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
        }, { onConflict: 'user_id,expo_push_token' })

      if (error) throw error
      console.log('Push token synced successfully for user:', userName)
      return { success: true }
    } else {
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
