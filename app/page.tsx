'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { PifaLogo } from '@/components/pifa/logo'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    // Check if user is already logged in
    const stored = localStorage.getItem('pifa_auth_session')
    
    if (stored) {
      try {
        const session = JSON.parse(stored)
        if (session.user) {
          // Redirect based on role
          if (session.user.role === 'admin') {
            router.replace('/admin')
          } else {
            router.replace('/dashboard')
          }
          return
        }
      } catch {
        localStorage.removeItem('pifa_auth_session')
      }
    }
    
    // If not logged in, redirect to login
    router.replace('/login')
  }, [router])

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-pifa-gradient">
      <PifaLogo size="xl" showText={true} className="text-white [&_span]:text-white" />
      <div className="mt-8 flex items-center gap-2 text-white/80">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Cargando...</span>
      </div>
    </div>
  )
}
