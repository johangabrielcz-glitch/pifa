'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Sparkles, Crown, Trophy, Shield, User as UserIcon, ChevronLeft, ChevronRight,
  Loader2, Star, HandHelping, Gem, Award, Lock, Check, Goal, Medal,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { GalaPayload, Nominee } from '@/lib/award-engine'
import type { User, Club, AwardKey } from '@/lib/types'

const AWARDS: { key: AwardKey; label: string; short: string; icon: React.ReactNode; accent: string; desc: string; votable: boolean }[] = [
  { key: 'ballon_dor', label: 'Balón de Oro', short: 'Balón de Oro', icon: <Gem className="w-4 h-4" />, accent: '#fbbf24', desc: 'El mejor del año', votable: true },
  { key: 'the_best', label: 'The Best', short: 'The Best', icon: <Star className="w-4 h-4" />, accent: '#FF3131', desc: 'Impacto y títulos', votable: true },
  { key: 'best_playmaker', label: 'The Best Playmaker', short: 'Playmaker', icon: <HandHelping className="w-4 h-4" />, accent: '#38bdf8', desc: 'El mejor creador', votable: true },
  { key: 'oliver_kahn', label: 'Premio Oliver Kahn', short: 'Oliver Kahn', icon: <Shield className="w-4 h-4" />, accent: '#34d399', desc: 'El mejor portero', votable: true },
  { key: 'club_year', label: 'Club del Año', short: 'Club', icon: <Trophy className="w-4 h-4" />, accent: '#FF3131', desc: 'El mejor club', votable: true },
  { key: 'dt_year', label: 'DT del Año', short: 'DT', icon: <Award className="w-4 h-4" />, accent: '#a78bfa', desc: 'El mejor entrenador', votable: true },
  // No votable: solo aparece cuando el admin revela resultados.
  { key: 'golden_boot', label: 'Bota de Oro', short: 'Bota de Oro', icon: <Goal className="w-4 h-4" />, accent: '#fbbf24', desc: 'El máximo goleador', votable: false },
]

const MEDAL = [
  { color: '#fbbf24', label: '1º' },
  { color: '#d4d4d8', label: '2º' },
  { color: '#cd7f32', label: '3º' },
]

interface PublishedSeason { season_id: string; season_name: string; is_open: boolean }
interface MyVote { first_id: string | null; second_id: string | null; third_id: string | null }
type GalaTab = AwardKey | 'champions'

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
function nImage(n: Nominee): string | null {
  if (n.type === 'player') return n.player?.photo_url ?? null
  return n.club?.shield_url ?? null
}

function StatChips({ n }: { n: Nominee }) {
  if (n.type === 'player') {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {n.goals > 0 && <Chip color="#fbbf24" label={`${n.goals} G`} />}
        {n.assists > 0 && <Chip color="#38bdf8" label={`${n.assists} A`} />}
        {n.mvp > 0 && <Chip color="#FF3131" label={`${n.mvp} MVP`} />}
        {n.apps > 0 && <Chip color="#6A6C6E" label={`${n.apps} PJ`} />}
        {n.titles > 0 && <Chip color="#fbbf24" label={`🏆 ${n.titles}`} />}
        {n.goals === 0 && n.assists === 0 && n.mvp === 0 && <span className="text-[7px] text-[#3a3a3a] font-black uppercase tracking-widest">{n.apps} PJ</span>}
      </div>
    )
  }
  if (n.type === 'club') {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {n.titles > 0 && <Chip color="#fbbf24" label={`🏆 ${n.titles}`} />}
        <Chip color="#6A6C6E" label={`${n.points} PTS`} />
        <Chip color="#38bdf8" label={`${n.gd >= 0 ? '+' : ''}${n.gd} DG`} />
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {n.titles > 0 && <Chip color="#fbbf24" label={`🏆 ${n.titles}`} />}
      <Chip color="#a78bfa" label="Entrenador" />
    </div>
  )
}

function Chip({ color, label }: { color: string; label: string }) {
  return (
    <span className="text-[7.5px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md" style={{ color, background: `${color}1A` }}>{label}</span>
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
  const [galaTab, setGalaTab] = useState<GalaTab>('ballon_dor')
  const [resultsVisible, setResultsVisible] = useState(false)

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
    setGalaTab('ballon_dor')
    const [pubRes, votesRes] = await Promise.all([
      supabase.from('season_gala_publish').select('payload, is_open, results_visible').eq('season_id', s.season_id).maybeSingle(),
      user ? supabase.from('award_votes').select('*').eq('season_id', s.season_id).eq('voter_user_id', user.id) : Promise.resolve({ data: [] as any }),
    ])
    setPayload((pubRes.data as any)?.payload ?? null)
    setResultsVisible(!!(pubRes.data as any)?.results_visible)
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

  // Guarda el voto con delete + insert (robusto: no depende del UNIQUE para onConflict).
  const saveVote = async (key: AwardKey, next: MyVote) => {
    if (!user || !selected) return
    await supabase.from('award_votes').delete()
      .eq('season_id', selected.season_id).eq('award_key', key).eq('voter_user_id', user.id)
    if (next.first_id) {
      const { error } = await supabase.from('award_votes').insert({
        season_id: selected.season_id, award_key: key, voter_user_id: user.id, voter_name: user.full_name,
        first_id: next.first_id, second_id: next.second_id, third_id: next.third_id,
      } as any)
      if (error) toast.error('No se pudo guardar el voto')
    }
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
    await saveVote(key, next)
  }

  const removePick = async (key: AwardKey, id: string) => {
    if (!user || !selected?.is_open) return
    const picks = picksOf(key).filter((p) => p !== id)
    const next: MyVote = { first_id: picks[0] ?? null, second_id: picks[1] ?? null, third_id: picks[2] ?? null }
    setMyVotes((prev) => ({ ...prev, [key]: next }))
    await saveVote(key, next)
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
  const activeAward = galaTab !== 'champions' ? AWARDS.find((a) => a.key === galaTab)! : null

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0A0A0A]/90 backdrop-blur-xl border-b border-white/[0.04] px-4 pt-4 pb-2">
        <div className="flex items-center gap-3 mb-3">
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

        {/* Barra de pestañas */}
        {payload && (
          <div className="flex gap-1.5 overflow-x-auto pb-1.5 -mx-1 px-1 scrollbar-hide">
            {AWARDS.filter((a) => a.votable || resultsVisible).map((a) => {
              const active = galaTab === a.key
              const voted = !!myVotes[a.key]?.first_id
              return (
                <button
                  key={a.key}
                  onClick={() => setGalaTab(a.key)}
                  className={`relative shrink-0 px-3 h-8 rounded-lg border flex items-center gap-1.5 transition-all ${active ? 'border-transparent' : 'border-white/[0.05] bg-white/[0.02]'}`}
                  style={active ? { background: `${a.accent}1F`, borderColor: `${a.accent}55` } : undefined}
                >
                  <span style={{ color: active ? a.accent : '#6A6C6E' }}>{a.icon}</span>
                  <span className={`text-[8px] font-black uppercase tracking-widest ${active ? 'text-white' : 'text-[#6A6C6E]'}`}>{a.short}</span>
                  {voted && <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0"><Check className="w-2.5 h-2.5 text-white" /></span>}
                </button>
              )
            })}
            <button
              onClick={() => setGalaTab('champions')}
              className={`shrink-0 px-3 h-8 rounded-lg border flex items-center gap-1.5 transition-all ${galaTab === 'champions' ? 'bg-amber-400/15 border-amber-400/40' : 'border-white/[0.05] bg-white/[0.02]'}`}
            >
              <Crown className={`w-4 h-4 ${galaTab === 'champions' ? 'text-amber-300' : 'text-[#6A6C6E]'}`} />
              <span className={`text-[8px] font-black uppercase tracking-widest ${galaTab === 'champions' ? 'text-white' : 'text-[#6A6C6E]'}`}>Campeones</span>
            </button>
          </div>
        )}
      </div>

      <div className="px-4 py-5 pb-24">
        {loadingGala ? (
          <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-amber-400" /></div>
        ) : !payload ? (
          <p className="text-[#6A6C6E] font-black uppercase tracking-widest text-[10px] text-center py-10">Gala no disponible</p>
        ) : galaTab === 'champions' ? (
          /* ---------- CAMPEONES (carrusel) ---------- */
          !champ ? (
            <p className="text-[#6A6C6E] font-black uppercase tracking-widest text-[10px] text-center py-10">Sin campeones</p>
          ) : (
            <motion.div key={champIndex} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#6A6C6E] flex items-center gap-2"><Crown className="w-3.5 h-3.5 text-amber-300" /> Campeones</h3>
                {payload.champions.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setChampIndex((i) => (i - 1 + payload.champions.length) % payload.champions.length)} className="w-7 h-7 rounded-lg bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E]"><ChevronLeft className="w-3.5 h-3.5" /></button>
                    <span className="text-[8px] font-black text-[#6A6C6E] tabular-nums w-10 text-center">{champIndex + 1}/{payload.champions.length}</span>
                    <button onClick={() => setChampIndex((i) => (i + 1) % payload.champions.length)} className="w-7 h-7 rounded-lg bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E]"><ChevronRight className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
              <div className="relative rounded-[24px] border border-amber-400/20 bg-gradient-to-br from-amber-400/[0.08] to-transparent p-5 overflow-hidden">
                <div className="absolute -top-16 -right-16 w-44 h-44 bg-amber-400/15 rounded-full blur-[70px] pointer-events-none animate-medal-shine" />
                <div className="flex flex-col items-center text-center mb-5 relative z-10">
                  <div className="relative mb-2">
                    <div className="w-20 h-20 rounded-2xl bg-[#0A0A0A] border border-amber-400/30 flex items-center justify-center overflow-hidden shadow-[0_0_25px_rgba(251,191,36,0.25)]">
                      {champ.clubShield ? <img src={champ.clubShield} alt="" className="w-full h-full object-contain p-1.5" /> : <Shield className="w-9 h-9 text-[#6A6C6E]" />}
                    </div>
                    <Crown className="w-7 h-7 text-amber-300 absolute -top-4 left-1/2 -translate-x-1/2 drop-shadow-[0_0_8px_rgba(252,211,77,0.7)]" />
                  </div>
                  <p className="text-[8px] font-black uppercase tracking-[0.3em] text-[#6A6C6E]">{champ.competitionName}</p>
                  <p className="text-xl font-black text-white uppercase tracking-tight leading-none mt-0.5">{champ.clubName}</p>
                  <p className="text-[8px] font-black uppercase tracking-[0.3em] text-amber-300 mt-1">Campeón</p>
                </div>
                <div className="grid gap-2 grid-cols-2 relative z-10">
                  {champ.roster.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <div className="w-9 h-9 rounded-full bg-[#0A0A0A] border border-[#202020] flex items-center justify-center overflow-hidden shrink-0">
                        {p.photo_url ? <img src={p.photo_url} alt="" className="w-full h-full object-cover" /> : <UserIcon className="w-4 h-4 text-[#6A6C6E]" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold text-white truncate leading-tight">{p.number != null ? <span className="text-[#6A6C6E]">{p.number} · </span> : null}{p.name}</p>
                        <div className="flex items-center gap-1 text-[7px] font-black uppercase tracking-widest text-[#6A6C6E]">
                          <span>{p.position}</span>
                          {p.goals > 0 && <span className="text-amber-300">{p.goals}G</span>}
                          {p.assists > 0 && <span className="text-sky-400">{p.assists}A</span>}
                          {p.matches > 0 && <span>{p.matches}PJ</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )
        ) : activeAward ? (
          /* ---------- PREMIO ---------- */
          (() => {
            const key = activeAward.key
            const accent = activeAward.accent
            const votable = activeAward.votable
            const nominees = [...((payload.awards as any)?.[key] ?? []) as Nominee[]].sort((x, y) => nName(x).localeCompare(nName(y)))
            const picks = picksOf(key)
            const showPodium = selected.is_open || picks.length > 0
            const podium = resultsVisible ? (payload.results as any)?.[key] : null
            return (
              <motion.div key={key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-4">
                {/* Encabezado premium */}
                <div className="flex flex-col items-center text-center py-2">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-2" style={{ background: `${accent}1A`, border: `1px solid ${accent}40`, boxShadow: `0 0 25px ${accent}33` }}>
                    <span style={{ color: accent }}>{activeAward.icon}</span>
                  </div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tighter leading-none">{activeAward.label}</h3>
                  <p className="text-[8px] font-black uppercase tracking-[0.3em] mt-1" style={{ color: accent }}>{activeAward.desc}</p>
                </div>

                {nominees.length === 0 ? (
                  <p className="text-[#6A6C6E] font-black uppercase tracking-widest text-[10px] text-center py-10">Sin nominados</p>
                ) : (
                  <>
                    {/* Podio oficial revelado por el admin (sin puntos ni stats) */}
                    {podium && Array.isArray(podium.top) && podium.top.length > 0 && (
                      <div className="rounded-[18px] border border-amber-400/20 bg-gradient-to-b from-amber-400/[0.06] to-transparent p-3 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Medal className="w-3.5 h-3.5 text-amber-300" />
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300">Podio oficial</span>
                        </div>
                        {(podium.top as string[]).map((id, i) => {
                          const n = nominees.find((x) => x.id === id)
                          if (!n) return null
                          const isWinner = i === 0
                          return (
                            <div key={id} className={`flex items-center gap-2.5 p-2 rounded-xl border ${isWinner ? 'bg-amber-400/[0.10] border-amber-400/40' : 'bg-white/[0.02] border-white/[0.04]'}`}>
                              <span className="w-5 text-center text-[11px] font-black" style={{ color: i < 3 ? MEDAL[i].color : '#6A6C6E' }}>{i + 1}</span>
                              <div className="w-9 h-9 rounded-full bg-[#0A0A0A] border flex items-center justify-center overflow-hidden shrink-0" style={{ borderColor: isWinner ? '#fbbf24' : '#202020' }}>
                                {nImage(n) ? <img src={nImage(n)!} alt="" className={n.type === 'player' ? 'w-full h-full object-cover' : 'w-full h-full object-contain p-1'} /> : <UserIcon className="w-4 h-4 text-[#6A6C6E]" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-black text-white truncate leading-tight">{nName(n)}</p>
                                <p className="text-[7.5px] text-[#6A6C6E] font-black uppercase tracking-widest truncate">{nSub(n)}</p>
                              </div>
                              {isWinner && <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-amber-300 shrink-0"><Crown className="w-3.5 h-3.5" /> Ganador</span>}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Mini-podio (tu voto) */}
                    {votable && showPodium && (
                      <div className="flex items-stretch gap-2">
                        {[0, 1, 2].map((slot) => {
                          const id = picks[slot]
                          const n = id ? nominees.find((x) => x.id === id) : null
                          const m = MEDAL[slot]
                          return (
                            <button
                              key={slot}
                              disabled={!n || !selected.is_open}
                              onClick={() => n && removePick(key, n.id)}
                              className="flex-1 rounded-2xl border p-2 flex flex-col items-center gap-1 transition-all"
                              style={{ borderColor: n ? `${m.color}55` : 'rgba(255,255,255,0.06)', background: n ? `${m.color}12` : 'rgba(255,255,255,0.02)' }}
                            >
                              <div className="relative">
                                <div className="w-12 h-12 rounded-full bg-[#0A0A0A] flex items-center justify-center overflow-hidden" style={{ border: `2px solid ${n ? m.color : '#2a2a2a'}` }}>
                                  {n ? (nImage(n) ? <img src={nImage(n)!} alt="" className={n.type === 'player' ? 'w-full h-full object-cover' : 'w-full h-full object-contain p-1'} /> : <UserIcon className="w-5 h-5 text-[#6A6C6E]" />) : <span className="text-sm font-black" style={{ color: m.color }}>{m.label}</span>}
                                </div>
                                {n && <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-[#0A0A0A]" style={{ background: m.color }}>{slot + 1}</span>}
                              </div>
                              <span className="text-[8px] font-bold text-white truncate max-w-full leading-tight">{n ? nName(n) : '—'}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* Cuadrícula de nominados (póster) */}
                    <div className="grid grid-cols-2 gap-3">
                      {nominees.map((n, idx) => {
                        const rank = picks.indexOf(n.id)
                        const chosen = rank >= 0
                        const self = isSelf(n)
                        const img = nImage(n)
                        return (
                          <motion.button
                            key={n.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                            disabled={!votable || !selected.is_open || self}
                            onClick={() => votable && togglePick(key, n)}
                            className="relative rounded-[18px] overflow-hidden border text-left flex flex-col transition-all"
                            style={{
                              borderColor: chosen ? MEDAL[rank].color : 'rgba(255,255,255,0.06)',
                              boxShadow: chosen ? `0 0 18px ${MEDAL[rank].color}40` : 'none',
                              opacity: self ? 0.45 : 1,
                            }}
                          >
                            <div className="relative aspect-[4/5] w-full bg-gradient-to-b from-[#1a1a1a] to-[#0A0A0A] flex items-center justify-center">
                              {img ? (
                                <img src={img} alt="" className={n.type === 'player' ? 'w-full h-full object-cover' : 'w-3/4 h-3/4 object-contain'} />
                              ) : n.type === 'player' ? (
                                <UserIcon className="w-12 h-12 text-[#2a2a2a]" />
                              ) : (
                                <Shield className="w-12 h-12 text-[#2a2a2a]" />
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-transparent to-transparent" />
                              <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-widest" style={{ color: accent, background: '#0A0A0Acc' }}>{nSub(n).split(' · ')[0] || n.type}</div>
                              {chosen && (
                                <span className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-[#0A0A0A] shadow-lg" style={{ background: MEDAL[rank].color }}>{rank + 1}</span>
                              )}
                              {self && (
                                <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#0A0A0A]/80 border border-white/10 flex items-center justify-center"><Lock className="w-3 h-3 text-[#6A6C6E]" /></span>
                              )}
                            </div>
                            <div className="p-2.5 space-y-1.5">
                              <div>
                                <p className="text-[12px] font-black text-white truncate leading-tight">{nName(n)}</p>
                                <p className="text-[7.5px] text-[#6A6C6E] font-black uppercase tracking-widest truncate">{n.type === 'player' ? (n.club?.name ?? '') : nSub(n)}{self ? ' · tú' : ''}</p>
                              </div>
                              <StatChips n={n} />
                            </div>
                          </motion.button>
                        )
                      })}
                    </div>
                  </>
                )}
              </motion.div>
            )
          })()
        ) : null}
      </div>
    </div>
  )
}
