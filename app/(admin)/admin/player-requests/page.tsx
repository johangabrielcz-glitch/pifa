'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  UserPlus, Loader2, Check, X, ChevronDown, ChevronRight, Shield, Clock, AlertCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { approvePlayerRequest, rejectPlayerRequest, type ApprovalTerms } from '@/lib/player-request-engine'
import type { PlayerCreationRequest, SquadRole } from '@/lib/types'

type RequestRow = PlayerCreationRequest & {
  club?: { id: string; name: string; shield_url: string | null } | null
}

export default function AdminPlayerRequestsPage() {
  const router = useRouter()
  const [pending, setPending] = useState<RequestRow[]>([])
  const [history, setHistory] = useState<RequestRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [allowed, setAllowed] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  // Admin-only (moderators are also redirected by the layout guard)
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('pifa_auth_session') || '{}')
      if (s?.user?.role === 'admin') {
        setAllowed(true)
        setUserId(s.user.id || null)
      } else {
        router.replace('/admin')
      }
    } catch {
      router.replace('/admin')
    }
  }, [router])

  async function loadAll() {
    setIsLoading(true)
    try {
      const { data } = await supabase
        .from('player_creation_requests')
        .select('*, club:clubs(id, name, shield_url)')
        .order('created_at', { ascending: false })
      const rows = (data as RequestRow[]) || []
      setPending(rows.filter(r => r.status === 'pending').sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)))
      setHistory(rows.filter(r => r.status !== 'pending'))
    } catch (e) {
      console.error(e)
      toast.error('Error al cargar solicitudes')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!allowed) return
    loadAll()
    const channel = supabase
      .channel('player_creation_requests_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_creation_requests' }, () => loadAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [allowed])

  async function handleApprove(req: RequestRow, terms: ApprovalTerms) {
    if (resolvingId) return
    setResolvingId(req.id)
    try {
      const res = await approvePlayerRequest(req.id, terms, userId)
      if (!res.success) {
        toast.error(res.error || 'Error al aprobar')
        return
      }
      toast.success(`Aprobada — ${req.name} se unió a ${req.club?.name ?? 'su club'}`)
      loadAll()
    } finally {
      setResolvingId(null)
    }
  }

  async function confirmReject(req: RequestRow) {
    setResolvingId(req.id)
    try {
      const res = await rejectPlayerRequest(req.id, rejectNotes.trim() || null, userId)
      if (!res.success) {
        toast.error(res.error || 'Error al rechazar')
        return
      }
      toast.success('Solicitud rechazada')
      setRejectingId(null)
      setRejectNotes('')
      loadAll()
    } finally {
      setResolvingId(null)
    }
  }

  if (!allowed) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-[#FF3131]" /></div>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto pb-32">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-[#FF3131]/10 flex items-center justify-center border border-[#FF3131]/20">
          <UserPlus className="w-6 h-6 text-[#FF3131]" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">Solicitudes de Jugadores</h1>
          <p className="text-sm text-[#6A6C6E]">Aprueba o rechaza las pre-creaciones propuestas por los DTs.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-[#FF3131] animate-spin" /></div>
      ) : (
        <div className="space-y-8">
          {/* Pending */}
          <section>
            <h2 className="text-xs font-black text-white uppercase tracking-widest mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              Pendientes
              <span className="text-[10px] font-black text-[#6A6C6E] bg-white/5 px-2 py-0.5 rounded">{pending.length}</span>
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-[#6A6C6E] py-12 text-center bg-[#141414] border border-[#202020] rounded-2xl">No hay solicitudes pendientes.</p>
            ) : (
              <div className="space-y-4">
                {pending.map(req => (
                  <PendingCard
                    key={req.id}
                    req={req}
                    isResolving={resolvingId === req.id}
                    isRejecting={rejectingId === req.id}
                    rejectNotes={rejectNotes}
                    setRejectNotes={setRejectNotes}
                    onApprove={(terms) => handleApprove(req, terms)}
                    onRejectStart={() => { setRejectingId(req.id); setRejectNotes('') }}
                    onRejectCancel={() => { setRejectingId(null); setRejectNotes('') }}
                    onRejectConfirm={() => confirmReject(req)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* History */}
          <section>
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-[#141414] border border-[#202020] rounded-2xl hover:bg-white/[0.02] transition-all"
            >
              <h2 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#6A6C6E]" />
                Historial
                <span className="text-[10px] font-black text-[#6A6C6E] bg-white/5 px-2 py-0.5 rounded">{history.length}</span>
              </h2>
              {historyOpen ? <ChevronDown className="w-4 h-4 text-[#6A6C6E]" /> : <ChevronRight className="w-4 h-4 text-[#6A6C6E]" />}
            </button>
            {historyOpen && (
              <div className="space-y-2 mt-3">
                {history.length === 0
                  ? <p className="text-sm text-[#6A6C6E] py-8 text-center">Sin solicitudes resueltas.</p>
                  : history.map(r => <HistoryRow key={r.id} req={r} />)}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

// =============================================
// PENDING REQUEST CARD
// =============================================
function PendingCard({
  req, isResolving, isRejecting, rejectNotes, setRejectNotes,
  onApprove, onRejectStart, onRejectCancel, onRejectConfirm,
}: {
  req: RequestRow
  isResolving: boolean
  isRejecting: boolean
  rejectNotes: string
  setRejectNotes: (s: string) => void
  onApprove: (terms: ApprovalTerms) => void
  onRejectStart: () => void
  onRejectCancel: () => void
  onRejectConfirm: () => void
}) {
  const [salary, setSalary] = useState<number>(25000)
  const [seasons, setSeasons] = useState<number>(3)
  const [role, setRole] = useState<SquadRole>('rotation')
  const [clause, setClause] = useState<number>(700000)
  const [oneClub, setOneClub] = useState(false)

  return (
    <div className="bg-[#141414] border border-[#202020] rounded-2xl overflow-hidden">
      {/* Header: club + when */}
      <div className="px-5 py-3 flex items-center justify-between border-b border-white/[0.04] bg-[#0A0A0A]/40">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-black border border-[#202020] flex items-center justify-center p-1.5 shrink-0">
            {req.club?.shield_url
              ? <img src={req.club.shield_url} className="w-full h-full object-contain" />
              : <Shield className="w-4 h-4 text-[#2D2D2D]" />}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black text-white uppercase tracking-tight truncate">{req.club?.name ?? '—'}</p>
            <p className="text-[8px] text-[#6A6C6E] font-bold uppercase tracking-widest">{new Date(req.created_at).toLocaleString('es')}</p>
          </div>
        </div>
      </div>

      {/* Identity proposed */}
      <div className="px-5 py-4 flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-black border border-[#202020] overflow-hidden flex items-center justify-center shrink-0">
          {req.photo_url
            ? <img src={req.photo_url} className="w-full h-full object-cover" />
            : <UserPlus className="w-6 h-6 text-[#2D2D2D]" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-black text-white uppercase tracking-tight truncate">{req.name}</p>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span className="text-[9px] font-black text-[#FF3131] bg-[#FF3131]/10 px-2 py-0.5 rounded uppercase tracking-widest">{req.position}</span>
            {req.number != null && <span className="text-[9px] font-bold text-white/60 uppercase tracking-widest">#{req.number}</span>}
            {req.age != null && <span className="text-[9px] font-bold text-white/60 uppercase tracking-widest">{req.age} años</span>}
            {req.nationality && <span className="text-[9px] font-bold text-white/60 uppercase tracking-widest">{req.nationality}</span>}
          </div>
        </div>
      </div>

      {/* Approval terms (admin sets) */}
      <div className="px-5 pb-4 grid grid-cols-2 gap-3 border-t border-white/[0.04] pt-4">
        <div>
          <label className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest">Salario</label>
          <input type="number" inputMode="numeric" value={salary} onChange={(e) => setSalary(Math.max(0, parseInt(e.target.value) || 0))}
            className="mt-1 w-full h-10 bg-black border border-[#202020] rounded-xl px-3 text-[12px] font-black text-white focus:border-[#FF3131]/40 outline-none" />
        </div>
        <div>
          <label className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest">Temporadas</label>
          <input type="number" inputMode="numeric" value={seasons} onChange={(e) => setSeasons(Math.max(1, parseInt(e.target.value) || 1))}
            className="mt-1 w-full h-10 bg-black border border-[#202020] rounded-xl px-3 text-[12px] font-black text-white focus:border-[#FF3131]/40 outline-none" />
        </div>
        <div>
          <label className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest">Rol</label>
          <select value={role} onChange={(e) => setRole(e.target.value as SquadRole)}
            className="mt-1 w-full h-10 bg-black border border-[#202020] rounded-xl px-3 text-[12px] font-black text-white focus:border-[#FF3131]/40 outline-none">
            <option value="essential">Essential</option>
            <option value="important">Important</option>
            <option value="rotation">Rotation</option>
          </select>
        </div>
        <div>
          <label className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest">Cláusula</label>
          <input type="number" inputMode="numeric" value={clause} onChange={(e) => setClause(Math.max(0, parseInt(e.target.value) || 0))}
            className="mt-1 w-full h-10 bg-black border border-[#202020] rounded-xl px-3 text-[12px] font-black text-white focus:border-[#FF3131]/40 outline-none" />
        </div>
        <label className="col-span-2 flex items-center gap-2 text-[10px] font-bold text-white/70 uppercase tracking-widest cursor-pointer">
          <input type="checkbox" checked={oneClub} onChange={(e) => setOneClub(e.target.checked)} className="accent-[#FF3131]" />
          One-club man
        </label>
      </div>

      {/* Actions */}
      <div className="px-5 pb-5">
        {isRejecting ? (
          <div className="space-y-2">
            <input type="text" value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Motivo (opcional, se mostrará al DT)"
              maxLength={200}
              className="w-full h-10 bg-black border border-[#202020] rounded-xl px-3 text-[11px] font-bold text-white placeholder:text-[#2D2D2D] focus:border-red-500/50 outline-none" />
            <div className="flex gap-2">
              <button onClick={onRejectCancel} disabled={isResolving}
                className="flex-1 h-11 border border-[#202020] text-[#6A6C6E] hover:text-white rounded-xl font-black uppercase tracking-widest text-[9px] transition-all disabled:opacity-50">Cancelar</button>
              <button onClick={onRejectConfirm} disabled={isResolving}
                className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black uppercase tracking-widest text-[9px] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Rechazar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={onRejectStart} disabled={isResolving}
              className="flex-1 h-11 bg-red-500/10 hover:bg-red-500 hover:text-white text-red-400 border border-red-500/20 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              <X className="w-4 h-4" /> Rechazar
            </button>
            <button onClick={() => onApprove({ salary, contract_seasons_left: seasons, squad_role: role, release_clause: clause, is_one_club_man: oneClub })}
              disabled={isResolving}
              className="flex-1 h-11 bg-emerald-500/10 hover:bg-emerald-500 hover:text-[#0A0A0A] text-emerald-400 border border-emerald-500/20 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
              {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Aprobar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function HistoryRow({ req }: { req: RequestRow }) {
  const ok = req.status === 'approved'
  return (
    <div className="px-4 py-3 bg-[#0A0A0A]/40 border border-white/[0.04] rounded-2xl flex items-center gap-3">
      <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black text-white uppercase tracking-tight truncate">
          {req.name} <span className="text-white/40">·</span> {req.club?.name ?? '—'}
        </p>
        <p className="text-[8px] text-[#6A6C6E] font-bold uppercase tracking-widest">
          {req.position}{req.number != null ? ` · #${req.number}` : ''}{req.admin_notes ? ` · ${req.admin_notes}` : ''}
        </p>
      </div>
      <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
        {ok ? 'Aprobada' : 'Rechazada'}
      </span>
    </div>
  )
}
