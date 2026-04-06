'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Shield, Users, LogOut, Loader2, AlertCircle, Wallet,
  ChevronDown, ChevronUp, Trophy, Calendar, Swords, LayoutList,
  Clock, Goal, HandHelping, Star, Play, Check, BarChart3,
  Hourglass, TrendingUp, Flame, Award
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getNextMatchForClub, checkAndAutoResolveExpired } from '@/lib/match-engine'
import type { NextMatchResult } from '@/lib/match-engine'
import { PifaLogo } from '@/components/pifa/logo'
import { DtNavigation } from '@/components/pifa/dt-navigation'
import type { DtTab } from '@/components/pifa/dt-navigation'
import { CountdownTimer } from '@/components/pifa/countdown-timer'
import { StandingsTable } from '@/components/pifa/standings-table'
import { Button } from '@/components/ui/button'
import type { User, Club, Player, AuthSession, Competition, Match, Standing, PlayerCompetitionStats, MatchAnnotation } from '@/lib/types'

const positionColors: Record<string, string> = {
  GK: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  CB: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  LB: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  RB: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  CDM: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  CM: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  CAM: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  LM: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  RM: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  LW: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  RW: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  ST: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  CF: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
}

const positionGroups = [
  { label: 'Porteros', positions: ['GK'], color: 'text-amber-400' },
  { label: 'Defensas', positions: ['CB', 'LB', 'RB'], color: 'text-blue-400' },
  { label: 'Mediocampistas', positions: ['CDM', 'CM', 'CAM', 'LM', 'RM'], color: 'text-emerald-400' },
  { label: 'Delanteros', positions: ['LW', 'RW', 'ST', 'CF'], color: 'text-rose-400' },
]

interface MatchWithDetails extends Match {
  home_club: Club
  away_club: Club
  competition: Competition
}

interface CompetitionFull extends Competition {
  standings: (Standing & { club?: Club })[]
  playerStats: (PlayerCompetitionStats & { player?: Player })[]
  myPosition?: number
  myPoints?: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [club, setClub] = useState<Club | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [competitions, setCompetitions] = useState<CompetitionFull[]>([])
  const [upcomingMatches, setUpcomingMatches] = useState<MatchWithDetails[]>([])
  const [matchResult, setMatchResult] = useState<NextMatchResult>({ match: null, waiting: false, waiting_until: null })
  const [activeTab, setActiveTab] = useState<DtTab>('home')
  const [filterCompetition, setFilterCompetition] = useState<string>('all')
  const [expandedCompetitions, setExpandedCompetitions] = useState<Set<string>>(new Set())
  const [statsFilter, setStatsFilter] = useState<string>('all')

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      const stored = localStorage.getItem('pifa_auth_session')
      if (!stored) {
        router.replace('/login')
        return
      }

      try {
        const session: AuthSession = JSON.parse(stored)

        if (!session.user || session.user.role !== 'user') {
          router.replace('/login')
          return
        }

        setUser(session.user)

        if (session.user.club_id) {
          const clubId = session.user.club_id

          // Load club
          const { data: clubData } = await supabase
            .from('clubs')
            .select('*')
            .eq('id', clubId)
            .single()

          if (clubData) {
            setClub(clubData)

            // Load players
            const { data: playersData } = await supabase
              .from('players')
              .select('*')
              .eq('club_id', clubData.id)
              .order('position', { ascending: true })
              .order('number', { ascending: true })

            if (playersData) {
              setPlayers(playersData)
            }

            // Load competitions where club is enrolled (from active seasons only)
            const { data: enrolledComps } = await supabase
              .from('competition_clubs')
              .select(`
                competition:competitions!inner(
                  *,
                  season:seasons!inner(*)
                )
              `)
              .eq('club_id', clubId)

            if (enrolledComps) {
              const activeComps: CompetitionFull[] = []

              for (const ec of enrolledComps) {
                const comp = ec.competition as Competition & { season: { status: string } }
                if (comp.season?.status === 'active') {
                  const { data: standingsData } = await supabase
                    .from('standings')
                    .select('*, club:clubs(*)')
                    .eq('competition_id', comp.id)
                    .order('points', { ascending: false })

                  const { data: statsData } = await supabase
                    .from('player_competition_stats')
                    .select('*, player:players(*)')
                    .eq('competition_id', comp.id)

                  const sortedStandings = [...(standingsData || [])].sort((a, b) => {
                    if (b.points !== a.points) return b.points - a.points
                    if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference
                    return b.goals_for - a.goals_for
                  })

                  const myStandingIndex = sortedStandings.findIndex(s => s.club_id === clubId)
                  const myStanding = sortedStandings[myStandingIndex]

                  activeComps.push({
                    ...comp,
                    standings: standingsData || [],
                    playerStats: statsData || [],
                    myPosition: myStandingIndex >= 0 ? myStandingIndex + 1 : undefined,
                    myPoints: myStanding?.points,
                  })
                }
              }

              setCompetitions(activeComps)
              if (activeComps.length > 0) {
                setExpandedCompetitions(new Set([activeComps[0].id]))
              }
            }

            // Auto-resolve expired matches
            await checkAndAutoResolveExpired()

            // Load next playable match
            const result = await getNextMatchForClub(clubId)
            setMatchResult(result)

            // Load all matches for calendar
            const { data: matchesData } = await supabase
              .from('matches')
              .select(`
                *,
                home_club:clubs!matches_home_club_id_fkey(*),
                away_club:clubs!matches_away_club_id_fkey(*),
                competition:competitions!inner(
                  *,
                  season:seasons!inner(*)
                )
              `)
              .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
              .order('match_order', { ascending: true })

            if (matchesData) {
              const activeMatches = (matchesData as (MatchWithDetails & { competition: Competition & { season: { status: string } } })[])
                .filter(m => m.competition?.season?.status === 'active')
              setUpcomingMatches(activeMatches)
            }
          }
        }
      } catch {
        localStorage.removeItem('pifa_auth_session')
        router.replace('/login')
        return
      }

      setIsLoading(false)
    }

    checkAuthAndLoadData()
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('pifa_auth_session')
    toast.success('Sesión cerrada correctamente')
    router.replace('/login')
  }

  const formatBudget = (amount: number) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`
    return `$${amount}`
  }

  const toggleCompetition = (compId: string) => {
    setExpandedCompetitions(prev => {
      const next = new Set(prev)
      if (next.has(compId)) next.delete(compId)
      else next.add(compId)
      return next
    })
  }

  const filteredMatches = filterCompetition === 'all'
    ? upcomingMatches
    : upcomingMatches.filter(m => m.competition_id === filterCompetition)

  const getMatchResult = (match: Match) => {
    if (match.status !== 'finished' || match.home_score === null || match.away_score === null) return null
    const isHome = match.home_club_id === club?.id
    const myScore = isHome ? match.home_score : match.away_score
    const theirScore = isHome ? match.away_score : match.home_score
    if (myScore > theirScore) return 'W'
    if (myScore < theirScore) return 'L'
    return 'D'
  }

  // Computed stats
  const totalGoals = competitions.reduce((sum, c) =>
    sum + c.playerStats.filter(s => s.player?.club_id === club?.id).reduce((s, p) => s + p.goals, 0)
  , 0)
  const totalAssists = competitions.reduce((sum, c) =>
    sum + c.playerStats.filter(s => s.player?.club_id === club?.id).reduce((s, p) => s + p.assists, 0)
  , 0)
  const totalMvps = competitions.reduce((sum, c) =>
    sum + c.playerStats.filter(s => s.player?.club_id === club?.id).reduce((s, p) => s + p.mvp_count, 0)
  , 0)

  const recentResults = upcomingMatches.filter(m => m.status === 'finished').slice(-5).reverse()

  // Stats filtering
  const statsComps = statsFilter === 'all' ? competitions : competitions.filter(c => c.id === statsFilter)

  if (isLoading) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-background">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-pifa-gradient flex items-center justify-center animate-pulse-glow">
            <Flame className="w-8 h-8 text-white animate-float" />
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground animate-fade-in-up">Cargando tu club...</p>
      </div>
    )
  }

  if (!club) {
    return (
      <div className="min-h-dvh flex flex-col bg-background safe-area-top safe-area-bottom">
        <header className="flex items-center justify-between px-5 py-4">
          <PifaLogo size="sm" showText={false} />
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
            <LogOut className="w-5 h-5" />
          </Button>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-8 animate-fade-in-up">
          <div className="w-20 h-20 rounded-2xl bg-card border border-border flex items-center justify-center mb-6">
            <AlertCircle className="w-10 h-10 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2 text-center">Sin Club Asignado</h1>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Hola {user?.full_name}, aún no tienes un club asignado. Contacta con un administrador de PIFA.
          </p>
        </div>
      </div>
    )
  }

  const nextPlayableMatch = matchResult.match

  return (
    <div className="min-h-dvh flex flex-col bg-background safe-area-top">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <PifaLogo size="sm" showText={false} />
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Director Técnico</p>
            <p className="text-sm font-semibold text-foreground">{user?.full_name}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
          <LogOut className="w-5 h-5" />
        </Button>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="px-5 pb-4 space-y-5">

          {/* ======== TAB: HOME ======== */}
          {activeTab === 'home' && (
            <div className="space-y-5 animate-slide-in" key="tab-home">

              {/* MATCH CARD — next playable match */}
              {nextPlayableMatch && (
                <div className="animate-fade-in-up relative overflow-hidden rounded-2xl bg-gradient-to-br from-card via-card to-primary/5 border border-primary/20 pifa-shadow-lg">
                  {/* Decorative circles */}
                  <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-primary/5 animate-float" />
                  <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-primary/3 animate-float" style={{ animationDelay: '2s' }} />

                  {/* Countdown */}
                  {nextPlayableMatch.deadline && (
                    <div className="px-4 pt-4 relative">
                      <CountdownTimer deadline={nextPlayableMatch.deadline} size="lg" />
                    </div>
                  )}

                  <div className="p-4 space-y-3 relative">
                    <div className="flex items-center gap-2">
                      <Swords className="w-4 h-4 text-primary" />
                      <span className="text-xs font-bold text-primary uppercase tracking-widest">Siguiente Partido</span>
                      {nextPlayableMatch.my_annotation ? (
                        <span className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold animate-scale-in">
                          <Check className="w-3 h-3" />
                          Anotado
                        </span>
                      ) : nextPlayableMatch.opponent_annotation_exists ? (
                        <span className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-semibold animate-scale-in">
                          <AlertCircle className="w-3 h-3" />
                          Rival anotó
                        </span>
                      ) : null}
                    </div>

                    {/* Match Teams */}
                    <div className="flex items-center justify-between py-2">
                      <div className="flex-1 flex flex-col items-center text-center">
                        <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center overflow-hidden border border-border/50">
                          {(nextPlayableMatch.home_club as Club)?.shield_url ? (
                            <img src={(nextPlayableMatch.home_club as Club).shield_url!} alt="" className="w-11 h-11 object-contain" />
                          ) : (
                            <Shield className="w-7 h-7 text-muted-foreground" />
                          )}
                        </div>
                        <p className="text-xs font-semibold text-foreground mt-1.5 truncate max-w-[85px]">
                          {(nextPlayableMatch.home_club as Club)?.name}
                        </p>
                        {nextPlayableMatch.home_club_id === club.id && (
                          <span className="text-[10px] text-primary font-medium">Tu equipo</span>
                        )}
                      </div>
                      <div className="px-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
                          <span className="text-xs font-black text-primary">VS</span>
                        </div>
                      </div>
                      <div className="flex-1 flex flex-col items-center text-center">
                        <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center overflow-hidden border border-border/50">
                          {(nextPlayableMatch.away_club as Club)?.shield_url ? (
                            <img src={(nextPlayableMatch.away_club as Club).shield_url!} alt="" className="w-11 h-11 object-contain" />
                          ) : (
                            <Shield className="w-7 h-7 text-muted-foreground" />
                          )}
                        </div>
                        <p className="text-xs font-semibold text-foreground mt-1.5 truncate max-w-[85px]">
                          {(nextPlayableMatch.away_club as Club)?.name}
                        </p>
                        {nextPlayableMatch.away_club_id === club.id && (
                          <span className="text-[10px] text-primary font-medium">Tu equipo</span>
                        )}
                      </div>
                    </div>

                    <p className="text-[10px] text-muted-foreground text-center">
                      {(nextPlayableMatch.competition as Competition)?.name} — {nextPlayableMatch.round_name}
                    </p>

                    {/* Play Button */}
                    <Link
                      href={`/dashboard/match/${nextPlayableMatch.id}`}
                      className="flex items-center justify-center gap-2 w-full h-13 rounded-xl bg-pifa-gradient text-white font-bold text-sm touch-active transition-all duration-300 hover:opacity-90 animate-glow-btn"
                    >
                      <Play className="w-5 h-5" />
                      {nextPlayableMatch.my_annotation ? 'Ver / Editar Anotación' : 'Jugar Partido'}
                    </Link>
                  </div>
                </div>
              )}

              {/* WAITING STATE — matchday hasn't expired */}
              {matchResult.waiting && matchResult.waiting_until && (
                <div className="animate-fade-in-up relative overflow-hidden rounded-2xl bg-gradient-to-br from-card via-card to-blue-500/5 border border-blue-500/20 pifa-shadow-lg">
                  <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-blue-500/5 animate-float" />
                  <div className="p-5 space-y-4 relative">
                    <div className="flex items-center gap-2">
                      <Hourglass className="w-4 h-4 text-blue-400" />
                      <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Próxima Jornada</span>
                    </div>
                    <div className="text-center space-y-2">
                      <CountdownTimer deadline={matchResult.waiting_until} size="lg" />
                      <p className="text-xs text-muted-foreground mt-2">
                        Tu siguiente partido estará disponible cuando termine el plazo de la jornada actual.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* NO MATCHES */}
              {!nextPlayableMatch && !matchResult.waiting && competitions.length > 0 && (
                <div className="animate-fade-in-up bg-card rounded-2xl border border-border p-6 text-center pifa-shadow">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-3 animate-scale-in">
                    <Check className="w-7 h-7 text-emerald-400" />
                  </div>
                  <p className="font-semibold text-foreground">Sin partidos pendientes</p>
                  <p className="text-xs text-muted-foreground mt-1">Todos tus partidos están al día 🎉</p>
                </div>
              )}

              {/* Club Hero Card */}
              <div className="animate-fade-in-up relative overflow-hidden rounded-2xl bg-pifa-gradient p-5 pifa-shadow-lg" style={{ animationDelay: '60ms' }}>
                <div className="absolute top-0 right-0 w-36 h-36 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 animate-float" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/3 rounded-full translate-y-1/2 -translate-x-1/2" />
                <div className="relative flex items-center gap-4">
                  {club.shield_url ? (
                    <div className="w-16 h-16 rounded-xl bg-white/10 backdrop-blur-sm p-1.5 shrink-0 border border-white/10">
                      <img src={club.shield_url} alt={club.name} className="w-full h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center shrink-0 border border-white/10">
                      <Shield className="w-8 h-8 text-white/80" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-bold text-white truncate">{club.name}</h1>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-white/70 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {players.length}
                      </span>
                      <span className="text-xs text-white/70 flex items-center gap-1">
                        <Wallet className="w-3.5 h-3.5" />
                        {formatBudget(club.budget)}
                      </span>
                    </div>
                    {/* Position chips */}
                    {competitions.length > 0 && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {competitions.filter(c => c.myPosition).map(c => (
                          <span key={c.id} className="text-[9px] px-2 py-0.5 rounded-full bg-white/15 text-white/90 font-medium backdrop-blur-sm">
                            {c.myPosition}° · {c.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Stats Grid */}
              {competitions.length > 0 && (
                <div className="grid grid-cols-3 gap-2.5 animate-fade-in-up" style={{ animationDelay: '120ms' }}>
                  <div className="bg-card rounded-xl border border-border p-3 text-center pifa-shadow">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mx-auto mb-1.5">
                      <Goal className="w-4 h-4 text-emerald-400" />
                    </div>
                    <p className="text-xl font-bold text-foreground animate-count">{totalGoals}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Goles</p>
                  </div>
                  <div className="bg-card rounded-xl border border-border p-3 text-center pifa-shadow">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center mx-auto mb-1.5">
                      <HandHelping className="w-4 h-4 text-blue-400" />
                    </div>
                    <p className="text-xl font-bold text-foreground animate-count" style={{ animationDelay: '100ms' }}>{totalAssists}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Asistencias</p>
                  </div>
                  <div className="bg-card rounded-xl border border-border p-3 text-center pifa-shadow">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center mx-auto mb-1.5">
                      <Star className="w-4 h-4 text-amber-400" />
                    </div>
                    <p className="text-xl font-bold text-foreground animate-count" style={{ animationDelay: '200ms' }}>{totalMvps}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">MVPs</p>
                  </div>
                </div>
              )}

              {/* Recent Results */}
              {recentResults.length > 0 && (
                <div className="animate-fade-in-up" style={{ animationDelay: '180ms' }}>
                  <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Últimos Resultados
                  </h2>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
                    {recentResults.map((match) => {
                      const result = getMatchResult(match)
                      const isHome = match.home_club_id === club.id
                      const opponent = isHome ? match.away_club : match.home_club
                      return (
                        <div key={match.id} className={`flex-shrink-0 w-[120px] rounded-xl border p-2.5 ${
                          result === 'W' ? 'bg-emerald-500/5 border-emerald-500/20' :
                          result === 'L' ? 'bg-red-500/5 border-red-500/20' :
                          'bg-yellow-500/5 border-yellow-500/20'
                        }`}>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <div className="w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center overflow-hidden">
                              {opponent?.shield_url ? (
                                <img src={opponent.shield_url} alt="" className="w-5 h-5 object-contain" />
                              ) : (
                                <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                            </div>
                            <p className="text-[10px] font-medium text-foreground truncate flex-1">{opponent?.name}</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-foreground">{match.home_score}-{match.away_score}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              result === 'W' ? 'bg-emerald-500/20 text-emerald-400' :
                              result === 'L' ? 'bg-red-500/20 text-red-400' :
                              'bg-yellow-500/20 text-yellow-400'
                            }`}>
                              {result === 'W' ? 'V' : result === 'L' ? 'D' : 'E'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======== TAB: COMPETITIONS ======== */}
          {activeTab === 'competitions' && (
            <div className="space-y-4 animate-slide-in" key="tab-comp">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" />
                Competencias Activas
              </h2>

              {competitions.length === 0 ? (
                <div className="bg-card rounded-2xl border border-border p-10 text-center animate-fade-in-up">
                  <Trophy className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Sin competencias activas</p>
                </div>
              ) : (
                <div className="space-y-3 stagger">
                  {competitions.map((comp) => {
                    const isExpanded = expandedCompetitions.has(comp.id)
                    return (
                      <div key={comp.id} className="bg-card rounded-2xl border border-border overflow-hidden pifa-shadow">
                        <button
                          onClick={() => toggleCompetition(comp.id)}
                          className="w-full flex items-center gap-3 p-4 touch-active transition-colors hover:bg-muted/20"
                        >
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                            comp.type === 'league' ? 'bg-blue-500/15 text-blue-400' :
                            comp.type === 'cup' ? 'bg-pifa-gold/15 text-pifa-gold' :
                            'bg-purple-500/15 text-purple-400'
                          }`}>
                            {comp.type === 'league' ? <LayoutList className="w-5 h-5" /> :
                             comp.type === 'cup' ? <Trophy className="w-5 h-5" /> :
                             <Swords className="w-5 h-5" />}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className="font-semibold text-foreground truncate">{comp.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {comp.type === 'league' ? 'Liga' : comp.type === 'cup' ? 'Copa' : 'Grupos + K.O.'}
                              {comp.myPosition && ` · ${comp.myPosition}° lugar · ${comp.myPoints} pts`}
                            </p>
                          </div>
                          <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 animate-fade-in-up">
                            {(comp.type === 'league' || comp.type === 'groups_knockout') && comp.standings.length > 0 && (
                              <StandingsTable
                                standings={comp.standings}
                                highlightClubId={club.id}
                              />
                            )}
                            {comp.type === 'cup' && (
                              <div className="bg-muted/20 rounded-xl p-5 text-center border border-border/50">
                                <Trophy className="w-10 h-10 text-pifa-gold mx-auto mb-2 animate-float" />
                                <p className="text-sm text-foreground font-semibold">Eliminación directa</p>
                                <p className="text-xs text-muted-foreground mt-1">Consulta el calendario para ver tus partidos</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ======== TAB: STATS ======== */}
          {activeTab === 'stats' && (
            <div className="space-y-4 animate-slide-in" key="tab-stats">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Estadísticas de Jugadores
              </h2>

              {/* Filter pills */}
              {competitions.length > 1 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
                  <button
                    onClick={() => setStatsFilter('all')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-300 ${
                      statsFilter === 'all'
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    Todas
                  </button>
                  {competitions.map(comp => (
                    <button
                      key={comp.id}
                      onClick={() => setStatsFilter(comp.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-300 ${
                        statsFilter === comp.id
                          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {comp.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Stats sections */}
              {(() => {
                const allStats = statsComps.flatMap(c => c.playerStats)
                if (allStats.length === 0) {
                  return (
                    <div className="bg-card rounded-2xl border border-border p-10 text-center animate-fade-in-up">
                      <BarChart3 className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">Sin estadísticas aún</p>
                    </div>
                  )
                }

                // Aggregate stats by player
                const playerMap = new Map<string, { player: Player; goals: number; assists: number; mvps: number; played: number }>()
                for (const stat of allStats) {
                  if (!stat.player) continue
                  const existing = playerMap.get(stat.player_id) || {
                    player: stat.player,
                    goals: 0, assists: 0, mvps: 0, played: 0
                  }
                  existing.goals += stat.goals
                  existing.assists += stat.assists
                  existing.mvps += stat.mvp_count
                  existing.played += stat.matches_played
                  playerMap.set(stat.player_id, existing)
                }

                const topScorers = [...playerMap.values()].filter(p => p.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 10)
                const topAssists = [...playerMap.values()].filter(p => p.assists > 0).sort((a, b) => b.assists - a.assists).slice(0, 10)
                const topMvps = [...playerMap.values()].filter(p => p.mvps > 0).sort((a, b) => b.mvps - a.mvps).slice(0, 10)

                const medals = ['🥇', '🥈', '🥉']

                const renderRanking = (title: string, icon: React.ReactNode, list: typeof topScorers, valueKey: 'goals' | 'assists' | 'mvps', color: string) => (
                  <div className="bg-card rounded-2xl border border-border overflow-hidden pifa-shadow animate-fade-in-up">
                    <div className={`flex items-center gap-2 p-4 border-b border-border bg-gradient-to-r ${color}`}>
                      {icon}
                      <h3 className="text-sm font-bold text-foreground">{title}</h3>
                      <span className="ml-auto text-[10px] text-muted-foreground font-medium">{list.length} jugadores</span>
                    </div>
                    {list.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">Sin datos</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {list.map((entry, i) => {
                          const isMine = entry.player.club_id === club.id
                          return (
                            <div key={entry.player.id} className={`flex items-center gap-3 px-4 py-2.5 ${isMine ? 'bg-primary/5' : ''}`}>
                              <div className="w-6 text-center shrink-0">
                                {i < 3 ? (
                                  <span className="text-sm">{medals[i]}</span>
                                ) : (
                                  <span className="text-xs font-bold text-muted-foreground">{i + 1}</span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${isMine ? 'text-primary' : 'text-foreground'}`}>
                                  {entry.player.name}
                                </p>
                                <p className="text-[10px] text-muted-foreground">{entry.player.position} · {entry.played} PJ</p>
                              </div>
                              <span className={`text-base font-bold ${isMine ? 'text-primary' : 'text-foreground'}`}>
                                {entry[valueKey]}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )

                return (
                  <div className="space-y-4">
                    {renderRanking('Goleadores', <Goal className="w-4 h-4 text-emerald-400" />, topScorers, 'goals', 'from-emerald-500/5 to-transparent')}
                    {renderRanking('Asistencias', <HandHelping className="w-4 h-4 text-blue-400" />, topAssists, 'assists', 'from-blue-500/5 to-transparent')}
                    {renderRanking('MVPs', <Award className="w-4 h-4 text-amber-400" />, topMvps, 'mvps', 'from-amber-500/5 to-transparent')}
                  </div>
                )
              })()}
            </div>
          )}

          {/* ======== TAB: CALENDAR ======== */}
          {activeTab === 'calendar' && (
            <div className="space-y-4 animate-slide-in" key="tab-cal">
              {/* Competition filter */}
              {competitions.length > 1 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
                  <button
                    onClick={() => setFilterCompetition('all')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-300 ${
                      filterCompetition === 'all'
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    Todos
                  </button>
                  {competitions.map(comp => (
                    <button
                      key={comp.id}
                      onClick={() => setFilterCompetition(comp.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-300 ${
                        filterCompetition === comp.id
                          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {comp.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Calendario</h2>
                <span className="text-[10px] text-muted-foreground ml-auto font-medium">
                  {filteredMatches.length} partidos
                </span>
              </div>

              {filteredMatches.length === 0 ? (
                <div className="bg-card rounded-2xl border border-border p-10 text-center pifa-shadow animate-fade-in-up">
                  <Calendar className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Sin partidos programados</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[18px] top-4 bottom-4 w-[2px] bg-border/50 rounded-full" />

                  <div className="space-y-2 stagger">
                    {filteredMatches.map((match) => {
                      const isHome = match.home_club_id === club.id
                      const opponent = isHome ? match.away_club : match.home_club
                      const result = getMatchResult(match)
                      const isFinished = match.status === 'finished'

                      return (
                        <div key={match.id} className="flex gap-3 items-start">
                          {/* Timeline dot */}
                          <div className={`relative z-10 mt-3 w-[10px] h-[10px] rounded-full shrink-0 border-2 ${
                            isFinished
                              ? result === 'W' ? 'bg-emerald-400 border-emerald-400' :
                                result === 'L' ? 'bg-red-400 border-red-400' :
                                'bg-yellow-400 border-yellow-400'
                              : 'bg-background border-muted-foreground/40'
                          }`} style={{ marginLeft: '13px' }} />

                          {/* Match card */}
                          <div className={`flex-1 bg-card rounded-xl border p-3 pifa-shadow ${
                            isFinished
                              ? result === 'W' ? 'border-emerald-500/20' :
                                result === 'L' ? 'border-red-500/20' :
                                'border-yellow-500/20'
                              : 'border-border'
                          }`}>
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden shrink-0 border border-border/50">
                                {opponent?.shield_url ? (
                                  <img src={opponent.shield_url} alt="" className="w-7 h-7 object-contain" />
                                ) : (
                                  <Shield className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-muted-foreground font-medium">{isHome ? 'vs' : '@'}</span>
                                  <span className="font-semibold text-foreground text-sm truncate">{opponent?.name}</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {match.competition?.name} · {match.round_name}
                                </p>
                              </div>

                              {/* Result or status */}
                              {isFinished && result ? (
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-sm font-bold text-foreground">{match.home_score}-{match.away_score}</span>
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black ${
                                    result === 'W' ? 'bg-emerald-500/20 text-emerald-400' :
                                    result === 'L' ? 'bg-red-500/20 text-red-400' :
                                    'bg-yellow-500/20 text-yellow-400'
                                  }`}>
                                    {result === 'W' ? 'V' : result === 'L' ? 'D' : 'E'}
                                  </div>
                                </div>
                              ) : match.deadline ? (
                                <CountdownTimer deadline={match.deadline} size="sm" />
                              ) : (
                                <div className="w-7 h-7 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======== TAB: SQUAD ======== */}
          {activeTab === 'squad' && (
            <div className="space-y-5 animate-slide-in" key="tab-squad">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  Plantilla
                </h2>
                <span className="text-[10px] text-muted-foreground font-medium bg-muted/50 px-2.5 py-1 rounded-full">
                  {players.length} jugadores
                </span>
              </div>

              {players.length === 0 ? (
                <div className="bg-card rounded-2xl border border-border p-10 text-center pifa-shadow animate-fade-in-up">
                  <Users className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No hay jugadores</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {positionGroups.map((group) => {
                    const groupPlayers = players.filter(p => group.positions.includes(p.position))
                    if (groupPlayers.length === 0) return null

                    return (
                      <div key={group.label}>
                        <div className="flex items-center gap-2 mb-2.5">
                          <div className={`w-1 h-4 rounded-full ${group.color.replace('text-', 'bg-')}`} />
                          <h3 className={`text-xs font-bold uppercase tracking-widest ${group.color}`}>
                            {group.label}
                          </h3>
                          <span className="text-[10px] text-muted-foreground">({groupPlayers.length})</span>
                        </div>
                        <div className="space-y-2 stagger">
                          {groupPlayers.map((player) => {
                            // Get player stats across all competitions
                            const pStats = competitions.flatMap(c =>
                              c.playerStats.filter(s => s.player_id === player.id)
                            )
                            const pGoals = pStats.reduce((s, p) => s + p.goals, 0)
                            const pAssists = pStats.reduce((s, p) => s + p.assists, 0)
                            const pMvps = pStats.reduce((s, p) => s + p.mvp_count, 0)

                            return (
                              <div key={player.id} className="bg-card rounded-xl border border-border p-3 pifa-shadow">
                                <div className="flex items-center gap-3">
                                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/10">
                                    <span className="text-sm font-bold text-primary">{player.number || '-'}</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-foreground text-sm truncate">{player.name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold border ${positionColors[player.position] || 'bg-muted text-muted-foreground border-border'}`}>
                                        {player.position}
                                      </span>
                                      {player.nationality && (
                                        <span className="text-[10px] text-muted-foreground">{player.nationality}</span>
                                      )}
                                      {player.age && (
                                        <span className="text-[10px] text-muted-foreground">{player.age} años</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Mini stats */}
                                  {(pGoals > 0 || pAssists > 0 || pMvps > 0) && (
                                    <div className="flex items-center gap-2 shrink-0">
                                      {pGoals > 0 && (
                                        <div className="flex items-center gap-0.5 text-emerald-400">
                                          <Goal className="w-3 h-3" />
                                          <span className="text-[10px] font-bold">{pGoals}</span>
                                        </div>
                                      )}
                                      {pAssists > 0 && (
                                        <div className="flex items-center gap-0.5 text-blue-400">
                                          <HandHelping className="w-3 h-3" />
                                          <span className="text-[10px] font-bold">{pAssists}</span>
                                        </div>
                                      )}
                                      {pMvps > 0 && (
                                        <div className="flex items-center gap-0.5 text-amber-400">
                                          <Star className="w-3 h-3" />
                                          <span className="text-[10px] font-bold">{pMvps}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <DtNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hasMatch={!!nextPlayableMatch || matchResult.waiting}
      />
    </div>
  )
}
