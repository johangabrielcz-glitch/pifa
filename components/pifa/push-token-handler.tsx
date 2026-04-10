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

      // 2. Solo guardamos localmente. El Dashboard se encargará de sincronizar
      // una vez que la sesión esté lista y la app navegada.
      console.log('Token guardado localmente, sincronización pospuesta al Dashboard.')

      // 3. Limpiar la URL sin recargar de forma silenciosa para evitar interferir con el router de Next.js
      const params = new URLSearchParams(searchParams.toString())
      params.delete('token')
      params.delete('expoPushToken')
      
      const queryString = params.toString()
      const newPath = queryString ? `${pathname}?${queryString}` : pathname
      
      // Usamos history.replaceState directamente para evitar que el router de Next.js
      // colisione con el redireccionamiento principal de app/page.tsx
      window.history.replaceState({}, '', newPath)
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
