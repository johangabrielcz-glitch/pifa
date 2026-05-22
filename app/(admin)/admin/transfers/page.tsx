'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeftRight, ChevronLeft, Loader2, Search, Shield, User, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type Tab = 'active' | 'free_agent'

interface PlayerRow {
  id: string
  name: string
  position: string
  number: number | null
  photo_url: string | null
  club_id: string
  contract_status: 'active' | 'free_agent' | 'renewal_pending' | null
}

interface ClubRow {
  id: string
  name: string
  shield_url: string | null
}

export default function AdminTransfersPage() {
  const router = useRouter()
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [clubs, setClubs] = useState<ClubRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('active')
  const [search, setSearch] = useState('')
  const [filterClub, setFilterClub] = useState<string>('all')

  const [selected, setSelected] = useState<PlayerRow | null>(null)
  const [targetClub, setTargetClub] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    Promise.all([
      supabase.from('clubs').select('id, name, shield_url').order('name'),
      supabase
        .from('players')
        .select('id, name, position, number, club_id, contract_status, photo_url')
        .order('name'),
    ]).then(([clubsRes, playersRes]) => {
      if (cancelled) return
      if (clubsRes.data) setClubs(clubsRes.data as ClubRow[])
      if (playersRes.data) setPlayers(playersRes.data as PlayerRow[])
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const clubById = useMemo(() => {
    const m = new Map<string, ClubRow>()
    clubs.forEach(c => m.set(c.id, c))
    return m
  }, [clubs])

  const visiblePlayers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return players
      .filter(p => (tab === 'free_agent' ? p.contract_status === 'free_agent' : p.contract_status !== 'free_agent'))
      .filter(p => (tab === 'active' && filterClub !== 'all' ? p.club_id === filterClub : true))
      .filter(p => (q ? p.name.toLowerCase().includes(q) : true))
  }, [players, tab, filterClub, search])

  const openDialog = (p: PlayerRow) => {
    setSelected(p)
    setTargetClub('')
  }

  const closeDialog = () => {
    if (isSubmitting) return
    setSelected(null)
    setTargetClub('')
  }

  const submit = async () => {
    if (!selected || !targetClub) {
      toast.error('Seleccioná un club destino')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/admin/transfer-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: selected.id, toClubId: targetClub }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error en la transferencia')

      setPlayers(prev =>
        prev.map(p =>
          p.id === selected.id
            ? { ...p, club_id: targetClub, contract_status: 'active' as const }
            : p
        )
      )

      const sameClub = targetClub === selected.club_id && selected.contract_status !== 'free_agent'
      toast.success(
        sameClub
          ? `${selected.name} reseteado en su club actual`
          : tab === 'free_agent'
          ? `${selected.name} asignado a ${clubById.get(targetClub)?.name || 'club'}`
          : `${selected.name} transferido a ${clubById.get(targetClub)?.name || 'club'}`
      )
      setSelected(null)
      setTargetClub('')
    } catch (err: any) {
      toast.error(err.message || 'Error al transferir')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-[#0A0A0A]/90 backdrop-blur-2xl border-b border-white/[0.04]">
        <div className="flex items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-9 h-9 rounded-xl bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white transition-all active:scale-95"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-black text-white uppercase tracking-tight">
                <span className="text-[#FF3131]">TRASPASOS</span> ADMIN
              </h1>
              <p className="text-[7px] text-[#2D2D2D] font-black uppercase tracking-[0.3em]">
                MOVER JUGADORES · ASIGNAR FREE AGENTS
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 pb-3 flex gap-2">
          <button
            onClick={() => {
              setTab('active')
              setFilterClub('all')
            }}
            className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
              tab === 'active'
                ? 'bg-[#FF3131] text-white border-[#FF3131]'
                : 'bg-[#141414] text-[#6A6C6E] border-white/[0.04] hover:border-[#2D2D2D]'
            }`}
          >
            Activos
          </button>
          <button
            onClick={() => {
              setTab('free_agent')
              setFilterClub('all')
            }}
            className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
              tab === 'free_agent'
                ? 'bg-[#FF3131] text-white border-[#FF3131]'
                : 'bg-[#141414] text-[#6A6C6E] border-white/[0.04] hover:border-[#2D2D2D]'
            }`}
          >
            Free Agents
          </button>
        </div>

        <div className="px-6 pb-3.5 space-y-3">
          <div className="relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2D2D2D] group-focus-within:text-[#FF3131] transition-colors" />
            <input
              placeholder="BUSCAR JUGADOR..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9.5 pl-10 pr-4 bg-[#141414] border border-[#202020] rounded-lg text-white placeholder:text-[#2D2D2D] text-[10px] font-black uppercase tracking-widest focus:outline-none focus:border-[#FF3131]/30 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6A6C6E] hover:text-white p-1 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {tab === 'active' && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              <button
                onClick={() => setFilterClub('all')}
                className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${
                  filterClub === 'all'
                    ? 'bg-[#FF3131] text-white border-[#FF3131] shadow-[0_0_10px_rgba(255,49,49,0.2)]'
                    : 'bg-[#141414] text-[#2D2D2D] border-white/[0.04] hover:border-[#2D2D2D] hover:text-white'
                }`}
              >
                Todos
              </button>
              {clubs.map(c => (
                <button
                  key={c.id}
                  onClick={() => setFilterClub(c.id)}
                  className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${
                    filterClub === c.id
                      ? 'bg-[#FF3131] text-white border-[#FF3131] shadow-[0_0_10px_rgba(255,49,49,0.2)]'
                      : 'bg-[#141414] text-[#2D2D2D] border-white/[0.04] hover:border-[#2D2D2D] hover:text-white'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="px-6 py-4 pb-32">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF3131]" />
          </div>
        ) : visiblePlayers.length === 0 ? (
          <div className="text-center py-20 bg-[#141414]/30 rounded-[32px] border border-dashed border-white/[0.06]">
            <div className="w-20 h-20 rounded-3xl bg-[#0A0A0A] border border-[#202020] mx-auto mb-6 flex items-center justify-center">
              <User className="w-10 h-10 text-[#2D2D2D]" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#6A6C6E]">
              {tab === 'free_agent' ? 'No hay free agents' : 'Sin resultados'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visiblePlayers.map(p => {
              const club = clubById.get(p.club_id)
              return (
                <button
                  key={p.id}
                  onClick={() => openDialog(p)}
                  className="w-full flex items-center gap-3 p-3 bg-[#141414] hover:bg-[#1A1A1A] border border-white/[0.04] hover:border-[#FF3131]/30 rounded-2xl transition-all active:scale-[0.99] text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center overflow-hidden shrink-0">
                    {p.photo_url ? (
                      <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 text-[#2D2D2D]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-black text-white uppercase tracking-wide truncate">
                      {p.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[8px] font-black uppercase tracking-widest text-[#FF3131]">
                        {p.position}
                      </span>
                      {p.number != null && (
                        <span className="text-[8px] font-black uppercase tracking-widest text-[#6A6C6E]">
                          #{p.number}
                        </span>
                      )}
                      <span className="text-[8px] font-black uppercase tracking-widest text-[#6A6C6E] truncate flex items-center gap-1">
                        {tab === 'free_agent' ? (
                          <>· FREE AGENT</>
                        ) : (
                          <>
                            <Shield className="w-2.5 h-2.5" />
                            {club?.name || '—'}
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                  <ArrowLeftRight className="w-4 h-4 text-[#6A6C6E] shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!selected} onOpenChange={open => !open && closeDialog()}>
        <AlertDialogContent className="bg-[#0A0A0A] border-[#202020]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white uppercase tracking-tight">
              {tab === 'free_agent' ? 'Asignar a un club' : 'Transferir jugador'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#6A6C6E] text-xs">
              {selected && (
                <>
                  <div className="text-white font-black text-sm mt-2">{selected.name}</div>
                  {tab === 'active' && (
                    <div className="mt-1 text-[10px]">
                      Club actual:{' '}
                      <span className="text-white font-bold">
                        {clubById.get(selected.club_id)?.name || '—'}
                      </span>
                    </div>
                  )}
                  <div className="mt-3 text-[10px] leading-relaxed">
                    Resetea morale/stamina al 100, limpia lesiones, rojas, ofertas pendientes,
                    cláusulas en negociación y emails. Operación gratuita y silenciosa.
                  </div>
                  {tab === 'free_agent' && (
                    <div className="mt-2 text-[10px] text-[#FF3131]">
                      Recibe contrato fresco: 3 temporadas · $25.000 · rol rotación.
                    </div>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="mt-2">
            <label className="block text-[9px] font-black uppercase tracking-widest text-[#6A6C6E] mb-1.5">
              Club destino
            </label>
            <Select value={targetClub} onValueChange={setTargetClub}>
              <SelectTrigger className="bg-[#141414] border-[#202020] text-white">
                <SelectValue placeholder="Seleccionar club..." />
              </SelectTrigger>
              <SelectContent>
                {clubs.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {selected && c.id === selected.club_id && tab === 'active' && ' (actual · reset)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && tab === 'active' && targetClub === selected.club_id && (
              <p className="mt-2 text-[9px] text-[#FF3131] uppercase tracking-widest font-black">
                Mismo club: sólo se resetea el estado del jugador.
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting} className="bg-[#141414] border-[#202020] text-white hover:bg-[#1A1A1A]">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isSubmitting || !targetClub}
              onClick={e => {
                e.preventDefault()
                submit()
              }}
              className="bg-[#FF3131] hover:bg-[#D32F2F] text-white"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
