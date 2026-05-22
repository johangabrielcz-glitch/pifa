'use client'

import { PifaLogo } from './logo'

/**
 * Skeleton del dashboard del DT que se muestra mientras se hace el fetch
 * inicial del club. Imita la estructura real (header + próximo partido +
 * stats + competencias) con shimmer, para que la entrada se sienta
 * instantánea aun con red lenta.
 */
export function DashboardSkeleton() {
  return (
    <div className="min-h-dvh flex flex-col bg-background safe-area-top safe-area-bottom animate-fade-in">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <PifaLogo size="sm" showText={false} />
          <div className="flex flex-col gap-1.5">
            <div className="h-3 w-24 rounded bg-white/[0.06] animate-pulse" />
            <div className="h-2 w-16 rounded bg-white/[0.04] animate-pulse" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] animate-pulse" />
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] animate-pulse" />
        </div>
      </header>

      {/* Club identity card */}
      <div className="px-5 pt-5">
        <div className="rounded-3xl bg-[#141414] border border-white/[0.04] p-5 flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-white/[0.06] animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 rounded bg-white/[0.08] animate-pulse" />
            <div className="h-3 w-20 rounded bg-white/[0.05] animate-pulse" />
            <div className="h-3 w-28 rounded bg-white/[0.04] animate-pulse" />
          </div>
        </div>
      </div>

      {/* Next match card */}
      <div className="px-5 pt-4">
        <div className="rounded-3xl bg-[#141414] border border-white/[0.04] p-5 space-y-4">
          <div className="h-3 w-20 rounded bg-white/[0.05] animate-pulse" />
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col items-center gap-2 flex-1">
              <div className="w-14 h-14 rounded-xl bg-white/[0.06] animate-pulse" />
              <div className="h-2.5 w-16 rounded bg-white/[0.05] animate-pulse" />
            </div>
            <div className="h-6 w-10 rounded bg-white/[0.05] animate-pulse" />
            <div className="flex flex-col items-center gap-2 flex-1">
              <div className="w-14 h-14 rounded-xl bg-white/[0.06] animate-pulse" />
              <div className="h-2.5 w-16 rounded bg-white/[0.05] animate-pulse" />
            </div>
          </div>
          <div className="h-10 rounded-xl bg-white/[0.04] animate-pulse" />
        </div>
      </div>

      {/* Stats grid */}
      <div className="px-5 pt-4 grid grid-cols-3 gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="rounded-2xl bg-[#141414] border border-white/[0.04] p-3 space-y-2">
            <div className="h-2 w-12 rounded bg-white/[0.05] animate-pulse" />
            <div className="h-5 w-10 rounded bg-white/[0.08] animate-pulse" />
          </div>
        ))}
      </div>

      {/* Competitions list */}
      <div className="px-5 pt-4 pb-24 space-y-2">
        <div className="h-3 w-28 rounded bg-white/[0.05] animate-pulse mb-3" />
        {[0, 1, 2].map(i => (
          <div key={i} className="rounded-2xl bg-[#141414] border border-white/[0.04] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 rounded bg-white/[0.06] animate-pulse" />
              <div className="h-2 w-20 rounded bg-white/[0.04] animate-pulse" />
            </div>
            <div className="h-8 w-8 rounded-lg bg-white/[0.05] animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
