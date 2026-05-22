'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Gavel, Loader2, Check, X, ChevronDown, ChevronRight, Shield, Clock, AlertCircle, Star, Goal, HandHelping,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type {
  MatchAppeal, AppealAnnotationPayload, GoalEntry, AssistEntry, Player,
} from '@/lib/types'

interface AppealRow extends MatchAppeal {
  match?: any
  club?: any
}

export default function AdminAppealsPage() {
  const [pending, setPending] = useState<AppealRow[]>([])
  const [history, setHistory] = useState<AppealRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')

  async function loadAll() {
    setIsLoading(true)
    try {
      const [pendingRes, accRes, rejRes] = await Promise.all([
        fetch('/api/appeals?status=pending&limit=100').then(r => r.json()),
        fetch('/api/appeals?status=accepted&limit=50').then(r => r.json()),
        fetch('/api/appeals?status=rejected&limit=50').then(r => r.json()),
      ])
      const pendingList = ((pendingRes?.appeals || []) as AppealRow[])
        .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
      const accepted = (accRes?.appeals || []) as AppealRow[]
      const rejected = (rejRes?.appeals || []) as AppealRow[]
      const merged = [...accepted, ...rejected].sort((a, b) => {
        const at = a.resolved_at ? +new Date(a.resolved_at) : 0
        const bt = b.resolved_at ? +new Date(b.resolved_at) : 0
        return bt - at
      })
      setPending(pendingList)
      setHistory(merged)
    } catch (e) {
      console.error(e)
      toast.error('Error al cargar apelaciones')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    const channel = supabase
      .channel('match_appeals_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_appeals' }, () => loadAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function handleAccept(appeal: AppealRow) {
    if (resolvingId) return
    if (!confirm('Aceptar esta apelación aplicará el cambio al partido. ¿Continuar?')) return
    setResolvingId(appeal.id)
    try {
      const res = await fetch(`/api/appeals/${appeal.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Error al aceptar')
        return
      }
      toast.success(`Apelación aceptada: ${data.oldResult} → ${data.newResult}`)
      loadAll()
    } catch (e) {
      toast.error('Error de red')
    } finally {
      setResolvingId(null)
    }
  }

  async function confirmReject(appeal: AppealRow) {
    setResolvingId(appeal.id)
    try {
      const res = await fetch(`/api/appeals/${appeal.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNotes: rejectNotes.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Error al rechazar')
        return
      }
      toast.success('Apelación rechazada')
      setRejectingId(null)
      setRejectNotes('')
      loadAll()
    } catch (e) {
      toast.error('Error de red')
    } finally {
      setResolvingId(null)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto pb-32">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-[#FF3131]/10 flex items-center justify-center border border-[#FF3131]/20">
          <Gavel className="w-6 h-6 text-[#FF3131]" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">Apelaciones</h1>
          <p className="text-sm text-[#6A6C6E]">Revisa las solicitudes de modificación de partidos de los DTs</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#FF3131] animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending */}
          <section>
            <h2 className="text-xs font-black text-white uppercase tracking-widest mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              Pendientes
              <span className="text-[10px] font-black text-[#6A6C6E] bg-white/5 px-2 py-0.5 rounded">
                {pending.length}
              </span>
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-[#6A6C6E] py-12 text-center bg-[#141414] border border-[#202020] rounded-2xl">
                No hay apelaciones pendientes.
              </p>
            ) : (
              <div className="space-y-4">
                {pending.map(appeal => (
                  <PendingAppealCard
                    key={appeal.id}
                    appeal={appeal}
                    isResolving={resolvingId === appeal.id}
                    isRejecting={rejectingId === appeal.id}
                    rejectNotes={rejectNotes}
                    setRejectNotes={setRejectNotes}
                    onAccept={() => handleAccept(appeal)}
                    onRejectStart={() => { setRejectingId(appeal.id); setRejectNotes('') }}
                    onRejectCancel={() => { setRejectingId(null); setRejectNotes('') }}
                    onRejectConfirm={() => confirmReject(appeal)}
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
                <span className="text-[10px] font-black text-[#6A6C6E] bg-white/5 px-2 py-0.5 rounded">
                  {history.length}
                </span>
              </h2>
              {historyOpen ? <ChevronDown className="w-4 h-4 text-[#6A6C6E]" /> : <ChevronRight className="w-4 h-4 text-[#6A6C6E]" />}
            </button>
            {historyOpen && (
              <div className="space-y-2 mt-3">
                {history.length === 0 ? (
                  <p className="text-sm text-[#6A6C6E] py-8 text-center">Aún no hay apelaciones resueltas.</p>
                ) : (
                  history.map(appeal => <HistoryRow key={appeal.id} appeal={appeal} />)
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

// =============================================
// PENDING APPEAL CARD
// =============================================

function PendingAppealCard({
  appeal, isResolving, isRejecting, rejectNotes, setRejectNotes,
  onAccept, onRejectStart, onRejectCancel, onRejectConfirm,
}: {
  appeal: AppealRow
  isResolving: boolean
  isRejecting: boolean
  rejectNotes: string
  setRejectNotes: (v: string) => void
  onAccept: () => void
  onRejectStart: () => void
  onRejectCancel: () => void
  onRejectConfirm: () => void
}) {
  const m = appeal.match
  const appellant = appeal.club
  const isHomeAppellant = m && appellant && appellant.id === m.home_club?.id

  return (
    <div className="bg-[#141414] border border-amber-400/20 rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <ClubBadge club={m?.home_club} />
          <span className="text-[10px] font-black text-white uppercase truncate">{m?.home_club?.name || '—'}</span>
          <span className="text-[10px] font-black text-[#6A6C6E] px-2">
            {(appeal.original_home_score ?? 0)}—{(appeal.original_away_score ?? 0)}
          </span>
          <span className="text-[10px] font-black text-white uppercase truncate">{m?.away_club?.name || '—'}</span>
          <ClubBadge club={m?.away_club} />
        </div>
        <div className="flex items-center gap-1.5">
          {m?.competition?.name && (
            <span className="text-[8px] font-black text-[#6A6C6E] bg-white/5 px-2 py-0.5 rounded uppercase">
              {m.competition.name}
            </span>
          )}
          {m?.matchday && (
            <span className="text-[8px] font-black text-[#6A6C6E] bg-white/5 px-2 py-0.5 rounded uppercase">
              J{m.matchday}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2.5 py-1 rounded-full uppercase tracking-widest">
          Apela: {appellant?.name || '—'}
        </span>
        <span className="text-[9px] text-[#6A6C6E] font-bold">
          {new Date(appeal.created_at).toLocaleString()}
        </span>
      </div>

      {/* Diff */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <DiffColumn
          title="Actual"
          score={`${appeal.original_home_score}—${appeal.original_away_score}`}
          home={appeal.original_home_annotation}
          away={appeal.original_away_annotation}
          accent="text-[#6A6C6E]"
        />
        <DiffColumn
          title="Propuesto"
          score={`${appeal.proposed_home_score}—${appeal.proposed_away_score}`}
          home={appeal.proposed_home_annotation}
          away={appeal.proposed_away_annotation}
          accent="text-amber-400"
          compareHome={appeal.original_home_annotation}
          compareAway={appeal.original_away_annotation}
          compareScore={`${appeal.original_home_score}—${appeal.original_away_score}`}
        />
      </div>

      {/* Reason */}
      <div className="bg-[#0A0A0A] border border-white/[0.05] rounded-xl p-3">
        <p className="text-[9px] font-black text-[#6A6C6E] uppercase tracking-widest mb-1">Razón del DT</p>
        <p className="text-sm text-white whitespace-pre-wrap">{appeal.reason}</p>
      </div>

      {/* Reject form or actions */}
      {isRejecting ? (
        <div className="space-y-2 bg-[#0A0A0A] border border-red-500/20 rounded-xl p-3">
          <p className="text-[9px] font-black text-red-400 uppercase tracking-widest">Notas para el DT (opcional)</p>
          <textarea
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            rows={3}
            placeholder="Explica al DT por qué se rechaza..."
            className="w-full bg-[#141414] border border-white/[0.06] focus:border-red-500/40 outline-none text-white text-[12px] rounded-xl px-3 py-2 placeholder:text-[#3a3a3a] resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={onRejectCancel}
              disabled={isResolving}
              className="flex-1 h-10 border border-[#202020] text-[#6A6C6E] hover:text-white rounded-xl font-black uppercase text-[9px] tracking-widest transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={onRejectConfirm}
              disabled={isResolving}
              className="flex-1 h-10 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl font-black uppercase text-[9px] tracking-widest transition-all flex items-center justify-center gap-2"
            >
              {isResolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              Confirmar Rechazo
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onRejectStart}
            disabled={isResolving}
            className="flex-1 h-11 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all flex items-center justify-center gap-2"
          >
            <X className="w-3.5 h-3.5" />
            Rechazar
          </button>
          <button
            onClick={onAccept}
            disabled={isResolving}
            className="flex-1 h-11 bg-[#00FF85] hover:bg-[#00E575] disabled:opacity-50 text-black rounded-xl font-black uppercase text-[9px] tracking-widest transition-all flex items-center justify-center gap-2"
          >
            {isResolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Aceptar
          </button>
        </div>
      )}
    </div>
  )
}

// =============================================
// HISTORY ROW
// =============================================

function HistoryRow({ appeal }: { appeal: AppealRow }) {
  const [open, setOpen] = useState(false)
  const m = appeal.match
  const accepted = appeal.status === 'accepted'
  return (
    <div className="bg-[#141414] border border-white/[0.05] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.02] transition-all text-left"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border ${
            accepted
              ? 'text-[#00FF85] bg-[#00FF85]/10 border-[#00FF85]/30'
              : 'text-red-400 bg-red-500/10 border-red-500/30'
          }`}>
            {accepted ? 'Aceptada' : 'Rechazada'}
          </span>
          <span className="text-[10px] font-black text-white uppercase truncate">
            {m?.home_club?.name || '—'} vs {m?.away_club?.name || '—'}
          </span>
          <span className="text-[9px] text-[#6A6C6E] font-bold">
            {appeal.club?.name ? `· ${appeal.club.name}` : ''}
          </span>
        </div>
        <span className="text-[9px] text-[#6A6C6E] font-bold shrink-0">
          {appeal.resolved_at ? new Date(appeal.resolved_at).toLocaleDateString() : ''}
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-[#6A6C6E]" /> : <ChevronRight className="w-3.5 h-3.5 text-[#6A6C6E]" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/[0.05]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <DiffColumn
              title="Actual"
              score={`${appeal.original_home_score}—${appeal.original_away_score}`}
              home={appeal.original_home_annotation}
              away={appeal.original_away_annotation}
              accent="text-[#6A6C6E]"
            />
            <DiffColumn
              title="Propuesto"
              score={`${appeal.proposed_home_score}—${appeal.proposed_away_score}`}
              home={appeal.proposed_home_annotation}
              away={appeal.proposed_away_annotation}
              accent={accepted ? 'text-[#00FF85]' : 'text-red-400'}
            />
          </div>
          <div className="bg-[#0A0A0A] border border-white/[0.05] rounded-xl p-3">
            <p className="text-[9px] font-black text-[#6A6C6E] uppercase tracking-widest mb-1">Razón del DT</p>
            <p className="text-sm text-white whitespace-pre-wrap">{appeal.reason}</p>
          </div>
          {appeal.admin_notes && (
            <div className="bg-[#0A0A0A] border border-red-500/20 rounded-xl p-3">
              <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-1">Notas del admin</p>
              <p className="text-sm text-white whitespace-pre-wrap">{appeal.admin_notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================
// DIFF COLUMN
// =============================================

function DiffColumn({
  title, score, home, away, accent, compareHome, compareAway, compareScore,
}: {
  title: string
  score: string
  home: AppealAnnotationPayload | null | undefined
  away: AppealAnnotationPayload | null | undefined
  accent: string
  compareHome?: AppealAnnotationPayload | null
  compareAway?: AppealAnnotationPayload | null
  compareScore?: string
}) {
  const scoreChanged = compareScore !== undefined && compareScore !== score
  return (
    <div className="bg-[#0A0A0A] border border-white/[0.05] rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className={`text-[9px] font-black uppercase tracking-widest ${accent}`}>{title}</p>
        <p className={`text-base font-black tabular-nums ${scoreChanged ? 'text-amber-400' : 'text-white'}`}>
          {score}
        </p>
      </div>

      <AnnotationLines label="Goles" icon="goal" home={home?.goals} away={away?.goals}
        compareHome={compareHome?.goals} compareAway={compareAway?.goals}
      />
      <AnnotationLines label="Asistencias" icon="assist" home={home?.assists} away={away?.assists}
        compareHome={compareHome?.assists} compareAway={compareAway?.assists}
      />
      <MvpLine home={home?.mvp_player_id} away={away?.mvp_player_id}
        compareHome={compareHome?.mvp_player_id} compareAway={compareAway?.mvp_player_id} />
    </div>
  )
}

function entriesEqual(a: (GoalEntry | AssistEntry)[] | undefined, b: (GoalEntry | AssistEntry)[] | undefined) {
  const norm = (x?: any[]) => (x || [])
    .map(e => `${e.player_id}:${e.count}`)
    .sort()
    .join(',')
  return norm(a) === norm(b)
}

function AnnotationLines({
  label, icon, home, away, compareHome, compareAway,
}: {
  label: string
  icon: 'goal' | 'assist'
  home?: (GoalEntry | AssistEntry)[]
  away?: (GoalEntry | AssistEntry)[]
  compareHome?: (GoalEntry | AssistEntry)[]
  compareAway?: (GoalEntry | AssistEntry)[]
}) {
  const homeChanged = compareHome !== undefined && !entriesEqual(home, compareHome)
  const awayChanged = compareAway !== undefined && !entriesEqual(away, compareAway)
  const Icon = icon === 'goal' ? Goal : HandHelping
  return (
    <div className="space-y-1">
      <p className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest flex items-center gap-1">
        <Icon className="w-2.5 h-2.5" />
        {label}
      </p>
      <PlayerList items={home || []} changed={homeChanged} />
      <PlayerList items={away || []} changed={awayChanged} />
    </div>
  )
}

function PlayerList({ items, changed }: { items: (GoalEntry | AssistEntry)[]; changed: boolean }) {
  if (items.length === 0) {
    return <p className={`text-[10px] font-bold ${changed ? 'text-amber-400' : 'text-[#3a3a3a]'}`}>—</p>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it, i) => (
        <PlayerChip key={`${it.player_id}-${i}`} playerId={it.player_id} count={it.count} changed={changed} />
      ))}
    </div>
  )
}

const playerNameCache = new Map<string, string>()

function PlayerChip({ playerId, count, changed }: { playerId: string; count: number; changed: boolean }) {
  const [name, setName] = useState<string>(playerNameCache.get(playerId) || playerId.slice(0, 6))
  useEffect(() => {
    if (playerNameCache.has(playerId)) return
    let active = true
    supabase.from('players').select('name').eq('id', playerId).single().then(({ data }) => {
      const n = (data as any)?.name as string | undefined
      if (n) {
        playerNameCache.set(playerId, n)
        if (active) setName(n)
      }
    })
    return () => { active = false }
  }, [playerId])
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
      changed ? 'bg-amber-400/15 text-amber-300 border border-amber-400/30' : 'bg-white/5 text-white/80'
    }`}>
      {name} ×{count}
    </span>
  )
}

function MvpLine({
  home, away, compareHome, compareAway,
}: {
  home?: string | null
  away?: string | null
  compareHome?: string | null
  compareAway?: string | null
}) {
  const changed = (compareHome !== undefined && compareHome !== home) ||
    (compareAway !== undefined && compareAway !== away)
  const mvpId = home || away
  return (
    <div className="space-y-1">
      <p className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest flex items-center gap-1">
        <Star className="w-2.5 h-2.5" />
        MVP
      </p>
      {mvpId ? (
        <PlayerChip playerId={mvpId} count={1} changed={changed} />
      ) : (
        <p className={`text-[10px] font-bold ${changed ? 'text-amber-400' : 'text-[#3a3a3a]'}`}>—</p>
      )}
    </div>
  )
}

function ClubBadge({ club }: { club: any }) {
  return (
    <div className="w-7 h-7 rounded-md bg-black border border-white/10 flex items-center justify-center p-1 shrink-0">
      {club?.shield_url ? (
        <img src={club.shield_url} alt="" className="w-full h-full object-contain" />
      ) : (
        <Shield className="w-3.5 h-3.5 text-[#2D2D2D]" />
      )}
    </div>
  )
}
