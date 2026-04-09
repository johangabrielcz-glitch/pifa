import { supabase } from './supabase'

/**
 * Sincroniza el token de push de Expo con la base de datos de Supabase.
 * @param userId ID del usuario (DT o Admin)
 * @param userName Nombre del usuario para referencia
 * @param action 'login' para registrarlo, 'logout' para eliminarlo
 */
export async function syncPushToken(userId: string, userName: string, action: 'login' | 'logout') {
  const token = localStorage.getItem('expoPushToken')
  
  if (!token) {
    console.log('No expoPushToken found in localStorage, skipping sync.')
    return
  }

  try {
    if (action === 'login') {
      // Registrar el token (upsert para evitar duplicados por el constraint unique)
      const { error } = await supabase
        .from('user_push_tokens')
        .upsert({
          user_id: userId,
          user_name: userName,
          expo_push_token: token
        }, { onConflict: 'user_id, expo_push_token' })

      if (error) throw error
      console.log('Push token synced successfully for user:', userName)
    } else {
      // Eliminar el token del servidor al cerrar sesión
      const { error } = await supabase
        .from('user_push_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('expo_push_token', token)

      if (error) throw error
      console.log('Push token removed successfully for user:', userName)
    }
  } catch (err) {
    console.error('Error syncing push token:', err)
  }
}
