'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function TokenCapture() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const token = searchParams.get('token')

    if (token) {
      // 1. Guardar inmediatamente en localStorage
      localStorage.setItem('expoPushToken', token)
      console.log('Capture Push Token:', token)

      // 2. Limpiar la URL sin recargar
      const url = new URL(window.location.href)
      url.searchParams.delete('token')
      window.history.replaceState({}, '', url.pathname + url.search)
    }
  }, [searchParams])

  return null
}

export function PushTokenHandler() {
  return (
    <Suspense fallback={null}>
      <TokenCapture />
    </Suspense>
  )
}
