'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { syncPushToken } from '@/lib/push-notifications'

function TokenCapture() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Buscar tanto 'token' como 'expoPushToken' en la URL
    const token = searchParams.get('token') || searchParams.get('expoPushToken')

    if (token) {
      console.log('Push Token detectado en URL:', token)
      
      // 1. Guardar inmediatamente en localStorage
      localStorage.setItem('expoPushToken', token)

      // 2. Intentar sincronizar si ya hay una sesión activa
      const sessionStr = localStorage.getItem('pifa_auth_session')
      if (sessionStr) {
        try {
          const session = JSON.parse(sessionStr)
          if (session.user?.id) {
            console.log('Sincronizando token detectado para usuario logueado...')
            syncPushToken(session.user.id, session.user.full_name, 'login', token)
          }
        } catch (e) {
          console.error('Error al intentar sincronizar token capturado:', e)
        }
      }

      // 3. Limpiar la URL sin recargar usando Next.js Router
      const params = new URLSearchParams(searchParams.toString())
      params.delete('token')
      params.delete('expoPushToken')
      
      const queryString = params.toString()
      const newPath = queryString ? `${pathname}?${queryString}` : pathname
      router.replace(newPath)
    }
  }, [searchParams, pathname, router])

  return null
}

export function PushTokenHandler() {
  return (
    <Suspense fallback={null}>
      <TokenCapture />
    </Suspense>
  )
}
