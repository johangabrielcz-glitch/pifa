'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, ShieldCheck, ChevronRight, User } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PifaLogo } from '@/components/pifa/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { syncPushToken } from '@/lib/push-notifications'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!username.trim() || !password.trim()) {
      toast.error('Por favor, completa todos los campos')
      return
    }

    setIsLoading(true)

    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('*, club:clubs(*)')
        .eq('username', username.trim())
        .eq('password', password)
        .eq('role', 'user')
        .single()

      if (error || !user) {
        toast.error('Usuario o contraseña incorrectos')
        setIsLoading(false)
        return
      }

      const session = {
        user: {
          id: user.id,
          username: user.username,
          password: user.password,
          full_name: user.full_name,
          role: user.role,
          club_id: user.club_id,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
        club: user.club || null,
      }
      
      localStorage.setItem('pifa_auth_session', JSON.stringify(session))
      
      // Sync Push Token if exists
      await syncPushToken(user.id, user.full_name, 'login')
      
      toast.success(`Bienvenido, ${user.full_name}`)
      router.push('/dashboard')
    } catch {
      toast.error('Error al iniciar sesión')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#0A0A0A] selection:bg-[#00FF85]/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#FF6B00]/15 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#FF3131]/5 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
      </div>

      {/* Content */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-10">
          
          {/* Header Section */}
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="relative group">
              <div className="absolute inset-0 bg-[#FF6B00]/30 rounded-full blur-3xl group-hover:bg-[#FF6B00]/50 transition-all duration-700" />
              <div className="relative w-24 h-24 bg-[#141414] border border-[#202020] rounded-[32px] flex items-center justify-center p-5 shadow-2xl">
                <PifaLogo size="lg" showText={false} />
              </div>
            </div>
            
            <div className="space-y-1">
              <h1 className="text-4xl font-black text-white tracking-tighter uppercase">
                PIFA <span className="text-[#00FF85]">DT</span>
              </h1>
              <p className="text-[10px] font-bold text-[#6A6C6E] uppercase tracking-[0.4em] ml-1">
                Football Management
              </p>
            </div>
          </div>

          {/* Form Section */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-widest ml-1">
                Usuario
              </label>
              <div className="relative group">
                <Input
                  type="text"
                  placeholder="Introduce tu usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  className="h-16 bg-[#141414]/50 border-[#202020] text-white rounded-2xl pl-12 focus:ring-[#00FF85]/20 focus:border-[#00FF85] transition-all duration-300 placeholder:text-[#2D2D2D] placeholder:font-bold placeholder:uppercase placeholder:text-[10px]"
                  disabled={isLoading}
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#2D2D2D] group-focus-within:text-[#00FF85] transition-colors">
                  <User size={20} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-widest ml-1">
                Contraseña
              </label>
              <div className="relative group">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Tu clave de acceso"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-16 bg-[#141414]/50 border-[#202020] text-white rounded-2xl pl-12 pr-14 focus:ring-[#00FF85]/20 focus:border-[#00FF85] transition-all duration-300 placeholder:text-[#2D2D2D] placeholder:font-bold placeholder:uppercase placeholder:text-[10px]"
                  disabled={isLoading}
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#2D2D2D] group-focus-within:text-[#00FF85] transition-colors">
                  <Eye size={20} />
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#2D2D2D] hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-16 bg-[#00FF85] hover:bg-[#00E676] text-[#0A0A0A] font-black uppercase tracking-[0.2em] text-xs rounded-2xl shadow-[0_10px_30px_rgba(0,255,133,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 mt-4 h-16"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Cargando</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>Iniciar Sesión</span>
                  <ChevronRight size={18} />
                </div>
              )}
            </Button>
          </form>

          {/* Footer Section */}
          <div className="pt-10 flex flex-col items-center space-y-6">
            <Link
              href="/admin-login"
              className="group flex items-center gap-3 px-6 py-3 rounded-full bg-[#141414] border border-[#202020] hover:border-[#00FF85]/30 transition-all duration-500"
            >
              <ShieldCheck className="w-4 h-4 text-[#6A6C6E] group-hover:text-[#00FF85] transition-colors" />
              <span className="text-[10px] font-black text-[#6A6C6E] group-hover:text-white uppercase tracking-widest transition-colors">
                Panel Administradores
              </span>
            </Link>
            
            <p className="text-[9px] font-bold text-[#2D2D2D] uppercase tracking-[0.3em]">
              PIFA · International Football Asociación
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
