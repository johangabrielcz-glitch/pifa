'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LogOut, User } from 'lucide-react'
import { toast } from 'sonner'
import { MobileNav } from '@/components/pifa/mobile-nav'
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
    toast.success('Sesion cerrada correctamente')
    router.replace('/admin-login')
  }

  if (isLoading) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Verificando acceso...</p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* Admin Header with user menu */}
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-pifa-red flex items-center justify-center">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">PIFA Admin</p>
              <p className="text-[10px] text-muted-foreground">Panel de Control</p>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 h-9 px-2">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <span className="text-xs text-muted-foreground max-w-[80px] truncate">
                  {user?.full_name || user?.username}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium text-foreground">{user?.full_name}</p>
                <p className="text-xs text-muted-foreground">@{user?.username}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleLogout}
                className="text-destructive focus:text-destructive cursor-pointer"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Cerrar Sesion
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Admin info stored in data attribute for child components */}
      <div data-admin-user={JSON.stringify(user)} className="min-h-[calc(100dvh-120px)] pb-20">
        {children}
      </div>
      <MobileNav variant="admin" />
    </div>
  )
}
