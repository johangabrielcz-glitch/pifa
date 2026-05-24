'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Crown, Trophy, Goal, Star, HandHelping, Shield, User as UserIcon, ChevronDown,
  Plus, X, ArrowUp, ArrowDown, SlidersHorizontal, Loader2, Gem, Award, Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  computeAwards, defaultWeight,
  type AwardCompBlock, type Nominee, type PlayerNominee, type ClubNominee, type DtNominee,
} from '@/lib/award-engine'
import type { Season, Club, User, AwardKey, AwardWinnerType, AwardNomineeRef } from '@/lib/types'

interface AwardMeta {
  key: AwardKey
  label: string
  desc: string
  type: AwardWinnerType
  limit: number
  accent: string
  icon: React.ReactNode
}

const AWARDS: AwardMeta[] = [
  { key: 'ballon_dor', label: 'Balón de Oro', desc: 'Mejor jugador · brillo individual', type: 'player', limit: 30, accent: '#fbbf24', icon: <Gem className="w-4 h-4" /> },
  { key: 'the_best', label: 'The Best', desc: 'Mejor jugador · impacto colectivo', type: 'player', limit: 5, accent: '#FF3131', icon: <Star className="w-4 h-4" /> },
  { key: 'best_playmaker', label: 'The Best Playmaker', desc: 'Mejor creador de juego', type: 'player', limit: 5, accent: '#38bdf8', icon: <HandHelping className="w-4 h-4" /> },
  { key: 'golden_boot', label: 'Bota de Oro', desc: 'Máximo goleador (ponderado)', type: 'player', limit: 5, accent: '#fbbf24', icon: <Goal className="w-4 h-4" /> },
  { key: 'oliver_kahn', label: 'Premio Oliver Kahn', desc: 'Mejor portero', type: 'player', limit: 5, accent: '#34d399', icon: <Shield className="w-4 h-4" /> },
  { key: 'club_year', label: 'Club del Año', desc: 'Mejor club de la temporada', type: 'club', limit: 5, accent: '#FF3131', icon: <Trophy className="w-4 h-4" /> },
  { key: 'dt_year', label: 'DT del Año', desc: 'Mejor rendimiento sobre el plantel', type: 'user', limit: 5, accent: '#a78bfa', icon: <Award className="w-4 h-4" /> },
]

// ---------- mini display helpers ----------

function ClubBadge({ club, size = 40 }: { club?: Club | null; size?: number }) {
  return (
    <div style={{ width: size, height: size }} className="rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center overflow-hidden shrink-0">
      {club?.shield_url ? <img src={club.shield_url} alt={club.name} className="w-full h-full object-contain p-1" /> : <Shield style={{ width: size * 0.45, height: size * 0.45 }} className="text-[#6A6C6E]" />}
    </div>
  )
}

function Avatar({ nominee, size = 40 }: { nominee?: Nominee | null; size?: number }) {
  if (!nominee) return <ClubBadge size={size} />
  if (nominee.type === 'player') {
    const p = nominee.player
    return (
      <div style={{ width: size, height: size }} className="rounded-full bg-[#0A0A0A] border border-[#202020] flex items-center justify-center overflow-hidden shrink-0">
        {p?.photo_url ? <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" /> : <UserIcon style={{ width: size * 0.5, height: size * 0.5 }} className="text-[#6A6C6E]" />}
      </div>
    )
  }
  return <ClubBadge club={nominee.club} size={size} />
}

function nomineeName(n: Nominee): string {
  if (n.type === 'player') return n.player?.name ?? 'Jugador'
  if (n.type === 'club') return n.club?.name ?? 'Club'
  return n.user?.full_name ?? 'DT'
}

function nomineeSub(n: Nominee): string {
  if (n.type === 'player') return `${n.position || ''}${n.club?.name ? ' · ' + n.club.name : ''}`
  if (n.type === 'club') return 'Club'
  return n.club?.name ?? ''
}

function StatChips({ n }: { n: Nominee }) {
  if (n.type === 'player') {
    return (
      <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest flex-wrap">
        {n.goals > 0 && <span className="text-amber-300">{n.goals}G</span>}
        {n.assists > 0 && <span className="text-sky-400">{n.assists}A</span>}
        {n.mvp > 0 && <span className="text-[#FF3131]">{n.mvp}MVP</span>}
        {n.apps > 0 && <span className="text-[#6A6C6E]">{n.apps}PJ</span>}
        {n.titles > 0 && <span className="text-amber-300 flex items-center gap-0.5"><Trophy className="w-2.5 h-2.5" />{n.titles}</span>}
      </div>
    )
  }
  if (n.type === 'club') {
    return (
      <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest flex-wrap">
        {n.titles > 0 && <span className="text-amber-300 flex items-center gap-0.5"><Trophy className="w-2.5 h-2.5" />{n.titles}</span>}
        <span className="text-[#6A6C6E]">{n.points} PTS</span>
        <span className="text-sky-400">{n.gd >= 0 ? '+' : ''}{n.gd} DG</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest flex-wrap">
      {n.titles > 0 && <span className="text-amber-300 flex items-center gap-0.5"><Trophy className="w-2.5 h-2.5" />{n.titles}</span>}
      <span className="text-[#6A6C6E] flex items-center gap-0.5"><Wallet className="w-2.5 h-2.5" />{(n.budget / 1000).toFixed(0)}k</span>
    </div>
  )
}

// ---------- component ----------

interface SavedAward { winner_id: string | null; nominees: AwardNomineeRef[] }

export default function GalaAwards({ season, blocks, clubMatchCounts }: {
  season: Season
  blocks: AwardCompBlock[]
  clubMatchCounts: Record<string, number>
}) {
  const [loading, setLoading] = useState(true)
  const [clubsById, setClubsById] = useState<Record<string, Club>>({})
  const [dtByClub, setDtByClub] = useState<Record<string, User>>({})
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [saved, setSaved] = useState<Record<string, SavedAward>>({})
  const [showWeights, setShowWeights] = useState(false)
  const [addingFor, setAddingFor] = useState<AwardKey | null>(null)
  const weightTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [clubsRes, usersRes, awardsRes, weightsRes] = await Promise.all([
        supabase.from('clubs').select('id, name, shield_url, budget'),
        supabase.from('users').select('id, full_name, club_id, role'),
        supabase.from('season_awards').select('*').eq('season_id', season.id),
        supabase.from('season_award_weights').select('*').eq('season_id', season.id),
      ])

      const cById: Record<string, Club> = {}
      for (const c of (clubsRes.data ?? []) as Club[]) cById[c.id] = c
      setClubsById(cById)

      const dt: Record<string, User> = {}
      for (const u of (usersRes.data ?? []) as User[]) {
        if (u.club_id && u.role === 'user' && !dt[u.club_id]) dt[u.club_id] = u
      }
      setDtByClub(dt)

      const w: Record<string, number> = {}
      for (const b of blocks) w[b.competition.id] = defaultWeight(b.competition)
      for (const row of (weightsRes.data ?? []) as any[]) w[row.competition_id] = Number(row.weight)
      setWeights(w)

      const sv: Record<string, SavedAward> = {}
      for (const a of (awardsRes.data ?? []) as any[]) {
        sv[a.award_key] = { winner_id: a.winner_id, nominees: Array.isArray(a.nominees) ? a.nominees : [] }
      }
      setSaved(sv)

      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season.id])

  const computed = useMemo(
    () => computeAwards({ blocks, weights, clubMatchCounts, clubsById, dtByClub }),
    [blocks, weights, clubMatchCounts, clubsById, dtByClub]
  )

  // pool lookup maps por premio
  const poolMaps = useMemo(() => {
    const maps: Record<string, Map<string, Nominee>> = {}
    for (const a of AWARDS) {
      const m = new Map<string, Nominee>()
      for (const n of computed[a.key]) m.set(n.id, n)
      maps[a.key] = m
    }
    return maps
  }, [computed])

  const awardType = (key: AwardKey): AwardWinnerType => AWARDS.find((a) => a.key === key)!.type

  const currentRefs = (key: AwardKey, limit: number): AwardNomineeRef[] => {
    const s = saved[key]
    if (s && s.nominees.length > 0) return s.nominees
    return computed[key].slice(0, limit).map((n) => ({ type: n.type, id: n.id }))
  }

  const resolveRefs = (key: AwardKey, refs: AwardNomineeRef[]): Nominee[] =>
    refs.map((r) => poolMaps[key].get(r.id)).filter(Boolean) as Nominee[]

  // -------- persistencia --------

  const persistAward = async (key: AwardKey, patch: Partial<SavedAward>) => {
    setSaved((prev) => {
      const next = { ...prev, [key]: { winner_id: patch.winner_id !== undefined ? patch.winner_id : (prev[key]?.winner_id ?? null), nominees: patch.nominees ?? prev[key]?.nominees ?? [] } }
      return next
    })
    const cur = saved[key] ?? { winner_id: null, nominees: [] }
    await supabase.from('season_awards').upsert({
      season_id: season.id,
      award_key: key,
      winner_type: awardType(key),
      winner_id: patch.winner_id !== undefined ? patch.winner_id : cur.winner_id,
      nominees: patch.nominees ?? cur.nominees,
    } as any, { onConflict: 'season_id,award_key' })
  }

  const setWinner = (key: AwardKey, id: string) => persistAward(key, { winner_id: id })

  const setNominees = (key: AwardKey, refs: AwardNomineeRef[]) => persistAward(key, { nominees: refs })

  const removeNominee = (key: AwardKey, id: string, limit: number) =>
    setNominees(key, currentRefs(key, limit).filter((r) => r.id !== id))

  const addNominee = (key: AwardKey, ref: AwardNomineeRef, limit: number) =>
    setNominees(key, [...currentRefs(key, limit), ref])

  const moveNominee = (key: AwardKey, id: string, dir: -1 | 1, limit: number) => {
    const refs = [...currentRefs(key, limit)]
    const i = refs.findIndex((r) => r.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= refs.length) return
    ;[refs[i], refs[j]] = [refs[j], refs[i]]
    setNominees(key, refs)
  }

  const setWeight = (compId: string, value: number) => {
    setWeights((prev) => ({ ...prev, [compId]: value }))
    clearTimeout(weightTimers.current[compId])
    weightTimers.current[compId] = setTimeout(() => {
      supabase.from('season_award_weights').upsert(
        { season_id: season.id, competition_id: compId, weight: value } as any,
        { onConflict: 'season_id,competition_id' }
      )
    }, 400)
  }

  const resetWeights = () => {
    const w: Record<string, number> = {}
    for (const b of blocks) w[b.competition.id] = defaultWeight(b.competition)
    setWeights(w)
    for (const b of blocks) {
      supabase.from('season_award_weights').upsert(
        { season_id: season.id, competition_id: b.competition.id, weight: defaultWeight(b.competition) } as any,
        { onConflict: 'season_id,competition_id' }
      )
    }
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-[#FF3131]" /></div>
  }

  return (
    <div className="space-y-5">
      {/* Panel de jerarquía */}
      <div className="bg-[#141414]/50 rounded-[20px] border border-white/[0.05] overflow-hidden">
        <button onClick={() => setShowWeights((v) => !v)} className="w-full flex items-center justify-between gap-2 px-4 h-11">
          <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-white">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#FF3131]" /> Jerarquía de competiciones
          </span>
          <ChevronDown className={`w-4 h-4 text-[#6A6C6E] transition-transform ${showWeights ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence initial={false}>
          {showWeights && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="px-4 pb-4 space-y-3">
                {blocks.map((b) => (
                  <div key={b.competition.id} className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-white truncate flex-1 min-w-0">{b.competition.name}</span>
                    <input
                      type="range" min={0.1} max={2} step={0.1}
                      value={weights[b.competition.id] ?? defaultWeight(b.competition)}
                      onChange={(e) => setWeight(b.competition.id, Number(e.target.value))}
                      className="w-32 accent-[#FF3131]"
                    />
                    <span className="text-[10px] font-black text-[#FF3131] tabular-nums w-8 text-right">{(weights[b.competition.id] ?? defaultWeight(b.competition)).toFixed(1)}</span>
                  </div>
                ))}
                <button onClick={resetWeights} className="text-[8px] font-black uppercase tracking-widest text-[#6A6C6E] hover:text-white transition-colors">
                  Restablecer defaults
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Premios */}
      {AWARDS.map((meta) => {
        const refs = currentRefs(meta.key, meta.limit)
        const nominees = resolveRefs(meta.key, refs)
        const recommendedId = computed[meta.key][0]?.id
        const winnerId = saved[meta.key]?.winner_id ?? nominees[0]?.id
        const winner = winnerId ? poolMaps[meta.key].get(winnerId) : undefined
        const addPool = computed[meta.key].filter((n) => !refs.some((r) => r.id === n.id)).slice(0, 12)

        return (
          <section key={meta.key} className="bg-[#141414]/40 rounded-[22px] border border-white/[0.05] p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span style={{ color: meta.accent }}>{meta.icon}</span>
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-tight leading-none">{meta.label}</h3>
                <p className="text-[8px] text-[#6A6C6E] font-black uppercase tracking-[0.2em] mt-0.5">{meta.desc}</p>
              </div>
            </div>

            {/* Ganador */}
            {winner ? (
              <div className="relative rounded-[18px] border p-4 overflow-hidden" style={{ borderColor: `${meta.accent}40`, background: `linear-gradient(135deg, ${meta.accent}14, transparent)` }}>
                <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-[60px] pointer-events-none animate-medal-shine" style={{ background: `${meta.accent}25` }} />
                <div className="flex items-center gap-4 relative z-10">
                  <div className="relative">
                    <Avatar nominee={winner} size={64} />
                    <Crown className="w-6 h-6 absolute -top-3 left-1/2 -translate-x-1/2 drop-shadow-[0_0_6px_rgba(252,211,77,0.6)]" style={{ color: meta.accent }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[8px] font-black uppercase tracking-[0.3em]" style={{ color: meta.accent }}>Ganador</span>
                    <p className="text-xl font-black text-white uppercase tracking-tight truncate leading-none mt-0.5">{nomineeName(winner)}</p>
                    <p className="text-[8px] text-[#6A6C6E] font-black uppercase tracking-widest truncate mt-1">{nomineeSub(winner)}</p>
                    <div className="mt-1.5"><StatChips n={winner} /></div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[9px] text-[#6A6C6E] font-black uppercase tracking-widest py-4 text-center">Sin nominados con datos</p>
            )}

            {/* Nominados */}
            <div className="space-y-1.5">
              {nominees.map((n, i) => {
                const isWinner = n.id === winnerId
                const isRec = n.id === recommendedId
                const tierLabel =
                  meta.key === 'ballon_dor' && i === 1 ? 'Podio'
                  : meta.key === 'ballon_dor' && i === 3 ? 'Finalistas'
                  : meta.key === 'ballon_dor' && i === 5 ? 'Nominados'
                  : null
                return (
                  <div key={n.id}>
                    {tierLabel && <p className="text-[7px] font-black uppercase tracking-[0.3em] text-[#2D2D2D] pt-2 pb-1">{tierLabel}</p>}
                    <div className={`flex items-center gap-2.5 p-2 rounded-xl border ${isWinner ? 'bg-amber-400/[0.06] border-amber-400/25' : 'bg-white/[0.02] border-white/[0.04]'}`}>
                      <span className="w-5 text-center text-[10px] font-black text-[#6A6C6E] shrink-0">{i + 1}</span>
                      <Avatar nominee={n} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[11px] font-bold text-white truncate leading-tight">{nomineeName(n)}</p>
                          {isRec && <span className="px-1 py-0.5 rounded bg-[#FF3131]/15 text-[#FF3131] text-[6px] font-black uppercase tracking-widest shrink-0">Rec</span>}
                        </div>
                        <StatChips n={n} />
                      </div>
                      <span className="text-[10px] font-black tabular-nums shrink-0 mr-1" style={{ color: meta.accent }}>{n.score.toFixed(0)}</span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => moveNominee(meta.key, n.id, -1, meta.limit)} className="w-6 h-6 rounded-md text-[#6A6C6E] hover:text-white hover:bg-white/5 flex items-center justify-center"><ArrowUp className="w-3 h-3" /></button>
                        <button onClick={() => moveNominee(meta.key, n.id, 1, meta.limit)} className="w-6 h-6 rounded-md text-[#6A6C6E] hover:text-white hover:bg-white/5 flex items-center justify-center"><ArrowDown className="w-3 h-3" /></button>
                        <button onClick={() => setWinner(meta.key, n.id)} className={`w-6 h-6 rounded-md flex items-center justify-center ${isWinner ? 'text-amber-300' : 'text-[#6A6C6E] hover:text-amber-300 hover:bg-white/5'}`} title="Elegir ganador"><Crown className="w-3.5 h-3.5" /></button>
                        <button onClick={() => removeNominee(meta.key, n.id, meta.limit)} className="w-6 h-6 rounded-md text-[#6A6C6E] hover:text-red-400 hover:bg-white/5 flex items-center justify-center" title="Quitar"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                )
              })}
              {nominees.length === 0 && <p className="text-[9px] text-[#2D2D2D] font-black uppercase tracking-widest py-3 text-center">Sin nominados</p>}
            </div>

            {/* Añadir nominado */}
            {addPool.length > 0 && (
              <div>
                <button
                  onClick={() => setAddingFor(addingFor === meta.key ? null : meta.key)}
                  className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-[#6A6C6E] hover:text-white transition-colors"
                >
                  <Plus className="w-3 h-3" /> Añadir nominado
                </button>
                <AnimatePresence initial={false}>
                  {addingFor === meta.key && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                      <div className="grid gap-1.5 grid-cols-1 sm:grid-cols-2 pt-2">
                        {addPool.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => { addNominee(meta.key, { type: n.type, id: n.id }, meta.limit); setAddingFor(null) }}
                            className="flex items-center gap-2 p-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-[#FF3131]/30 transition-all text-left"
                          >
                            <Avatar nominee={n} size={26} />
                            <span className="text-[10px] font-bold text-white truncate flex-1">{nomineeName(n)}</span>
                            <span className="text-[9px] font-black tabular-nums text-[#6A6C6E]">{n.score.toFixed(0)}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
