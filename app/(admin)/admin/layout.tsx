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
    <div className="min-h-dvh bg-[#0A0A0A] selection:bg-[#FF3131]/30">
      {/* Dynamic Background - Ruby Admin Theme */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-5%] right-[-5%] w-[40%] h-[40%] bg-[#FF3131]/10 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-[-5%] left-[-5%] w-[30%] h-[30%] bg-[#FF3131]/5 rounded-full blur-[80px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
      </div>

      {/* Premium Admin Header */}
      <header className="sticky top-0 z-40 bg-[#141414]/80 backdrop-blur-2xl border-b border-white/[0.04] shadow-[0_1px_40px_rgba(0,0,0,0.4)] pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between px-5 h-16">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="absolute inset-0 bg-[#FF3131]/30 rounded-xl blur-xl group-hover:bg-[#FF3131]/50 transition-all duration-700" />
              <div className="relative w-10 h-10 rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center shadow-2xl transition-transform group-hover:scale-105 active:scale-95">
                <Settings className="w-5 h-5 text-[#FF3131]" />
              </div>
            </div>
            <div>
              <p className="text-sm font-black text-white tracking-tighter uppercase leading-none">PIFA <span className="text-[#FF3131]">ADMIN</span></p>
              <p className="text-[9px] text-[#6A6C6E] font-black uppercase tracking-[0.3em] mt-1">Infrastructure Control</p>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="relative group outline-none">
                <div className="absolute inset-0 bg-[#FF3131]/20 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center gap-3 bg-[#0A0A0A] border border-[#202020] rounded-full pl-1.5 pr-4 py-1.5 transition-all group-hover:border-[#FF3131]/40 shadow-xl">
                  <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-[#FF3131] to-[#D32F2F] flex items-center justify-center border border-white/10 shadow-lg">
                    <span className="text-xs font-black text-white">
                      {user?.full_name?.charAt(0)?.toUpperCase() || 'A'}
                    </span>
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-[10px] font-black text-white uppercase tracking-wider leading-none">
                      {user?.full_name?.split(' ')[0] || user?.username}
                    </p>
                    <p className="text-[8px] text-[#6A6C6E] uppercase font-bold tracking-tight">System Root</p>
                  </div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-[#141414]/95 backdrop-blur-xl border-white/[0.08] p-2 mt-2 rounded-[24px] shadow-2xl">
              <div className="px-4 py-3">
                <p className="text-xs font-black text-white uppercase tracking-widest">{user?.full_name}</p>
                <p className="text-[10px] text-[#6A6C6E] font-bold mt-1">@{user?.username}</p>
              </div>
              <div className="h-[1px] bg-white/[0.05] my-2 mx-2" />
              <DropdownMenuItem 
                onClick={handleLogout}
                className="text-red-400 focus:text-white focus:bg-red-500/20 cursor-pointer gap-3 py-3 rounded-xl transition-all font-black uppercase tracking-widest text-[10px]"
              >
                <LogOut className="w-4 h-4" />
                Finalizar Sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Content Area */}
      <main data-admin-user={JSON.stringify(user)} className="relative min-h-[calc(100dvh-64px)] pb-10">
        <div className="animate-fade-in-up duration-700">
          {children}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-50">
        <MobileNav variant="admin" />
      </div>
    </div>
  )
}
