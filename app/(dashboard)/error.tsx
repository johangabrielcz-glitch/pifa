'use client'

import { useEffect } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { looksLikeChunkError, reloadForChunkError } from '@/components/pifa/chunk-reload-handler'

/**
 * Route error boundary for the DT dashboard. When the error is a stale-chunk
 * failure (after a new deployment) it auto-reloads once; otherwise it shows a
 * friendly recovery screen instead of the raw global-error page.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const isChunk = looksLikeChunkError(error)

  useEffect(() => {
    console.error(error)
    if (isChunk) reloadForChunkError()
  }, [error, isChunk])

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#0A0A0A] px-6">
      <div className="w-full max-w-sm text-center">
        {isChunk ? (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-[#00FF85] mx-auto mb-5" />
            <p className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Actualizando aplicación…</p>
            <p className="text-[9px] text-[#6A6C6E] font-bold uppercase tracking-widest mt-2">Hay una nueva versión. Recargando.</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-[#FF3131]/10 border border-[#FF3131]/20 flex items-center justify-center mx-auto mb-5 text-[#FF3131]">
              <RefreshCw className="w-6 h-6" />
            </div>
            <p className="text-[12px] font-black text-white uppercase tracking-[0.15em]">Algo salió mal</p>
            <p className="text-[9px] text-[#6A6C6E] font-bold uppercase tracking-widest mt-2 mb-6">No pudimos cargar esta sección.</p>
            <div className="flex gap-3">
              <button
                onClick={() => reset()}
                className="flex-1 h-11 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-xl font-black uppercase tracking-widest text-[9px] transition-all active:scale-95"
              >
                Reintentar
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 h-11 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all active:scale-95"
              >
                Recargar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
