'use client'

import { useEffect } from 'react'

/**
 * PushTokenHandler
 * CAPTURA NATIVA DE TOKENS (Solución robusta para APK/WebView)
 * 
 * Este componente utiliza APIs nativas de JavaScript para evitar dependencias
 * de los hooks de Next.js (useSearchParams) que pueden causar bloqueos en el inicio
 * de la app dentro de un WebView.
 */
export function PushTokenHandler() {
  useEffect(() => {
    // 1. Evitar ejecución en el servidor
    if (typeof window === 'undefined') return

    // 2. Extracción de token usando URLSearchParams nativo
    try {
      const urlParams = new URLSearchParams(window.location.search)
      const token = urlParams.get('token') || urlParams.get('expoPushToken')

      if (token) {
        console.log('[NativeCapture] Push Token detectado:', token)
        
        // 3. Guardado en localStorage
        localStorage.setItem('expoPushToken', token)

        // 4. Limpieza inmediata de la URL de forma silenciosa e instantánea
        // Esto evita que el router de Next.js colisione con el redireccionamiento principal.
        const newPath = window.location.pathname
        window.history.replaceState(null, '', newPath)
        
        console.log('[NativeCapture] URL limpiada y token persistido.')
      }
    } catch (e) {
      console.error('[NativeCapture] Error en captura de token:', e)
    }
  }, []) // 5. Dependencias vacías: ejecución obligatoria una sola vez al montar.

  return null
}
