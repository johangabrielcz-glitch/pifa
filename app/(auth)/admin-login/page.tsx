'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, User, ChevronRight, Shield, Upload, Database, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PifaLogo } from '@/components/pifa/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { syncPushToken } from '@/lib/push-notifications'
import { MIGRATION_TABLES } from '@/lib/migration-tables'

export default function AdminLoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Import mode (shown only on an empty Supabase project: no admins yet).
  // Probe migration_count_admins() to decide. If the RPC doesn't exist yet
  // (schema.sql wasn't run), surface a hint instead of the import button.
  const [emptyTarget, setEmptyTarget] = useState<null | boolean>(null)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await (supabase as any).rpc('migration_count_admins')
        if (cancelled) return
        if (error) {
          // 404-like (function missing) → schema.sql not yet applied
          setSchemaMissing(true)
          setEmptyTarget(false)
          return
        }
        setEmptyTarget(Number(data ?? 0) === 0)
      } catch {
        if (!cancelled) { setSchemaMissing(true); setEmptyTarget(false) }
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Posts one small JSON body to /api/admin/db-import and returns its parsed response.
  async function callImport(payload: any) {
    const res = await fetch('/api/admin/db-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || `Error ${res.status}`)
    return data
  }

  // Splits rows into chunks whose JSON-encoded size stays under maxBytes, so
  // each request body stays far below Vercel's hard ~4.5MB serverless limit
  // (a full export can be tens of MB — sending it in one shot is what causes
  // the 413 "Content Too Large"). Oversized single rows go in their own chunk.
  function chunkRowsBySize(rows: any[], maxBytes: number): any[][] {
    const chunks: any[][] = []
    let current: any[] = []
    let currentBytes = 2 // []
    for (const row of rows) {
      const rowBytes = JSON.stringify(row).length + 1
      if (current.length > 0 && currentBytes + rowBytes > maxBytes) {
        chunks.push(current)
        current = []
        currentBytes = 2
      }
      current.push(row)
      currentBytes += rowBytes
    }
    if (current.length > 0) chunks.push(current)
    return chunks
  }

  async function handleImport(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      let dump: any
      try { dump = JSON.parse(text) } catch { toast.error('JSON inválido'); return }
      if (!dump || typeof dump !== 'object' || !dump.tables || typeof dump.tables !== 'object') {
        toast.error('JSON inválido'); return
      }
      if (!Array.isArray(dump.tables.users) || !Array.isArray(dump.tables.clubs)) {
        toast.error('El export no contiene users/clubs'); return
      }

      await callImport({ action: 'begin' })

      const tableCounts: Record<string, number> = {}
      const errors: { table: string; error: string }[] = []
      const maxChunkBytes = 1_500_000 // ~1.5MB per request, well under the platform limit

      for (const table of MIGRATION_TABLES) {
        const rows: any[] = (dump.tables[table] as any[]) || []
        let inserted = 0
        for (const chunk of chunkRowsBySize(rows, maxChunkBytes)) {
          const result = await callImport({ action: 'chunk', table, rows: chunk })
          if (!result.ok) {
            errors.push({ table, error: result.error || 'Error desconocido' })
            // Keep going so the rest still imports; truncated rows can be retried.
            break
          }
          inserted += result.inserted || 0
        }
        tableCounts[table] = inserted
      }

      await callImport({ action: 'end' })

      const total = Object.values(tableCounts).reduce((s, n) => s + n, 0)
      if (errors.length) {
        toast.error(`Importado con ${errors.length} errores · ${total} filas`)
      } else {
        toast.success(`Importado · ${total} filas`)
      }
      // Refresh: now there is an admin, the import block hides and the user can log in.
      setEmptyTarget(false)
    } catch (e: any) {
      toast.error(e?.message || 'Error de red')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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
        .eq('password', password.trim())
        .in('role', ['admin', 'moderator'])
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
      
      // Sync Push Token if exists
      await syncPushToken(user.id, user.full_name, 'login')
      
      toast.success(`Bienvenido, ${user.full_name}`)
      router.push('/admin')
    } catch {
      toast.error('Error al iniciar sesión')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#0A0A0A] selection:bg-[#FF3131]/30">
      {/* Dynamic Background - Ruby Theme */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#FF3131]/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#FF3131]/5 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
      </div>

      {/* Content */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-10">
          
          {/* Admin Header Section */}
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="relative group">
              <div className="absolute inset-0 bg-[#FF3131]/20 rounded-full blur-3xl group-hover:bg-[#FF6B00]/40 transition-all duration-700" />
              <div className="relative w-24 h-24 bg-[#141414] border border-[#202020] rounded-[32px] flex items-center justify-center p-5 shadow-2xl">
                <PifaLogo size="lg" showText={false} />
              </div>
            </div>
            
            <div className="space-y-1">
              <h1 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">
                PANEL <span className="text-[#FF3131]">ADMIN</span>
              </h1>
              <p className="text-[10px] font-bold text-[#6A6C6E] uppercase tracking-[0.4em] ml-1">
                Authorized Personnel Only
              </p>
            </div>
          </div>

          {/* Admin Form Section */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-widest ml-1">
                System Administrator
              </label>
              <div className="relative group">
                <Input
                  type="text"
                  placeholder="Usuario Administrativo"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  className="h-16 bg-[#141414]/50 border-[#202020] text-white rounded-2xl pl-12 focus:ring-[#FF3131]/20 focus:border-[#FF3131] transition-all duration-300 placeholder:text-[#2D2D2D] placeholder:font-bold placeholder:uppercase placeholder:text-[10px]"
                  disabled={isLoading}
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#2D2D2D] group-focus-within:text-[#FF3131] transition-colors">
                  <User size={20} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-widest ml-1">
                Access Token
              </label>
              <div className="relative group">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Ingrese Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-16 bg-[#141414]/50 border-[#202020] text-white rounded-2xl pl-12 pr-14 focus:ring-[#FF3131]/20 focus:border-[#FF3131] transition-all duration-300 placeholder:text-[#2D2D2D] placeholder:font-bold placeholder:uppercase placeholder:text-[10px]"
                  disabled={isLoading}
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#2D2D2D] group-focus-within:text-[#FF3131] transition-colors">
                  <Shield size={20} />
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
              className="w-full h-16 bg-[#FF3131] hover:bg-[#D32F2F] text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl shadow-[0_10px_30px_rgba(255,49,49,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 mt-4 h-16"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Verificando</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>Validar Credenciales</span>
                  <ChevronRight size={18} />
                </div>
              )}
            </Button>
          </form>

          {/* Initialize from another project (only on an empty destination) */}
          {emptyTarget === true && (
            <div className="bg-[#141414]/60 border border-[#00FF85]/15 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#00FF85]" />
                <p className="text-[10px] font-black text-white uppercase tracking-widest">Inicializar desde otro proyecto</p>
              </div>
              <p className="text-[9px] text-[#6A6C6E] font-bold uppercase tracking-widest leading-relaxed">
                Este proyecto está vacío. Sube el <span className="text-white">pifa-export-*.json</span> que generaste en el proyecto viejo.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f) }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="w-full h-11 bg-[#00FF85] hover:bg-[#00e077] text-[#0A0A0A] rounded-xl font-black uppercase tracking-widest text-[10px] shadow-[0_0_20px_rgba(0,255,133,0.25)] transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Importar JSON
              </button>
              <p className="text-[8px] text-amber-400/80 font-black uppercase tracking-widest flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> El destino se vacía y se sobrescribe. Esto solo aparece mientras no haya admins.
              </p>
            </div>
          )}
          {schemaMissing && (
            <div className="bg-[#141414]/60 border border-amber-400/15 rounded-2xl p-4">
              <p className="text-[9px] text-amber-300 font-black uppercase tracking-widest flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                Primero ejecuta <span className="text-white">scripts/schema.sql</span> en el SQL editor de Supabase.
              </p>
            </div>
          )}

          {/* Admin Footer Section */}
          <div className="pt-10 flex flex-col items-center space-y-6">
            <Link
              href="/login"
              className="group flex items-center gap-3 px-6 py-3 rounded-full bg-[#141414] border border-[#202020] hover:border-[#FF3131]/30 transition-all duration-500"
            >
              <User className="w-4 h-4 text-[#6A6C6E] group-hover:text-[#FF3131] transition-colors" />
              <span className="text-[10px] font-black text-[#6A6C6E] group-hover:text-white uppercase tracking-widest transition-colors">
                Volver a Director Técnico
              </span>
            </Link>
            
            <div className="flex items-center gap-3">
              <PifaLogo size="sm" showText={false} />
              <p className="text-[9px] font-bold text-[#2D2D2D] uppercase tracking-[0.3em]">
                PIFA Secure Infrastructure
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
