'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LogOut, User, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { MobileNav } from '@/components/pifa/mobile-nav'
import { PifaLogo } from '@/components/pifa/logo'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AuthSession, User as UserType } from '@/lib/types'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<UserType | null>(null)

  useEffect(() => {
    const checkAuth = () => {
      const stored = localStorage.getItem('pifa_auth_session')
      if (!stored) {
        router.replace('/admin-login')
        return
      }

      try {
        const session: AuthSession = JSON.parse(stored)
        
        if (!session.user || session.user.role !== 'admin') {
          router.replace('/admin-login')
          return
        }

        setUser(session.user)
        setIsLoading(false)
      } catch {
        localStorage.removeItem('pifa_auth_session')
        router.replace('/admin-login')
      }
    }

    checkAuth()
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('pifa_auth_session')
    toast.success('Sesión cerrada correctamente')
    router.replace('/admin-login')
  }

  if (isLoading) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-background">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
          <Loader2 className="relative w-8 h-8 animate-spin text-primary" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground animate-fade-in-up">Verificando acceso...</p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* Premium Admin Header */}
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-2xl border-b border-white/[0.06] shadow-[0_1px_20px_rgba(0,0,0,0.15)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-pifa-red/30 to-primary/30 rounded-xl blur-md" />
              <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-pifa-red to-pifa-orange flex items-center justify-center shadow-lg">
                <Settings className="w-4.5 h-4.5 text-white" />
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-foreground tracking-tight">PIFA Admin</p>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Panel de Control</p>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 h-9 px-2 hover:bg-white/[0.04] transition-colors">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-full blur-sm" />
                  <div className="relative w-7 h-7 rounded-full bg-gradient-to-br from-primary/30 to-pifa-red/30 border border-primary/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">
                      {user?.full_name?.charAt(0)?.toUpperCase() || 'A'}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground max-w-[80px] truncate hidden sm:inline">
                  {user?.full_name || user?.username}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 bg-card/95 backdrop-blur-xl border-white/[0.08]">
              <div className="px-3 py-2.5">
                <p className="text-sm font-semibold text-foreground">{user?.full_name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">@{user?.username}</p>
              </div>
              <DropdownMenuSeparator className="bg-white/[0.06]" />
              <DropdownMenuItem 
                onClick={handleLogout}
                className="text-destructive focus:text-destructive cursor-pointer gap-2 py-2"
              >
                <LogOut className="w-4 h-4" />
                Cerrar Sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Content with animation */}
      <div data-admin-user={JSON.stringify(user)} className="min-h-[calc(100dvh-120px)] pb-20 animate-fade-in-up">
        {children}
      </div>
      <MobileNav variant="admin" />
    </div>
  )
}
