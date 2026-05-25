'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Vote, Lock, Unlock, RefreshCw, Crown, Trophy, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  buildGalaPayload, defaultWeight, VOTE_POINTS,
  type AwardCompBlock, type AwardStatRow, type GalaPayload, type Nominee,
} from '@/lib/award-engine'
import type { Season, Club, User, AwardKey, AwardVote } from '@/lib/types'

type Block = AwardCompBlock & { championRoster: AwardStatRow[] }

const AWARDS: { key: AwardKey; label: string }[] = [
  { key: 'ballon_dor', label: 'Balón de Oro' },
  { key: 'the_best', label: 'The Best' },
  { key: 'best_playmaker', label: 'The Best Playmaker' },
  { key: 'golden_boot', label: 'Bota de Oro' },
  { key: 'oliver_kahn', label: 'Premio Oliver Kahn' },
  { key: 'club_year', label: 'Club del Año' },
  { key: 'dt_year', label: 'DT del Año' },
]

export default function GalaVotingAdmin({ season, blocks, clubMatchCounts }: {
  season: Season
  blocks: Block[]
  clubMatchCounts: Record<string, number>
}) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [clubsById, setClubsById] = useState<Record<string, Club>>({})
  const [dtByClub, setDtByClub] = useState<Record<string, User>>({})
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [savedNominees, setSavedNominees] = useState<Record<string, { type: string; id: string }[]>>({})
  const [winnersById, setWinnersById] = useState<Record<string, string | null>>({})
  const [publish, setPublish] = useState<{ is_open: boolean; payload: GalaPayload; opened_at: string | null } | null>(null)
  const [resultsVisible, setResultsVisible] = useState(false)
  const [votes, setVotes] = useState<AwardVote[]>([])

  const loadAll = async () => {
    setLoading(true)
    const [clubsRes, usersRes, awardsRes, weightsRes, pubRes, votesRes] = await Promise.all([
      supabase.from('clubs').select('id, name, shield_url, budget'),
      supabase.from('users').select('id, full_name, club_id, role'),
      supabase.from('season_awards').select('award_key, nominees, winner_id').eq('season_id', season.id),
      supabase.from('season_award_weights').select('competition_id, weight').eq('season_id', season.id),
      supabase.from('season_gala_publish').select('is_open, payload, opened_at, results_visible').eq('season_id', season.id).maybeSingle(),
      supabase.from('award_votes').select('*').eq('season_id', season.id),
    ])

    if (pubRes.error || votesRes.error) setNeedsMigration(true)

    const cById: Record<string, Club> = {}
    for (const c of (clubsRes.data ?? []) as Club[]) cById[c.id] = c
    setClubsById(cById)

    const dt: Record<string, User> = {}
    for (const u of (usersRes.data ?? []) as User[]) if (u.club_id && u.role === 'user' && !dt[u.club_id]) dt[u.club_id] = u
    setDtByClub(dt)

    const w: Record<string, number> = {}
    for (const b of blocks) w[b.competition.id] = defaultWeight(b.competition)
    for (const row of (weightsRes.data ?? []) as any[]) w[row.competition_id] = Number(row.weight)
    setWeights(w)

    const sn: Record<string, { type: string; id: string }[]> = {}
    const wn: Record<string, string | null> = {}
    for (const a of (awardsRes.data ?? []) as any[]) {
      if (Array.isArray(a.nominees)) sn[a.award_key] = a.nominees
      wn[a.award_key] = a.winner_id ?? null
    }
    setSavedNominees(sn)
    setWinnersById(wn)

    if (pubRes.data) setPublish({ is_open: (pubRes.data as any).is_open, payload: (pubRes.data as any).payload, opened_at: (pubRes.data as any).opened_at })
    else setPublish(null)
    setResultsVisible(!!(pubRes.data as any)?.results_visible)

    setVotes((votesRes.data ?? []) as AwardVote[])
    setLoading(false)
  }

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [season.id])

  const buildPayload = (): GalaPayload =>
    buildGalaPayload({ blocks, championBlocks: blocks, weights, clubMatchCounts, clubsById, dtByClub, savedNominees, winners: winnersById as any })

  const showResults = async () => {
    setBusy(true)
    const payload = buildPayload()
    const { error } = await supabase.from('season_gala_publish').upsert({
      season_id: season.id, is_open: publish?.is_open ?? false, payload, results_visible: true, updated_at: new Date().toISOString(),
    } as any, { onConflict: 'season_id' })
    setBusy(false)
    if (error) { setNeedsMigration(true); toast.error('No se pudo mostrar resultados. ¿Ejecutaste las migraciones 18 y 19?') }
    else { toast.success('Podio oficial visible para los DTs'); loadAll() }
  }

  const hideResults = async () => {
    setBusy(true)
    const { error } = await (supabase.from('season_gala_publish') as any)
      .update({ results_visible: false, updated_at: new Date().toISOString() })
      .eq('season_id', season.id)
    setBusy(false)
    if (error) toast.error('No se pudo ocultar')
    else { toast.success('Resultados ocultados'); loadAll() }
  }

  const publishAndOpen = async () => {
    setBusy(true)
    const payload = buildPayload()
    const { error } = await supabase.from('season_gala_publish').upsert({
      season_id: season.id, is_open: true, payload, opened_at: new Date().toISOString(), closed_at: null, updated_at: new Date().toISOString(),
    } as any, { onConflict: 'season_id' })
    setBusy(false)
    if (error) { setNeedsMigration(true); toast.error('No se pudo publicar. ¿Ejecutaste la migración 18?') }
    else { toast.success('Papeleta publicada y votación abierta'); loadAll() }
  }

  const closeVoting = async () => {
    setBusy(true)
    const { error } = await (supabase.from('season_gala_publish') as any)
      .update({ is_open: false, closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('season_id', season.id)
    setBusy(false)
    if (error) toast.error('No se pudo cerrar')
    else { toast.success('Votación cerrada'); loadAll() }
  }

  const republish = async () => {
    setBusy(true)
    const payload = buildPayload()
    const { error } = await (supabase.from('season_gala_publish') as any)
      .update({ payload, updated_at: new Date().toISOString() })
      .eq('season_id', season.id)
    setBusy(false)
    if (error) toast.error('No se pudo re-publicar')
    else { toast.success('Papeleta actualizada'); loadAll() }
  }

  // id -> nombre desde el payload publicado
  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    const aw = publish?.payload?.awards
    if (aw) {
      for (const key of Object.keys(aw)) {
        for (const n of (aw as any)[key] as Nominee[]) {
          m.set(n.id, n.type === 'player' ? (n.player?.name ?? 'Jugador') : n.type === 'club' ? (n.club?.name ?? 'Club') : (n.user?.full_name ?? 'DT'))
        }
      }
    }
    return m
  }, [publish])

  const resolveName = (id: string | null) => (id ? (nameById.get(id) ?? '—') : '—')

  // tally por premio
  const tallies = useMemo(() => {
    const result: Record<string, { id: string; points: number; votes: number }[]> = {}
    for (const a of AWARDS) {
      const acc = new Map<string, { points: number; votes: number }>()
      for (const v of votes.filter((x) => x.award_key === a.key)) {
        const picks = [v.first_id, v.second_id, v.third_id]
        picks.forEach((id, i) => {
          if (!id) return
          const cur = acc.get(id) ?? { points: 0, votes: 0 }
          cur.points += VOTE_POINTS[i]
          cur.votes += 1
          acc.set(id, cur)
        })
      }
      result[a.key] = [...acc.entries()].map(([id, v]) => ({ id, ...v })).sort((x, y) => y.points - x.points || y.votes - x.votes)
    }
    return result
  }, [votes])

  // papeletas por DT
  const ballots = useMemo(() => {
    const byVoter = new Map<string, { name: string; picks: Record<string, AwardVote> }>()
    for (const v of votes) {
      const entry = byVoter.get(v.voter_user_id) ?? { name: v.voter_name ?? 'DT', picks: {} }
      entry.picks[v.award_key] = v
      byVoter.set(v.voter_user_id, entry)
    }
    return [...byVoter.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [votes])

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-[#FF3131]" /></div>

  return (
    <div className="space-y-5">
      {needsMigration && (
        <div className="rounded-[18px] border border-amber-500/30 bg-amber-500/[0.07] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-amber-300 leading-relaxed">
            Sistema de votación no disponible. Ejecuta <span className="text-white">scripts/18-award-voting.sql</span> en Supabase.
          </p>
        </div>
      )}

      {/* Controles */}
      <div className="bg-[#141414]/50 rounded-[20px] border border-white/[0.05] p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Vote className="w-4 h-4 text-[#FF3131]" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Votación de DTs</span>
          </div>
          {publish && (
            <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${publish.is_open ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-[#6A6C6E] border-white/10'}`}>
              {publish.is_open ? 'Abierta' : 'Cerrada'}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {(!publish || !publish.is_open) && (
            <button onClick={publishAndOpen} disabled={busy} className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black uppercase tracking-widest text-[8px] disabled:opacity-50 flex items-center gap-2">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlock className="w-3 h-3" />} Publicar y abrir
            </button>
          )}
          {publish?.is_open && (
            <>
              <button onClick={closeVoting} disabled={busy} className="h-9 px-4 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-lg font-black uppercase tracking-widest text-[8px] disabled:opacity-50 flex items-center gap-2">
                <Lock className="w-3 h-3" /> Cerrar votación
              </button>
              <button onClick={republish} disabled={busy} className="h-9 px-4 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg font-black uppercase tracking-widest text-[8px] disabled:opacity-50 flex items-center gap-2">
                <RefreshCw className="w-3 h-3" /> Re-publicar papeleta
              </button>
            </>
          )}
          {resultsVisible ? (
            <button onClick={hideResults} disabled={busy} className="h-9 px-4 bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/30 rounded-lg font-black uppercase tracking-widest text-[8px] disabled:opacity-50 flex items-center gap-2">
              <EyeOff className="w-3 h-3" /> Ocultar resultados a DTs
            </button>
          ) : (
            <button onClick={showResults} disabled={busy} className="h-9 px-4 bg-amber-400 hover:bg-amber-300 text-[#0A0A0A] rounded-lg font-black uppercase tracking-widest text-[8px] disabled:opacity-50 flex items-center gap-2">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />} Mostrar resultados a DTs
            </button>
          )}
        </div>
        <p className="text-[8px] text-[#6A6C6E] font-bold tracking-wide mt-2">
          Publicar congela la papeleta (nominados + campeones) para que los DTs voten. Cerrar detiene la votación; los resultados de abajo los ves siempre.
          "Mostrar resultados a DTs" revela en la gala del DT el podio oficial (top 5 + ganador de la pestaña Premios), sin puntos ni stats. Por defecto está oculto.
        </p>
      </div>

      {/* Resultados por premio */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#6A6C6E] flex items-center gap-2"><Trophy className="w-3.5 h-3.5 text-amber-300" /> Resultados por premio</h3>
        {AWARDS.map((a) => {
          const rows = tallies[a.key] ?? []
          return (
            <div key={a.key} className="bg-[#141414]/40 rounded-[18px] border border-white/[0.05] p-4">
              <p className="text-[10px] font-black uppercase tracking-tight text-white mb-2">{a.label}</p>
              {rows.length === 0 ? (
                <p className="text-[9px] text-[#2D2D2D] font-black uppercase tracking-widest py-2">Sin votos</p>
              ) : (
                <div className="space-y-1">
                  {rows.map((r, i) => (
                    <div key={r.id} className={`flex items-center gap-2.5 p-1.5 rounded-lg ${i === 0 ? 'bg-amber-400/[0.06]' : ''}`}>
                      <span className="w-5 text-center text-[10px] font-black text-[#6A6C6E]">{i + 1}</span>
                      {i === 0 && <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />}
                      <span className="flex-1 min-w-0 text-[11px] font-bold text-white truncate">{resolveName(r.id)}</span>
                      <span className="text-[8px] text-[#6A6C6E] font-black uppercase tracking-widest">{r.votes} votos</span>
                      <span className="text-sm font-black tabular-nums text-amber-300 w-8 text-right">{r.points}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Papeletas por DT */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#6A6C6E] flex items-center gap-2"><Vote className="w-3.5 h-3.5 text-[#FF3131]" /> Papeletas de los DTs ({ballots.length})</h3>
        {ballots.length === 0 ? (
          <p className="text-[9px] text-[#2D2D2D] font-black uppercase tracking-widest py-2">Aún no hay votos</p>
        ) : ballots.map((b, i) => (
          <div key={i} className="bg-[#141414]/40 rounded-[18px] border border-white/[0.05] p-4">
            <p className="text-[11px] font-black uppercase tracking-tight text-white mb-2">{b.name}</p>
            <div className="space-y-1">
              {AWARDS.filter((a) => b.picks[a.key]).map((a) => {
                const v = b.picks[a.key]
                return (
                  <div key={a.key} className="flex items-start gap-2 text-[9px]">
                    <span className="text-[#6A6C6E] font-black uppercase tracking-widest w-28 shrink-0">{a.label}</span>
                    <span className="text-white/80 font-bold">
                      <span className="text-amber-300">1º</span> {resolveName(v.first_id)}
                      {v.second_id && <> · <span className="text-zinc-300">2º</span> {resolveName(v.second_id)}</>}
                      {v.third_id && <> · <span className="text-amber-700">3º</span> {resolveName(v.third_id)}</>}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
