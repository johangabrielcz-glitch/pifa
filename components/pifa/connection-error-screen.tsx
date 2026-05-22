'use client'

import { WifiOff, LogOut, RefreshCw, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { PifaLogo } from './logo'
import { Button } from '@/components/ui/button'

interface ConnectionErrorScreenProps {
  onRetry: () => void | Promise<void>
  onLogout: () => void
}

/**
 * Pantalla que se muestra cuando el fetch del club falla tras varios reintentos
 * (red caída, Supabase no responde). NO se debe mostrar cuando el usuario realmente
 * no tiene club asignado — para ese caso existe NoClubScreen / "Sin Club Asignado".
 */
export function ConnectionErrorScreen({ onRetry, onLogout }: ConnectionErrorScreenProps) {
  const [retrying, setRetrying] = useState(false)

  async function handleRetry() {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-background safe-area-top safe-area-bottom">
      <header className="flex items-center justify-between px-5 py-4">
        <PifaLogo size="sm" showText={false} />
        <Button variant="ghost" size="sm" onClick={onLogout} className="text-muted-foreground">
          <LogOut className="w-5 h-5" />
        </Button>
      </header>
      <div className="flex-1 flex flex-col items-center justify-center px-8 animate-fade-in-up">
        <div className="w-20 h-20 rounded-2xl bg-card border border-border flex items-center justify-center mb-6">
          <WifiOff className="w-10 h-10 text-amber-400" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2 text-center">
          Conexión lenta o sin internet
        </h1>
        <p className="text-sm text-muted-foreground text-center max-w-xs mb-6">
          No pudimos sincronizar tu club. Revisa tu conexión e inténtalo de nuevo.
        </p>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="h-11 px-6 bg-[#00FF85] hover:bg-[#00E575] disabled:opacity-60 text-black rounded-xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center gap-2"
        >
          {retrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Reintentar
        </button>
      </div>
    </div>
  )
}
