'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronDown, Trophy, Crown, Shield, User, Goal, Star, Sparkles,
  Loader2, Award, HandHelping, Medal,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  resolveChampion, aggregateGlobalStats, topByMetric, countTitlesByClub, multiTitleLabel,
  type ChampionResult, type AggregatedPlayerStat,
} from '@/lib/season-awards'
import GalaAwards from '@/components/pifa/gala-awards'
import type { Season, Competition, Standing, Match, PlayerCompetitionStats, Player, Club } from '@/lib/types'

type StatRow = PlayerCompetitionStats & { player?: Player; club?: Club }

interface CompBlock {
  competition: Competition
  stats: StatRow[]
  standings: Standing[]
  champion: ChampionResult | null
  championRoster: StatRow[]
}

const COMP_TYPE_LABEL: Record<string, string> = {
  league: 'Liga',
  cup: 'Copa',
  groups_knockout: 'Grupos + K.O.',
}

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'competencias', label: 'Competencias' },
  { id: 'premios', label: 'Premios' },
  { id: 'global', label: 'Global' },
] as const
type TabId = (typeof TABS)[number]['id']

// ---------- Subcomponentes de presentación ----------

function ClubBadge({ club, size = 40 }: { club?: Club | null; size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center overflow-hidden shrink-0"
    >
      {club?.shield_url ? (
        <img src={club.shield_url} alt={club.name} className="w-full h-full object-contain p-1" />
      ) : (
        <Shield style={{ width: size * 0.45, height: size * 0.45 }} className="text-[#6A6C6E]" />
      )}
    </div>
  )
}

function PlayerAvatar({ player, size = 40 }: { player?: Player | null; size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-[#0A0A0A] border border-[#202020] flex items-center justify-center overflow-hidden shrink-0"
    >
      {player?.photo_url ? (
        <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
      ) : (
        <User style={{ width: size * 0.5, height: size * 0.5 }} className="text-[#6A6C6E]" />
      )}
    </div>
  )
}

interface RankRow { player_id: string; player?: Player; club?: Club; value: number }

function toRankRows(stats: { player_id: string; player?: Player; club?: Club }[], metric: 'goals' | 'assists' | 'mvp_count', limit: number): RankRow[] {
  return topByMetric(stats as any, metric, limit).map((s: any) => ({
    player_id: s.player_id, player: s.player, club: s.club, value: s[metric],
  }))
}

function RankingColumn({ label, icon, rows, accent }: { label: string; icon: React.ReactNode; rows: RankRow[]; accent: string }) {
  return (
    <div className="bg-[#141414]/50 rounded-[18px] border border-white/[0.04] p-4">
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: accent }}>{icon}</span>
        <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: accent }}>{label}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[9px] text-[#2D2D2D] font-black uppercase tracking-widest py-6 text-center">Sin registros</p>
      ) : (
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div key={r.player_id} className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white/[0.02] transition-colors">
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black shrink-0 ${
                  i === 0 ? 'bg-amber-400/20 text-amber-300'
                  : i === 1 ? 'bg-zinc-300/15 text-zinc-300'
                  : i === 2 ? 'bg-amber-700/20 text-amber-600'
                  : 'bg-white/[0.03] text-[#6A6C6E]'
                }`}
              >
                {i + 1}
              </div>
              <PlayerAvatar player={r.player} size={26} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-white truncate leading-tight">{r.player?.name ?? 'Jugador'}</p>
                <p className="text-[8px] text-[#6A6C6E] font-black uppercase tracking-widest truncate">{r.club?.name ?? r.player?.position ?? ''}</p>
              </div>
              <span className="text-sm font-black tabular-nums shrink-0" style={{ color: accent }}>{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AwardSpotlight({ label, sub, icon, accent, top, delay }: {
  label: string; sub: string; icon: React.ReactNode; accent: string; top?: RankRow; delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 220, damping: 20 }}
      className="relative bg-gradient-to-br from-[#141414] to-[#0A0A0A] rounded-[22px] border border-white/[0.06] p-5 overflow-hidden"
    >
      <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-[60px] pointer-events-none" style={{ background: `${accent}22` }} />
      <div className="flex items-center gap-2 mb-4 relative z-10">
        <span style={{ color: accent }}>{icon}</span>
        <span className="text-[9px] font-black uppercase tracking-[0.25em]" style={{ color: accent }}>{label}</span>
      </div>
      {top ? (
        <div className="flex items-center gap-3 relative z-10">
          <div className="relative">
            <PlayerAvatar player={top.player} size={56} />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#0A0A0A] border-2 flex items-center justify-center" style={{ borderColor: accent }}>
              <span className="text-[10px] font-black" style={{ color: accent }}>{top.value}</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-base font-black text-white truncate leading-tight">{top.player?.name ?? 'Jugador'}</p>
            <p className="text-[8px] text-[#6A6C6E] font-black uppercase tracking-widest truncate">{top.club?.name ?? ''}</p>
            <p className="text-[8px] font-black uppercase tracking-widest mt-0.5" style={{ color: accent }}>{sub}</p>
          </div>
        </div>
      ) : (
        <p className="text-[9px] text-[#2D2D2D] font-black uppercase tracking-widest py-4 relative z-10">Sin datos</p>
      )}
    </motion.div>
  )
}

function ChampionCard({ block, titles, index }: { block: CompBlock; titles: number; index: number }) {
  const label = multiTitleLabel(titles)
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.07 }}
      className="relative bg-gradient-to-br from-[#FF3131]/[0.07] to-transparent rounded-[22px] border border-[#FF3131]/15 p-5 overflow-hidden"
    >
      <div className="absolute -top-16 -right-16 w-40 h-40 bg-amber-400/10 rounded-full blur-[70px] pointer-events-none animate-medal-shine" />
      <div className="flex items-center justify-between mb-4 relative z-10">
        <span className="text-[8px] font-black uppercase tracking-[0.25em] text-[#6A6C6E]">
          {COMP_TYPE_LABEL[block.competition.type] ?? block.competition.type}
        </span>
        {label && (
          <span className="px-2 py-0.5 rounded-md bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[8px] font-black uppercase tracking-widest">
            {label}
          </span>
        )}
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest text-white/70 mb-3 relative z-10 truncate">{block.competition.name}</p>
      {block.champion ? (
        <div className="flex items-center gap-4 relative z-10">
          <div className="relative">
            <ClubBadge club={block.champion.club} size={64} />
            <Crown className="w-6 h-6 text-amber-300 absolute -top-3 left-1/2 -translate-x-1/2 drop-shadow-[0_0_6px_rgba(252,211,77,0.6)]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Trophy className="w-3 h-3 text-amber-300" />
              <span className="text-[8px] font-black uppercase tracking-[0.3em] text-amber-300">Campeón</span>
            </div>
            <p className="text-xl font-black text-white uppercase tracking-tight truncate leading-none">{block.champion.club?.name ?? 'Club'}</p>
          </div>
        </div>
      ) : (
        <p className="text-[9px] text-[#6A6C6E] font-black uppercase tracking-widest py-4 relative z-10">Campeón sin definir</p>
      )}
    </motion.div>
  )
}

function RosterGrid({ roster }: { roster: StatRow[] }) {
  const sorted = [...roster].sort((a, b) => b.goals - a.goals || b.assists - a.assists)
  const pichichiId = sorted.find((p) => p.goals > 0)?.player_id
  if (sorted.length === 0) {
    return <p className="text-[9px] text-[#2D2D2D] font-black uppercase tracking-widest py-4 text-center">Sin jugadores con minutos registrados</p>
  }
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
      {sorted.map((p) => {
        const isPichichi = p.player_id === pichichiId
        return (
          <div key={p.player_id} className={`flex items-center gap-2.5 p-2 rounded-xl border ${isPichichi ? 'bg-amber-400/[0.06] border-amber-400/20' : 'bg-white/[0.02] border-white/[0.04]'}`}>
            <PlayerAvatar player={p.player} size={34} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-white truncate leading-tight">
                {p.player?.number != null ? <span className="text-[#6A6C6E]">{p.player.number} · </span> : null}
                {p.player?.name ?? 'Jugador'}
              </p>
              <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest">
                <span className="text-[#6A6C6E]">{p.player?.position ?? ''}</span>
                {p.goals > 0 && <span className="text-amber-300">{p.goals}G</span>}
                {p.assists > 0 && <span className="text-sky-400">{p.assists}A</span>}
                {p.matches_played > 0 && <span className="text-[#6A6C6E]">{p.matches_played}PJ</span>}
              </div>
            </div>
            {isPichichi && <Goal className="w-3.5 h-3.5 text-amber-300 shrink-0" />}
          </div>
        )
      })}
    </div>
  )
}

function CompetitionSection({ block, titles, expanded, onToggle, index }: {
  block: CompBlock; titles: number; expanded: boolean; onToggle: () => void; index: number
}) {
  const label = multiTitleLabel(titles)
  const hasRoster = !!block.champion && block.championRoster.length > 0
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="bg-[#141414]/40 rounded-[22px] border border-white/[0.05] p-4 sm:p-5 space-y-4"
    >
      {/* Banner del campeón */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <ClubBadge club={block.champion?.club} size={44} />
            {block.champion && <Crown className="w-4 h-4 text-amber-300 absolute -top-2 left-1/2 -translate-x-1/2 drop-shadow-[0_0_5px_rgba(252,211,77,0.6)]" />}
          </div>
          <div className="min-w-0">
            <p className="text-[8px] font-black uppercase tracking-[0.25em] text-[#6A6C6E]">
              {COMP_TYPE_LABEL[block.competition.type] ?? block.competition.type}
            </p>
            <p className="text-sm font-black text-white uppercase tracking-tight truncate leading-tight">{block.competition.name}</p>
            {block.champion ? (
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-300 truncate">Campeón · {block.champion.club?.name ?? 'Club'}</p>
            ) : (
              <p className="text-[9px] font-black uppercase tracking-widest text-[#6A6C6E]">Campeón sin definir</p>
            )}
          </div>
        </div>
        {label && (
          <span className="shrink-0 px-2 py-0.5 rounded-md bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[8px] font-black uppercase tracking-widest">
            {label}
          </span>
        )}
      </div>

      {/* Rankings de la competencia */}
      <div className="grid gap-3 sm:grid-cols-3">
        <RankingColumn label="Goleadores" icon={<Goal className="w-3.5 h-3.5" />} accent="#fbbf24" rows={toRankRows(block.stats, 'goals', 15)} />
        <RankingColumn label="Asistencias" icon={<HandHelping className="w-3.5 h-3.5" />} accent="#38bdf8" rows={toRankRows(block.stats, 'assists', 15)} />
        <RankingColumn label="MVPs" icon={<Star className="w-3.5 h-3.5" />} accent="#FF3131" rows={toRankRows(block.stats, 'mvp_count', 15)} />
      </div>

      {/* Plantilla campeona (expandible) */}
      {hasRoster && (
        <div>
          <button
            onClick={onToggle}
            className="w-full flex items-center justify-between gap-2 px-3 h-9 rounded-xl bg-amber-400/[0.05] hover:bg-amber-400/10 border border-amber-400/15 transition-all"
          >
            <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-amber-300">
              <Crown className="w-3.5 h-3.5" />
              Plantilla campeona · {block.champion?.club?.name ?? ''}
            </span>
            <ChevronDown className={`w-4 h-4 text-amber-300 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div className="pt-3">
                  <RosterGrid roster={block.championRoster} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  )
}

// ---------- Página ----------

export default function GalaPage({ params }: { params: Promise<{ seasonId: string }> }) {
  const { seasonId } = use(params)
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [season, setSeason] = useState<Season | null>(null)
  const [blocks, setBlocks] = useState<CompBlock[]>([])
  const [globalStats, setGlobalStats] = useState<AggregatedPlayerStat[]>([])
  const [titlesByClub, setTitlesByClub] = useState<Map<string, number>>(new Map())
  const [clubMatchCounts, setClubMatchCounts] = useState<Record<string, number>>({})
  const [activeTab, setActiveTab] = useState<TabId>('resumen')
  const [expandedRosters, setExpandedRosters] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const { data: seasonData } = await supabase.from('seasons').select('*').eq('id', seasonId).single()
        if (!seasonData) { setError('Temporada no encontrada'); setIsLoading(false); return }
        setSeason(seasonData as Season)

        const { data: compsData } = await supabase
          .from('competitions').select('*').eq('season_id', seasonId).order('created_at', { ascending: true })
        const comps = (compsData ?? []) as Competition[]
        if (comps.length === 0) { setBlocks([]); setIsLoading(false); return }
        const compIds = comps.map((c) => c.id)

        const [standingsRes, statsRes, finalsRes] = await Promise.all([
          supabase.from('standings').select('*, club:clubs(id, name, shield_url)').in('competition_id', compIds),
          supabase.from('player_competition_stats')
            .select('id, competition_id, player_id, club_id, goals, assists, mvp_count, matches_played, player:players(id, name, position, photo_url, number), club:clubs(id, name, shield_url)')
            .in('competition_id', compIds),
          supabase.from('matches')
            .select('*, home_club:clubs!matches_home_club_id_fkey(id, name, shield_url), away_club:clubs!matches_away_club_id_fkey(id, name, shield_url)')
            .in('competition_id', compIds).eq('status', 'finished'),
        ])

        const allStandings = (standingsRes.data ?? []) as Standing[]
        const allStats = (statsRes.data ?? []) as StatRow[]
        const allMatches = (finalsRes.data ?? []) as Match[]

        const builtBlocks: CompBlock[] = comps.map((competition) => {
          const cStandings = allStandings.filter((s) => s.competition_id === competition.id)
          const cStats = allStats.filter((s) => s.competition_id === competition.id)
          const cMatches = allMatches.filter((m) => m.competition_id === competition.id)
          const champion = resolveChampion(competition, cStandings, cMatches)
          const championRoster = champion
            ? cStats.filter((s) => s.club_id === champion.clubId)
            : []
          return { competition, stats: cStats, standings: cStandings, champion, championRoster }
        })

        // Partidos finalizados por club (para el mínimo de elegibilidad de premios)
        const matchCounts: Record<string, number> = {}
        for (const m of allMatches) {
          if (m.home_club_id) matchCounts[m.home_club_id] = (matchCounts[m.home_club_id] ?? 0) + 1
          if (m.away_club_id) matchCounts[m.away_club_id] = (matchCounts[m.away_club_id] ?? 0) + 1
        }

        setBlocks(builtBlocks)
        setClubMatchCounts(matchCounts)
        setTitlesByClub(countTitlesByClub(builtBlocks.map((b) => b.champion)))
        setGlobalStats(aggregateGlobalStats(allStats))
      } catch (err: any) {
        setError(err?.message || 'Error al cargar la gala')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [seasonId])

  const toggleRoster = (id: string) =>
    setExpandedRosters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const showTabs = !isLoading && !error && blocks.length > 0

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-[#0A0A0A]/90 backdrop-blur-2xl border-b border-white/[0.04]">
        <div className="flex items-center gap-3 px-6 py-3.5">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-xl bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white transition-all active:scale-95"
          >
            <ChevronLeft className="w-4.5 h-4.5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-black text-white uppercase tracking-tight truncate">
              GALA DE <span className="text-[#FF3131]">PREMIOS</span>
            </h1>
            <p className="text-[7px] text-[#2D2D2D] font-black uppercase tracking-[0.3em] truncate">
              {season?.name ?? '—'}
            </p>
          </div>
        </div>
        {showTabs && (
          <div className="flex gap-2 px-6 pb-2.5">
            {TABS.map((t) => {
              const active = activeTab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className="relative px-4 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95"
                >
                  {active && (
                    <motion.div
                      layoutId="galaActiveTab"
                      className="absolute inset-0 bg-[#FF3131]/10 border border-[#FF3131]/20 rounded-lg"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className={`relative z-10 text-[9px] font-black uppercase tracking-[0.2em] ${active ? 'text-[#FF3131]' : 'text-[#6A6C6E] hover:text-white'}`}>
                    {t.label}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </header>

      {isLoading ? (
        <div className="flex justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-[#FF3131]" /></div>
      ) : error ? (
        <div className="text-center py-32 px-10">
          <Trophy className="w-14 h-14 text-[#2D2D2D] mx-auto mb-5" />
          <p className="text-[#6A6C6E] font-black uppercase tracking-[0.2em] text-xs">{error}</p>
        </div>
      ) : blocks.length === 0 ? (
        <div className="px-6 py-16">
          <div className="text-center py-16 bg-[#141414]/30 rounded-[28px] border border-dashed border-white/[0.06]">
            <p className="text-[#6A6C6E] font-black uppercase tracking-[0.2em] text-xs">Sin competencias en esta temporada</p>
          </div>
        </div>
      ) : (
        <div className="px-6 py-6 pb-32">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {/* ---------- RESUMEN ---------- */}
              {activeTab === 'resumen' && (
                <div className="space-y-9">
                  <div className="relative text-center py-7 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-[#FF3131]/[0.05] to-transparent rounded-[28px] pointer-events-none" />
                    <Sparkles className="w-7 h-7 text-amber-300 mx-auto mb-3 animate-medal-shine" />
                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-none relative z-10">PALMARÉS</h2>
                    <p className="text-[10px] text-[#FF3131] font-black uppercase tracking-[0.35em] mt-2 relative z-10">{season?.name}</p>
                    {season?.archived_at && (
                      <p className="text-[7px] text-[#2D2D2D] font-black uppercase tracking-[0.3em] mt-1.5 relative z-10">
                        Archivada el {new Date(season.archived_at).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                    )}
                  </div>

                  <section>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#6A6C6E] mb-4 flex items-center gap-2">
                      <Award className="w-3.5 h-3.5 text-amber-300" /> Premios Individuales
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <AwardSpotlight label="Bota de Oro" sub="Máximo goleador" icon={<Goal className="w-4 h-4" />} accent="#fbbf24" top={toRankRows(globalStats, 'goals', 1)[0]} delay={0.05} />
                      <AwardSpotlight label="Rey de Asistencias" sub="Más asistencias" icon={<HandHelping className="w-4 h-4" />} accent="#38bdf8" top={toRankRows(globalStats, 'assists', 1)[0]} delay={0.12} />
                      <AwardSpotlight label="MVP de la Temporada" sub="Más MVPs" icon={<Star className="w-4 h-4" />} accent="#FF3131" top={toRankRows(globalStats, 'mvp_count', 1)[0]} delay={0.19} />
                    </div>
                  </section>

                  <section>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#6A6C6E] mb-4 flex items-center gap-2">
                      <Trophy className="w-3.5 h-3.5 text-amber-300" /> Campeones
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {blocks.map((b, i) => (
                        <ChampionCard key={b.competition.id} block={b} titles={b.champion ? (titlesByClub.get(b.champion.clubId) ?? 1) : 0} index={i} />
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {/* ---------- COMPETENCIAS ---------- */}
              {activeTab === 'competencias' && (
                <div className="space-y-4">
                  {blocks.map((b, i) => (
                    <CompetitionSection
                      key={b.competition.id}
                      block={b}
                      index={i}
                      titles={b.champion ? (titlesByClub.get(b.champion.clubId) ?? 1) : 0}
                      expanded={expandedRosters.has(b.competition.id)}
                      onToggle={() => toggleRoster(b.competition.id)}
                    />
                  ))}
                </div>
              )}

              {/* ---------- PREMIOS ---------- */}
              {activeTab === 'premios' && season && (
                <GalaAwards season={season} blocks={blocks} clubMatchCounts={clubMatchCounts} />
              )}

              {/* ---------- GLOBAL ---------- */}
              {activeTab === 'global' && (
                <section>
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#6A6C6E] mb-4 flex items-center gap-2">
                    <Medal className="w-3.5 h-3.5 text-amber-300" /> Rankings Globales · Top 15
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <RankingColumn label="Goleadores" icon={<Goal className="w-3.5 h-3.5" />} accent="#fbbf24" rows={toRankRows(globalStats, 'goals', 15)} />
                    <RankingColumn label="Asistencias" icon={<HandHelping className="w-3.5 h-3.5" />} accent="#38bdf8" rows={toRankRows(globalStats, 'assists', 15)} />
                    <RankingColumn label="MVPs" icon={<Star className="w-3.5 h-3.5" />} accent="#FF3131" rows={toRankRows(globalStats, 'mvp_count', 15)} />
                  </div>
                </section>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
