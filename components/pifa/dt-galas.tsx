'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Sparkles, Crown, Trophy, Shield, User as UserIcon, ChevronLeft, ChevronRight,
  Loader2, Goal, Star, HandHelping, Gem, Award, Lock, Check,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { GalaPayload, Nominee } from '@/lib/award-engine'
import type { User, Club, AwardKey } from '@/lib/types'

const AWARDS: { key: AwardKey; label: string; icon: React.ReactNode; accent: string }[] = [
  { key: 'ballon_dor', label: 'Balón de Oro', icon: <Gem className="w-4 h-4" />, accent: '#fbbf24' },
  { key: 'the_best', label: 'The Best', icon: <Star className="w-4 h-4" />, accent: '#FF3131' },
  { key: 'best_playmaker', label: 'The Best Playmaker', icon: <HandHelping className="w-4 h-4" />, accent: '#38bdf8' },
  { key: 'golden_boot', label: 'Bota de Oro', icon: <Goal className="w-4 h-4" />, accent: '#fbbf24' },
  { key: 'oliver_kahn', label: 'Premio Oliver Kahn', icon: <Shield className="w-4 h-4" />, accent: '#34d399' },
  { key: 'club_year', label: 'Club del Año', icon: <Trophy className="w-4 h-4" />, accent: '#FF3131' },
  { key: 'dt_year', label: 'DT del Año', icon: <Award className="w-4 h-4" />, accent: '#a78bfa' },
]

const SLOT_LABEL = ['1º', '2º', '3º']
const SLOT_COLOR = ['text-amber-300', 'text-zinc-300', 'text-amber-700']

interface PublishedSeason { season_id: string; season_name: string; is_open: boolean }
interface MyVote { first_id: string | null; second_id: string | null; third_id: string | null }

function nName(n: Nominee): string {
  if (n.type === 'player') return n.player?.name ?? 'Jugador'
  if (n.type === 'club') return n.club?.name ?? 'Club'
  return n.user?.full_name ?? 'DT'
}
function nSub(n: Nominee): string {
  if (n.type === 'player') return `${n.position || ''}${n.club?.name ? ' · ' + n.club.name : ''}`
  if (n.type === 'club') return 'Club'
  return n.club?.name ?? ''
}

function NomineeMedia({ n, size = 40 }: { n: Nominee; size?: number }) {
  if (n.type === 'player') {
    return (
      <div style={{ width: size, height: size }} className="rounded-full bg-[#0A0A0A] border border-[#202020] flex items-center justify-center overflow-hidden shrink-0">
        {n.player?.photo_url ? <img src={n.player.photo_url} alt="" className="w-full h-full object-cover" /> : <UserIcon style={{ width: size * 0.5, height: size * 0.5 }} className="text-[#6A6C6E]" />}
      </div>
    )
  }
  const shield = n.club?.shield_url
  return (
    <div style={{ width: size, height: size }} className="rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center overflow-hidden shrink-0">
      {shield ? <img src={shield} alt="" className="w-full h-full object-contain p-1" /> : <Shield style={{ width: size * 0.45, height: size * 0.45 }} className="text-[#6A6C6E]" />}
    </div>
  )
}

export default function DtGalas({ user, club }: { user: User | null; club: Club | null }) {
  const [loading, setLoading] = useState(true)
  const [seasons, setSeasons] = useState<PublishedSeason[]>([])
  const [selected, setSelected] = useState<PublishedSeason | null>(null)
  const [payload, setPayload] = useState<GalaPayload | null>(null)
  const [myVotes, setMyVotes] = useState<Record<string, MyVote>>({})
  const [loadingGala, setLoadingGala] = useState(false)
  const [champIndex, setChampIndex] = useState(0)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('season_gala_publish')
        .select('season_id, is_open, season:seasons(name)')
        .order('opened_at', { ascending: false })
      const list: PublishedSeason[] = ((data ?? []) as any[]).map((r) => ({
        season_id: r.season_id, season_name: r.season?.name ?? 'Temporada', is_open: r.is_open,
      }))
      setSeasons(list)
      setLoading(false)
    }
    load()
  }, [])

  const openSeason = async (s: PublishedSeason) => {
    setSelected(s)
    setLoadingGala(true)
    setChampIndex(0)
    const [pubRes, votesRes] = await Promise.all([
      supabase.from('season_gala_publish').select('payload, is_open').eq('season_id', s.season_id).maybeSingle(),
      user ? supabase.from('award_votes').select('*').eq('season_id', s.season_id).eq('voter_user_id', user.id) : Promise.resolve({ data: [] as any }),
    ])
    setPayload((pubRes.data as any)?.payload ?? null)
    const mv: Record<string, MyVote> = {}
    for (const v of ((votesRes as any).data ?? []) as any[]) mv[v.award_key] = { first_id: v.first_id, second_id: v.second_id, third_id: v.third_id }
    setMyVotes(mv)
    setLoadingGala(false)
  }

  const isSelf = (n: Nominee): boolean => {
    if (n.type === 'player') return !!club && n.club?.id === club.id
    if (n.type === 'club') return !!club && n.id === club.id
    return !!user && n.id === user.id
  }

  const picksOf = (key: AwardKey): string[] => {
    const v = myVotes[key]
    if (!v) return []
    return [v.first_id, v.second_id, v.third_id].filter(Boolean) as string[]
  }

  const togglePick = async (key: AwardKey, n: Nominee) => {
    if (!user) { toast.error('Sesión no encontrada'); return }
    if (!selected?.is_open) return
    if (isSelf(n)) { toast.error('No puedes votar por ti mismo / tu club'); return }
    let picks = picksOf(key)
    if (picks.includes(n.id)) picks = picks.filter((p) => p !== n.id)
    else if (picks.length < 3) picks = [...picks, n.id]
    else { toast.error('Ya elegiste tu top 3'); return }

    const next: MyVote = { first_id: picks[0] ?? null, second_id: picks[1] ?? null, third_id: picks[2] ?? null }
    setMyVotes((prev) => ({ ...prev, [key]: next }))
    const { error } = await supabase.from('award_votes').upsert({
      season_id: selected.season_id, award_key: key, voter_user_id: user.id, voter_name: user.full_name,
      first_id: next.first_id, second_id: next.second_id, third_id: next.third_id, updated_at: new Date().toISOString(),
    } as any, { onConflict: 'season_id,award_key,voter_user_id' })
    if (error) toast.error('No se pudo guardar el voto')
  }

  // ----- season selector -----
  if (!selected) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
            <Sparkles className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-tight">Galas</h2>
            <p className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest">Premios de temporadas pasadas</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-amber-400" /></div>
        ) : seasons.length === 0 ? (
          <div className="text-center py-16 bg-[#141414]/40 rounded-[24px] border border-dashed border-white/[0.06]">
            <Trophy className="w-12 h-12 text-[#2D2D2D] mx-auto mb-4" />
            <p className="text-[#6A6C6E] font-black uppercase tracking-[0.2em] text-[10px] px-8">No hay galas publicadas aún</p>
          </div>
        ) : (
          <div className="space-y-3">
            {seasons.map((s) => (
              <button key={s.season_id} onClick={() => openSeason(s)} className="w-full flex items-center gap-3 p-4 rounded-[20px] bg-[#141414]/50 border border-white/[0.05] hover:border-amber-400/30 transition-all text-left">
                <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white uppercase tracking-tight truncate">{s.season_name}</p>
                  <span className={`text-[8px] font-black uppercase tracking-widest ${s.is_open ? 'text-emerald-400' : 'text-[#6A6C6E]'}`}>
                    {s.is_open ? '● Votación abierta' : 'Votación cerrada'}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#6A6C6E]" />
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ----- gala view -----
  const champ = payload?.champions?.[champIndex]

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => { setSelected(null); setPayload(null) }} className="w-9 h-9 rounded-xl bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white transition-all active:scale-95 shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-white uppercase tracking-tight truncate">Gala · {selected.season_name}</h2>
          <span className={`text-[8px] font-black uppercase tracking-widest ${selected.is_open ? 'text-emerald-400' : 'text-[#6A6C6E]'}`}>
            {selected.is_open ? 'Votación abierta · elige tu top 3' : 'Votación cerrada'}
          </span>
        </div>
      </div>

      {loadingGala ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-amber-400" /></div>
      ) : !payload ? (
        <p className="text-[#6A6C6E] font-black uppercase tracking-widest text-[10px] text-center py-10">Gala no disponible</p>
      ) : (
        <>
          {/* Campeones + plantillas */}
          {payload.champions?.length > 0 && champ && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#6A6C6E] flex items-center gap-2"><Crown className="w-3.5 h-3.5 text-amber-300" /> Campeones</h3>
                {payload.champions.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setChampIndex((i) => (i - 1 + payload.champions.length) % payload.champions.length)} className="w-7 h-7 rounded-lg bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E]"><ChevronLeft className="w-3.5 h-3.5" /></button>
                    <span className="text-[8px] font-black text-[#6A6C6E] tabular-nums w-10 text-center">{champIndex + 1}/{payload.champions.length}</span>
                    <button onClick={() => setChampIndex((i) => (i + 1) % payload.champions.length)} className="w-7 h-7 rounded-lg bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E]"><ChevronRight className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
              <div className="rounded-[20px] border border-amber-400/15 bg-gradient-to-br from-amber-400/[0.06] to-transparent p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center overflow-hidden">
                      {champ.clubShield ? <img src={champ.clubShield} alt="" className="w-full h-full object-contain p-1" /> : <Shield className="w-6 h-6 text-[#6A6C6E]" />}
                    </div>
                    <Crown className="w-5 h-5 text-amber-300 absolute -top-3 left-1/2 -translate-x-1/2" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[8px] font-black uppercase tracking-[0.25em] text-[#6A6C6E]">{champ.competitionName}</p>
                    <p className="text-lg font-black text-white uppercase tracking-tight truncate leading-none">{champ.clubName}</p>
                    <p className="text-[8px] font-black uppercase tracking-widest text-amber-300 mt-0.5">Campeón</p>
                  </div>
                </div>
                <div className="grid gap-2 grid-cols-2">
                  {champ.roster.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                      <div className="w-8 h-8 rounded-full bg-[#0A0A0A] border border-[#202020] flex items-center justify-center overflow-hidden shrink-0">
                        {p.photo_url ? <img src={p.photo_url} alt="" className="w-full h-full object-cover" /> : <UserIcon className="w-4 h-4 text-[#6A6C6E]" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold text-white truncate leading-tight">{p.number != null ? <span className="text-[#6A6C6E]">{p.number} · </span> : null}{p.name}</p>
                        <div className="flex items-center gap-1.5 text-[7px] font-black uppercase tracking-widest text-[#6A6C6E]">
                          <span>{p.position}</span>
                          {p.goals > 0 && <span className="text-amber-300">{p.goals}G</span>}
                          {p.assists > 0 && <span className="text-sky-400">{p.assists}A</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Premios */}
          {AWARDS.map((a) => {
            const nominees = [...((payload.awards as any)?.[a.key] ?? []) as Nominee[]].sort((x, y) => nName(x).localeCompare(nName(y)))
            if (nominees.length === 0) return null
            const picks = picksOf(a.key)
            return (
              <section key={a.key} className="bg-[#141414]/40 rounded-[20px] border border-white/[0.05] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span style={{ color: a.accent }}>{a.icon}</span>
                  <h3 className="text-sm font-black text-white uppercase tracking-tight">{a.label}</h3>
                </div>

                {/* Top 3 elegido */}
                {selected.is_open && (
                  <div className="flex items-center gap-2">
                    {[0, 1, 2].map((slot) => {
                      const id = picks[slot]
                      const n = id ? nominees.find((x) => x.id === id) : null
                      return (
                        <div key={slot} className={`flex-1 h-9 rounded-lg border flex items-center justify-center gap-1 px-2 ${id ? 'bg-white/[0.04] border-white/10' : 'bg-white/[0.02] border-dashed border-white/[0.06]'}`}>
                          <span className={`text-[9px] font-black ${SLOT_COLOR[slot]}`}>{SLOT_LABEL[slot]}</span>
                          <span className="text-[9px] font-bold text-white truncate">{n ? nName(n) : '—'}</span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Nominados (alfabético) */}
                <div className="space-y-1.5">
                  {nominees.map((n) => {
                    const rank = picks.indexOf(n.id)
                    const self = isSelf(n)
                    const chosen = rank >= 0
                    return (
                      <button
                        key={n.id}
                        disabled={!selected.is_open || self}
                        onClick={() => togglePick(a.key, n)}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all ${
                          chosen ? 'bg-emerald-500/[0.08] border-emerald-500/30'
                          : self ? 'bg-white/[0.01] border-white/[0.03] opacity-40'
                          : 'bg-white/[0.02] border-white/[0.04] hover:border-white/15'
                        } ${!selected.is_open && !chosen ? 'opacity-80' : ''}`}
                      >
                        <NomineeMedia n={n} size={34} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-white truncate leading-tight">{nName(n)}</p>
                          <p className="text-[8px] text-[#6A6C6E] font-black uppercase tracking-widest truncate">{nSub(n)}{self ? ' · tú' : ''}</p>
                        </div>
                        {chosen ? (
                          <span className={`text-[10px] font-black ${SLOT_COLOR[rank]} shrink-0`}>{SLOT_LABEL[rank]}</span>
                        ) : self ? (
                          <Lock className="w-3.5 h-3.5 text-[#6A6C6E] shrink-0" />
                        ) : selected.is_open ? (
                          <div className="w-4 h-4 rounded-full border border-white/15 shrink-0" />
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
