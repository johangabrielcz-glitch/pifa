'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, User, ChevronRight, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PifaLogo } from '@/components/pifa/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function AdminLoginPage() {
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
        .select('*')
        .eq('username', username.trim())
        .eq('password', password)
        .eq('role', 'admin')
        .single()

      if (error || !user) {
        toast.error('Credenciales de administrador incorrectas')
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
        club: null,
      }
      
      localStorage.setItem('pifa_auth_session', JSON.stringify(session))
      
      toast.success(`Bienvenido, ${user.full_name}`)
      router.push('/admin')
    } catch {
      toast.error('Error al iniciar sesión')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-background safe-area-top safe-area-bottom">
      {/* Background gradient accent - Red tint for admin */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-pifa-red to-pifa-orange rounded-full blur-3xl opacity-15" />
        <div className="absolute -bottom-40 -left-40 w-60 h-60 bg-pifa-red rounded-full blur-3xl opacity-10" />
      </div>

      {/* Content */}
      <div className="relative flex-1 flex flex-col px-6 pt-16">
        {/* Logo & Title */}
        <div className="flex flex-col items-center mb-12">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-pifa-red/20 rounded-full blur-xl" />
            <div className="relative bg-card border border-border/50 rounded-full p-4">
              <Shield className="w-12 h-12 text-pifa-red" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            Panel Admin
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Acceso exclusivo administradores
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Usuario Admin
            </label>
            <Input
              type="text"
              placeholder="Tu usuario de administrador"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              className="h-14 bg-card border-border/50 text-base placeholder:text-muted-foreground/50 focus:border-pifa-red/50 focus:ring-pifa-red/20"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Contraseña
            </label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-14 bg-card border-border/50 text-base pr-14 placeholder:text-muted-foreground/50 focus:border-pifa-red/50 focus:ring-pifa-red/20"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-2"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-14 text-base font-semibold bg-gradient-to-r from-pifa-red to-pifa-orange text-white hover:opacity-90 transition-opacity mt-6"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                Acceder al Panel
                <ChevronRight className="w-5 h-5 ml-2" />
              </>
            )}
          </Button>
        </form>

        {/* Spacer */}
        <div className="flex-1 min-h-8" />

        {/* User Login Link */}
        <div className="pb-8">
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-card border border-border/50 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-all touch-active"
          >
            <User className="w-4 h-4" />
            <span>Acceso Directores Técnicos</span>
          </Link>
          
          <div className="flex items-center justify-center gap-2 mt-6">
            <PifaLogo size="sm" showText={false} />
            <p className="text-xs text-muted-foreground/50">
              PIFA Admin
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
