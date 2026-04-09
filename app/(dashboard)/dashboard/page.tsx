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
import { PlayerRadar } from '@/components/pifa/player-radar-chart'
import { UltimateCard } from '@/components/pifa/ultimate-card'
import { PitchLineup, LineupData } from '@/components/pifa/pitch-lineup'
import { NotificationsDrawer } from '@/components/pifa/notifications-drawer'
import { Bell, LayoutGrid } from 'lucide-react'
import { MatchDetailsDrawer } from '@/components/pifa/match-details-drawer'
import { PlayerManagementDialog } from '@/components/pifa/player-management-dialog'
import MarketPage from './market/page'
import type { User, Club, Player, AuthSession, Competition, Match, Standing, PlayerCompetitionStats, MatchAnnotation, Season, Notification } from '@/lib/types'

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
  season?: Season
  standings: (Standing & { club?: Club })[]
  playerStats: (PlayerCompetitionStats & { player?: Player })[]
  matches: MatchWithDetails[]
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
  const [allTimeComps, setAllTimeComps] = useState<CompetitionFull[]>([])
  const [allTimeMatches, setAllTimeMatches] = useState<MatchWithDetails[]>([])
  const [squadTab, setSquadTab] = useState<'lista' | 'alineacion'>('lista')
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [hasNewNotifications, setHasNewNotifications] = useState(false)
  const [selectedManagePlayer, setSelectedManagePlayer] = useState<Player | null>(null)
  const [compSubTabs, setCompSubTabs] = useState<Record<string, 'standings' | 'calendar'>>({})
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [isMatchDetailsOpen, setIsMatchDetailsOpen] = useState(false)
  const [selectedRounds, setSelectedRounds] = useState<Record<string, string>>({})
  const [calendarPage, setCalendarPage] = useState(0)

  const refreshData = async () => {
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
          setClub(clubData as Club)

          // Load players
          const { data: playersData } = await supabase
            .from('players')
            .select('*')
            .eq('club_id', clubId)
            .order('position', { ascending: true })
            .order('number', { ascending: true })

          if (playersData) {
            setPlayers(playersData as Player[])
          }

          // Load competitions
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
            const allTimeComps: CompetitionFull[] = []

            for (const ec of enrolledComps as any[]) {
              const comp = ec.competition
              
              const { data: standingsData } = await supabase
                .from('standings')
                .select('*, club:clubs(*)')
                .eq('competition_id', comp.id)
                .order('points', { ascending: false })

              const { data: statsData } = await supabase
                .from('player_competition_stats')
                .select('*, player:players(*)')
                .eq('competition_id', comp.id)

              const { data: matchesData } = await supabase
                .from('matches')
                .select(`
                  *,
                  home_club:clubs!matches_home_club_id_fkey(*),
                  away_club:clubs!matches_away_club_id_fkey(*)
                `)
                .eq('competition_id', comp.id)
                .order('match_order', { ascending: true })

              const sortedStandings = [...(standingsData || [])].sort((a: any, b: any) => {
                if (b.points !== a.points) return b.points - a.points
                if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference
                return b.goals_for - a.goals_for
              })

              const myStandingIndex = sortedStandings.findIndex((s: any) => s.club_id === clubId)
              const myStanding = sortedStandings[myStandingIndex]

              const compFull: CompetitionFull = {
                ...comp,
                standings: standingsData || [],
                playerStats: statsData || [],
                matches: (matchesData as any) || [],
                myPosition: myStandingIndex >= 0 ? myStandingIndex + 1 : undefined,
                myPoints: (myStanding as any)?.points,
              }

              if (comp.season?.status === 'active') {
                activeComps.push(compFull)
              }
              allTimeComps.push(compFull)
            }

            setCompetitions(activeComps)
            setAllTimeComps(allTimeComps)
            
            if (activeComps.length > 0) {
              setExpandedCompetitions(new Set([activeComps[0].id]))
            }
          }

          // Auto-resolve expired matches
          await checkAndAutoResolveExpired()

          // Load next playable match
          const result = await getNextMatchForClub(clubId)
          setMatchResult(result)

          // Load all matches
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
            const allMatches = matchesData as MatchWithDetails[]
            setAllTimeMatches(allMatches)

            const activeMatches = (matchesData as (MatchWithDetails & { competition: Competition & { season: { status: string } } })[])
              .filter(m => m.competition?.season?.status === 'active')
            setUpcomingMatches(activeMatches)
          }

          // Check for unread notifications
          const { count: unreadCount } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('club_id', clubId)
            .eq('is_read', false)
          
          if (unreadCount && unreadCount > 0) {
            setHasNewNotifications(true)
          }
        }
      }
    } catch (e) {
      console.error('Error refreshing data:', e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refreshData()

    // Realtime subscriptions
    const sessionStr = localStorage.getItem('pifa_auth_session')
    if (sessionStr) {
      const session = JSON.parse(sessionStr)
      if (session.user?.club_id) {
        const clubId = session.user.club_id

        // 1. Notifications & Transfer completion Realtime
        const notifChannel = supabase
          .channel('dt_notifs')
          .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'notifications', 
            filter: `club_id=eq.${clubId}` 
          }, (payload) => {
            setHasNewNotifications(true)
            if (payload.new && (payload.new as any).type === 'transfer_complete') {
              refreshData()
            }
          })
          .subscribe()

        // 2. Matches & Standings Realtime (Instant update when results are posted)
        const matchChannel = supabase
          .channel('match_updates')
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'matches'
          }, () => {
             // We refresh for any change in matches (score update, status change, deadline resolution)
             refreshData()
          })
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'standings'
          }, () => {
             refreshData()
          })
          .subscribe()

        // 3. Backup Polling (Every 5 minutes for long idle sessions)
        const polling = setInterval(refreshData, 5 * 60 * 1000)
        
        return () => { 
          supabase.removeChannel(notifChannel)
          supabase.removeChannel(matchChannel)
          clearInterval(polling)
        }
      }
    }
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

  const handleSaveLineup = async (lineupData: LineupData) => {
    if (!club) return
    const { error } = await supabase
      .from('clubs')
      .update({ default_lineup: lineupData } as any)
      .eq('id', club.id)

    if (error) {
      toast.error('Error al guardar la alineación')
      throw error
    }

    setClub({ ...club, default_lineup: lineupData })
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

  // Computed stats from real matches data
  const finishedMatches = allTimeMatches.filter(m => m.status === 'finished' && m.home_score !== null && m.away_score !== null)
  
  let clubWins = 0
  let clubLosses = 0
  let clubDraws = 0
  let clubGoalsFor = 0
  let clubGoalsAgainst = 0

  finishedMatches.forEach(m => {
    const isHome = m.home_club_id === club?.id
    const gf = isHome ? m.home_score! : m.away_score!
    const gc = isHome ? m.away_score! : m.home_score!
    
    clubGoalsFor += gf
    clubGoalsAgainst += gc
    
    if (gf > gc) clubWins++
    else if (gf < gc) clubLosses++
    else clubDraws++
  })

  const totalMatches = finishedMatches.length
  // Win rate percentage
  const winRate = totalMatches > 0 ? Math.round((clubWins / totalMatches) * 100) : 0

  const recentResults = upcomingMatches.filter(m => m.status === 'finished').slice(-5).reverse()

  // Stats filtering
  const statsComps = statsFilter === 'all' ? competitions : competitions.filter(c => c.id === statsFilter)

  if (isLoading) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-loading-gradient animate-fade-in">
        <div className="relative">
          <PifaLogo size="xl" showText={false} className="animate-logo-pulse" />
        </div>
        <div className="mt-10 flex flex-col items-center space-y-2">
          <p className="text-[10px] font-black text-[#00FF85] uppercase tracking-[0.4em] animate-pulse">
            Sincronizando Club
          </p>
          <div className="w-32 h-1 bg-[#141414] rounded-full overflow-hidden border border-white/5">
            <div className="h-full bg-gradient-to-r from-[#FF3131] to-[#00FF85] animate-progress" style={{ width: '100%' }} />
          </div>
        </div>
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
    <div className="min-h-dvh flex flex-col bg-[#0A0A0A] safe-area-top font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 shrink-0 bg-[#0A0A0A] border-b border-[#141414]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[#141414] flex items-center justify-center">
             <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-[10px] text-[#00FF85] uppercase font-bold tracking-widest">
               {competitions[0]?.season?.name || 'Pretemporada'}
            </p>
            <p className="text-sm font-semibold text-white">
               {competitions[0]?.name || 'PIFA Global'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              setIsNotificationsOpen(true)
              setHasNewNotifications(false)
            }}
            className="relative p-2 text-[#6A6C6E] hover:text-[#00FF85] transition-colors"
          >
            <Bell className="w-5 h-5" />
            {hasNewNotifications && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-[#00FF85] rounded-full border-2 border-[#0A0A0A]" />
            )}
          </button>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-[#6A6C6E] hover:text-[#00FF85] hover:bg-[#141414]">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto pb-32">
        <div className="px-4 py-5 space-y-6">

          {/* ======== TAB: HOME ======== */}
          {activeTab === 'home' && (
            <div className="space-y-4" key="tab-home">

              {/* Bento Grid: Club Profile */}
              <div className="rounded-2xl bg-[#141414] border border-[#202020] p-4 flex flex-col justify-center items-center gap-3 text-center shadow-2xl relative overflow-hidden group">
                {/* Decorative background element */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#00FF85]/5 rounded-full blur-3xl group-hover:bg-[#00FF85]/10 transition-colors duration-700" />
                
                <div className="w-14 h-14 shrink-0 rounded-2xl border border-[#202020] bg-[#0A0A0A] flex items-center justify-center p-2 shadow-2xl relative z-10 transition-transform duration-500 group-hover:scale-105">
                  {club.shield_url ? (
                    <img src={club.shield_url} alt={club.name} className="w-full h-full object-contain drop-shadow-[0_0_8px_rgba(0,255,133,0.3)]" />
                  ) : (
                    <Shield className="w-8 h-8 text-[#6A6C6E]" />
                  )}
                </div>
                
                <div className="space-y-1 relative z-10">
                  <h1 className="text-xl font-black text-white uppercase tracking-tighter leading-none">{club.name}</h1>
                  <div className="flex items-center justify-center gap-1">
                    <span className="h-px w-3 bg-[#202020]" />
                    <p className="text-[9px] text-[#00FF85] uppercase font-black tracking-[0.2em]">
                      DIRECTOR TÉCNICO
                    </p>
                    <span className="h-px w-3 bg-[#202020]" />
                  </div>
                  <p className="text-base font-bold text-white/90">{user?.full_name}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-2 w-full max-w-[280px] mt-1 relative z-10">
                  <div className="flex flex-col items-center justify-center p-2 rounded-lg border border-[#202020] bg-[#0A0A0A]/50 backdrop-blur-sm transition-colors hover:bg-[#0A0A0A]">
                    <span className="text-[8px] text-[#6A6C6E] font-bold uppercase tracking-[0.15em] mb-1">Plantilla</span>
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-white/40"/>
                      <span className="text-sm font-black text-white">{players.length}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center justify-center p-2 rounded-lg border border-[#202020] bg-[#0A0A0A]/50 backdrop-blur-sm transition-colors hover:bg-[#0A0A0A]">
                    <span className="text-[8px] text-[#6A6C6E] font-bold uppercase tracking-[0.15em] mb-1">Fondos</span>
                    <div className="flex items-center gap-1">
                      <Wallet className="w-3 h-3 text-[#00FF85]/60"/>
                      <span className="text-sm font-black text-[#00FF85]">{formatBudget(club.budget)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* MATCH CARD — next playable match */}
              {nextPlayableMatch && (
                <div className="rounded-xl bg-[#141414] border border-[#202020] overflow-hidden flex flex-col animate-fade-in-up">
                  {/* Top Bar Label */}
                  <div className="bg-[#00FF85] px-4 py-2 flex items-center justify-between">
                    <span className="text-[10px] font-black text-[#0A0A0A] uppercase tracking-[0.2em] flex items-center gap-1.5">
                       PRÓXIMO PARTIDO
                    </span>
                    {nextPlayableMatch.my_annotation ? (
                      <span className="flex items-center gap-1 text-[#0A0A0A] text-[9px] font-black uppercase tracking-wider">
                        <Check className="w-3 h-3 stroke-[3]" /> Anotado
                      </span>
                    ) : nextPlayableMatch.opponent_annotation_exists ? (
                       <span className="flex items-center gap-1 text-[#0A0A0A] text-[9px] font-black uppercase tracking-wider">
                        <AlertCircle className="w-3 h-3 stroke-[3]" /> Rival
                      </span>
                    ) : null}
                  </div>

                  <div className="p-3 relative">
                    <div className="flex items-center justify-between">
                      {/* Local */}
                      <div className="flex flex-col items-center flex-1">
                        <div className="w-12 h-12 rounded bg-[#0A0A0A] border border-[#2D2D2D] mb-1.5 flex items-center justify-center p-2">
                          {(nextPlayableMatch.home_club as Club)?.shield_url ? (
                            <img src={(nextPlayableMatch.home_club as Club).shield_url!} alt="" className="w-full h-full object-contain" />
                          ) : (
                            <Shield className="w-4 h-4 text-[#6A6C6E]" />
                          )}
                        </div>
                        <p className="text-[10px] font-bold text-white text-center leading-tight">{(nextPlayableMatch.home_club as Club)?.name}</p>
                        {nextPlayableMatch.home_club_id === club.id && <span className="text-[7px] text-[#00FF85] font-black uppercase mt-0.5">Local</span>}
                      </div>

                      {/* VS */}
                      <div className="flex flex-col items-center px-2">
                        <span className="text-lg font-black text-[#2D2D2D] italic">VS</span>
                      </div>

                      {/* Away */}
                      <div className="flex flex-col items-center flex-1">
                        <div className="w-12 h-12 rounded bg-[#0A0A0A] border border-[#2D2D2D] mb-1.5 flex items-center justify-center p-2">
                          {(nextPlayableMatch.away_club as Club)?.shield_url ? (
                            <img src={(nextPlayableMatch.away_club as Club).shield_url!} alt="" className="w-full h-full object-contain" />
                          ) : (
                            <Shield className="w-4 h-4 text-[#6A6C6E]" />
                          )}
                        </div>
                        <p className="text-[10px] font-bold text-white text-center leading-tight">{(nextPlayableMatch.away_club as Club)?.name}</p>
                        {nextPlayableMatch.away_club_id === club.id && <span className="text-[7px] text-[#00FF85] font-black uppercase mt-0.5">Visitante</span>}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-[#202020] flex flex-row items-center justify-between gap-4">
                      <div className="text-left">
                        <p className="text-[8px] text-[#6A6C6E] font-bold uppercase tracking-wider mb-0.5">
                          {(nextPlayableMatch.competition as Competition)?.name}
                        </p>
                        <p className="text-[11px] text-white font-black uppercase">
                           {nextPlayableMatch.round_name}
                        </p>
                      </div>

                      {nextPlayableMatch.deadline && (
                        <div className="text-right">
                          <p className="text-[8px] text-[#6A6C6E] font-bold uppercase tracking-wider mb-0.5">CIERRE</p>
                          <CountdownTimer 
                            deadline={nextPlayableMatch.deadline} 
                            size="sm" 
                            onExpired={refreshData}
                          />
                        </div>
                      )}
                    </div>

                    <Link
                      href={`/dashboard/match/${nextPlayableMatch.id}`}
                      className="mt-4 flex items-center justify-center gap-2 w-full h-9 bg-white text-[#0A0A0A] font-black uppercase tracking-widest text-[9px] rounded transition-colors hover:bg-[#00FF85] hover:text-[#0A0A0A]"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      {nextPlayableMatch.my_annotation ? 'Editar Datos' : 'Ir al Partido'}
                    </Link>
                  </div>
                </div>
              )}

              {/* Team DNA Radar */}
              <div className="rounded-2xl bg-[#141414] border border-[#202020] p-5 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                 <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-[0.2em] flex items-center gap-2">
                       <BarChart3 className="w-4 h-4 text-[#00FF85]" /> DNA DEL EQUIPO
                    </h3>
                 </div>
                 <div className="flex flex-col items-center gap-4">
                    <PlayerRadar 
                      size={200}
                      data={[
                        { subject: 'Ataques', value: totalMatches === 0 ? 0 : Math.min(10, (clubGoalsFor / totalMatches) * 3), fullMark: 10 },
                        { subject: 'Defensa', value: totalMatches === 0 ? 0 : Math.max(0, 10 - (clubGoalsAgainst / totalMatches) * 4), fullMark: 10 },
                        { subject: 'Victoria', value: totalMatches === 0 ? 0 : (clubWins / totalMatches) * 10, fullMark: 10 },
                        { subject: 'Balance', value: totalMatches === 0 ? 0 : Math.min(10, Math.max(0, ((clubGoalsFor - clubGoalsAgainst) / totalMatches) + 5)), fullMark: 10 },
                        { subject: 'Goleo', value: totalMatches === 0 ? 0 : Math.min(10, (clubGoalsFor / totalMatches) * 2), fullMark: 10 },
                      ]}
                      color="#00FF85"
                    />
                    <div className="w-full flex justify-between px-4">
                       <div className="text-center">
                          <p className="text-[9px] text-[#6A6C6E] font-bold uppercase">Eficiencia (Win Rate)</p>
                          <p className="text-lg font-black text-white">{winRate}%</p>
                       </div>
                       <div className="text-center">
                          <p className="text-[9px] text-[#6A6C6E] font-bold uppercase">Partidos Jugados</p>
                          <p className="text-lg font-black text-[#00FF85]">{totalMatches}</p>
                       </div>
                    </div>
                 </div>
              </div>

              {/* WAITING STATE & NO MATCHES */}
              <div className="grid grid-cols-1 gap-4">
                {matchResult.waiting && matchResult.waiting_until && (
                  <div className="rounded-xl border border-[#00FF85]/20 bg-[#00FF85]/5 p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <Hourglass className="w-5 h-5 text-[#00FF85]" />
                      <span className="text-[11px] font-bold text-[#00FF85] uppercase tracking-wider">Siguiente Jornada</span>
                    </div>
                    <CountdownTimer 
                      deadline={matchResult.waiting_until} 
                      size="md" 
                      onExpired={refreshData}
                    />
                  </div>
                )}

                {!nextPlayableMatch && !matchResult.waiting && competitions.length > 0 && (
                  <div className="rounded-xl border border-[#00FF85]/20 bg-[#00FF85]/5 p-6 text-center">
                    <Check className="w-6 h-6 text-[#00FF85] mx-auto mb-2" />
                    <p className="text-sm font-black uppercase text-white tracking-wide">Fixture al día</p>
                    <p className="text-[11px] text-[#6A6C6E] mt-1 font-semibold uppercase tracking-wider">No hay partidos pendientes por jugar</p>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-3 mt-4">
                {competitions.length > 0 && (
                  <>
                    {/* Primary Stat Tile: Custom Bar Chart */}
                    <div className="rounded-xl bg-[#141414] border border-[#202020] p-5 flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Goal className="w-4 h-4 text-[#00FF85]" />
                          <p className="text-[10px] text-[#6A6C6E] uppercase tracking-widest font-black">Rendimiento</p>
                        </div>
                        <span className="text-[10px] font-black uppercase text-[#2D2D2D]">Dif: {clubGoalsFor - clubGoalsAgainst > 0 ? '+' : ''}{clubGoalsFor - clubGoalsAgainst}</span>
                      </div>
                      
                      {/* Bars Container */}
                      <div className="flex-1 flex flex-col justify-center gap-4">
                        {/* Favor */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-end">
                            <span className="text-xs font-black text-white uppercase tracking-wider">A Favor</span>
                            <span className="text-lg font-black text-[#00FF85]">{clubGoalsFor}</span>
                          </div>
                          <div className="h-2 w-full bg-[#0A0A0A] rounded-full overflow-hidden border border-[#202020]">
                            <div 
                              className="h-full bg-[#00FF85] rounded-full" 
                              style={{ width: `${Math.min(100, Math.max(5, (clubGoalsFor / (Math.max(clubGoalsFor, clubGoalsAgainst) || 1)) * 100))}%` }}
                            />
                          </div>
                        </div>

                        {/* Contra */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-end">
                            <span className="text-xs font-black text-white uppercase tracking-wider">En Contra</span>
                            <span className="text-lg font-black text-[#FF3333]">{clubGoalsAgainst}</span>
                          </div>
                          <div className="h-2 w-full bg-[#0A0A0A] rounded-full overflow-hidden border border-[#202020]">
                            <div 
                              className="h-full bg-[#FF3333] rounded-full" 
                              style={{ width: `${Math.min(100, Math.max(5, (clubGoalsAgainst / (Math.max(clubGoalsFor, clubGoalsAgainst) || 1)) * 100))}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Secondary Stats Strip */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-[#141414] border border-[#202020] p-4 flex items-center justify-between">
                        <p className="text-[10px] text-[#6A6C6E] uppercase tracking-wider font-bold">Victorias</p>
                        <p className="text-xl font-black text-[#00FF85]">{clubWins}</p>
                      </div>
                      <div className="rounded-xl bg-[#141414] border border-[#202020] p-4 flex items-center justify-between">
                        <p className="text-[10px] text-[#6A6C6E] uppercase tracking-wider font-bold">Derrotas</p>
                        <p className="text-xl font-black text-[#FF3333]">{clubLosses}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Recent Results */}
              {recentResults.length > 0 && (
                <div>
                  <h2 className="text-[10px] font-bold text-[#6A6C6E] uppercase tracking-widest mb-3 flex items-center gap-2">
                    Últimos Resultados
                  </h2>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
                    {recentResults.map((match) => {
                      const result = getMatchResult(match)
                      const isHome = match.home_club_id === club.id
                      const opponent = isHome ? match.away_club : match.home_club
                      return (
                        <div key={match.id} className={`flex-shrink-0 w-[120px] rounded-xl border p-2.5 ${
                          result === 'W' ? 'bg-[#00FF85]/5 border-[#00FF85]/20' :
                          result === 'L' ? 'bg-[#FF3333]/5 border-[#FF3333]/20' :
                          'bg-yellow-500/5 border-yellow-500/20'
                        }`}>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <div className="w-6 h-6 rounded bg-[#0A0A0A] border border-[#202020] flex items-center justify-center overflow-hidden">
                              {opponent?.shield_url ? (
                                <img src={opponent.shield_url} alt="" className="w-5 h-5 object-contain" />
                              ) : (
                                <Shield className="w-3.5 h-3.5 text-[#6A6C6E]" />
                              )}
                            </div>
                            <p className="text-[10px] font-bold text-white truncate flex-1">{opponent?.name}</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-black text-white">{match.home_score}-{match.away_score}</span>
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                              result === 'W' ? 'bg-[#00FF85]/20 text-[#00FF85]' :
                              result === 'L' ? 'bg-[#FF3333]/20 text-[#FF3333]' :
                              'bg-yellow-500/20 text-yellow-500'
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
              <h2 className="text-xs font-bold text-[#6A6C6E] uppercase tracking-widest flex items-center gap-2 mb-2">
                <Trophy className="w-4 h-4 text-[#00FF85]" />
                Competencias Activas
              </h2>

              {competitions.length === 0 ? (
                <div className="bg-[#141414] rounded-xl border border-[#202020] p-10 text-center animate-fade-in-up">
                  <Trophy className="w-12 h-12 text-[#2D2D2D] mx-auto mb-3" />
                  <p className="text-[#6A6C6E] text-sm font-semibold">Sin competencias activas</p>
                </div>
              ) : (
                <div className="space-y-3 stagger">
                  {competitions.map((comp) => {
                    const isExpanded = expandedCompetitions.has(comp.id)
                    return (
                      <div key={comp.id} className="bg-[#141414] rounded-xl border border-[#202020] overflow-hidden">
                        <button
                          onClick={() => toggleCompetition(comp.id)}
                          className="w-full flex items-center gap-3 p-4 transition-colors hover:bg-[#202020]"
                        >
                          <div className={`w-10 h-10 rounded bg-[#0A0A0A] flex items-center justify-center shrink-0 border border-[#2D2D2D]`}>
                            {comp.type === 'league' ? <LayoutList className="w-4 h-4 text-white" /> :
                             comp.type === 'cup' ? <Trophy className="w-4 h-4 text-[#00FF85]" /> :
                             <Swords className="w-4 h-4 text-white" />}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className="font-bold text-white truncate text-sm">{comp.name}</p>
                            <p className="text-[10px] text-[#00FF85] font-bold uppercase tracking-wider mt-0.5">
                              {comp.type === 'league' ? 'Liga' : comp.type === 'cup' ? 'Copa' : 'Grupos + K.O.'}
                              {comp.myPosition && ` · ${comp.myPosition}° LUGAR · ${comp.myPoints} PTS`}
                            </p>
                          </div>
                          <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                            <ChevronDown className="w-5 h-5 text-[#6A6C6E]" />
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 animate-fade-in-up space-y-4">
                            {/* Internal Tabs Selector */}
                            <div className="flex gap-1.5 p-1 bg-[#0A0A0A] rounded-xl border border-white/[0.03]">
                              <button 
                                onClick={() => setCompSubTabs(prev => ({ ...prev, [comp.id]: 'standings' }))}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                  (compSubTabs[comp.id] || 'standings') === 'standings' 
                                    ? 'bg-[#141414] text-[#00FF85] shadow-lg shadow-black/50 border border-white/[0.05]' 
                                    : 'text-[#2D2D2D] hover:text-[#6A6C6E]'
                                }`}
                              >
                                <LayoutList className="w-3 h-3" />
                                Clasificación
                              </button>
                              <button 
                                onClick={() => setCompSubTabs(prev => ({ ...prev, [comp.id]: 'calendar' }))}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                  compSubTabs[comp.id] === 'calendar' 
                                    ? 'bg-[#141414] text-[#00FF85] shadow-lg shadow-black/50 border border-white/[0.05]' 
                                    : 'text-[#2D2D2D] hover:text-[#6A6C6E]'
                                }`}
                              >
                                <Calendar className="w-3 h-3" />
                                Calendario
                              </button>
                            </div>

                            {/* View: Standings */}
                            {(compSubTabs[comp.id] || 'standings') === 'standings' && (
                              <div className="space-y-4 pt-1">
                                {/* League / Group Standings */}
                                {(comp.type === 'league' || comp.type === 'groups_knockout') && (comp.standings?.length ?? 0) > 0 && (
                                  <div className="space-y-4">
                                    {(() => {
                                      // Group standings by group_name
                                      const groupsMap = new Map<string, (Standing & { club?: Club })[]>()
                                      ;(comp.standings || []).forEach(s => {
                                        const g = s.group_name || 'Liga'
                                        if (!groupsMap.has(g)) groupsMap.set(g, [])
                                        groupsMap.get(g)!.push(s)
                                      })
                                      
                                      return Array.from(groupsMap.entries()).map(([gName, groupStandings]) => (
                                        <div key={gName} className="space-y-2">
                                          {groupsMap.size > 1 && (
                                            <div className="px-2">
                                              <span className="text-[10px] font-black text-[#00FF85] uppercase tracking-widest">{gName}</span>
                                            </div>
                                          )}
                                          <StandingsTable
                                            standings={groupStandings}
                                            highlightClubId={club.id}
                                          />
                                        </div>
                                      ))
                                    })()}
                                  </div>
                                )}

                                {/* Default KO indicator for cup */}
                                {comp.type === 'cup' && (comp.standings?.length === 0) && (
                                  <div className="py-8 text-center bg-white/[0.02] border border-dashed border-white/[0.05] rounded-2xl">
                                    <Trophy className="w-8 h-8 text-[#2D2D2D] mx-auto mb-2" />
                                    <p className="text-[10px] text-[#2D2D2D] font-black uppercase tracking-widest">Competición de eliminación directa</p>
                                    <button 
                                      onClick={() => setCompSubTabs(prev => ({ ...prev, [comp.id]: 'calendar' }))}
                                      className="mt-4 text-[9px] font-black text-[#00FF85] uppercase tracking-widest border-b border-[#00FF85]/30"
                                    >
                                      Ver Cuadro de Partidos
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* View: Full Calendar */}
                            {compSubTabs[comp.id] === 'calendar' && (
                              <div className="space-y-6 pt-2">
                                {(() => {
                                  const matchesMap = new Map<string, MatchWithDetails[]>()
                                  const matches = comp.matches || []

                                  if (matches.length === 0) {
                                    return (
                                      <div className="bg-[#0A0A0A] rounded-2xl border border-dashed border-white/[0.05] p-10 text-center">
                                        <Calendar className="w-8 h-8 text-[#2D2D2D] mx-auto mb-3" />
                                        <p className="text-[10px] text-[#6A6C6E] font-black uppercase tracking-widest">Fixture no programado aún</p>
                                      </div>
                                    )
                                  }

                                  // Grouping logic
                                  matches.forEach(m => {
                                    let groupTitle = ''
                                    if (m.round_name) groupTitle = m.round_name
                                    else if (m.matchday) groupTitle = `Jornada ${m.matchday}`
                                    else groupTitle = 'Partidos'

                                    if (m.group_name) groupTitle = `${m.group_name} — ${groupTitle}`

                                    if (!matchesMap.has(groupTitle)) matchesMap.set(groupTitle, [])
                                    matchesMap.get(groupTitle)!.push(m)
                                  })

                                  const groupTitles = Array.from(matchesMap.keys())
                                  const currentRound = selectedRounds[comp.id] || groupTitles[0]
                                  const gMatches = matchesMap.get(currentRound) || []

                                  return (
                                    <div className="space-y-4">
                                      {/* Round Pagination Header */}
                                      <div className="flex items-center justify-between bg-[#0A0A0A] p-2 rounded-xl border border-white/[0.03]">
                                        <button 
                                          onClick={() => {
                                            const idx = groupTitles.indexOf(currentRound)
                                            if (idx > 0) setSelectedRounds(prev => ({ ...prev, [comp.id]: groupTitles[idx - 1] }))
                                          }}
                                          disabled={groupTitles.indexOf(currentRound) === 0}
                                          className="p-2 text-[#6A6C6E] hover:text-white disabled:opacity-20 transition-colors"
                                        >
                                          <ChevronDown className="w-4 h-4 rotate-90" />
                                        </button>
                                        
                                        <div className="flex flex-col items-center">
                                          <span className="text-[9px] font-black text-[#00FF85] uppercase tracking-[0.2em]">{currentRound}</span>
                                          <span className="text-[7px] text-[#6A6C6E] font-bold uppercase mt-0.5">{groupTitles.indexOf(currentRound) + 1} de {groupTitles.length}</span>
                                        </div>

                                        <button 
                                          onClick={() => {
                                            const idx = groupTitles.indexOf(currentRound)
                                            if (idx < groupTitles.length - 1) setSelectedRounds(prev => ({ ...prev, [comp.id]: groupTitles[idx + 1] }))
                                          }}
                                          disabled={groupTitles.indexOf(currentRound) === groupTitles.length - 1}
                                          className="p-2 text-[#6A6C6E] hover:text-white disabled:opacity-20 transition-colors"
                                        >
                                          <ChevronDown className="w-4 h-4 -rotate-90" />
                                        </button>
                                      </div>

                                      <div className="grid gap-2">
                                        {gMatches.map(m => {
                                          const isFinished = m.status === 'finished'
                                          const myClubPlaying = m.home_club_id === club.id || m.away_club_id === club.id
                                          
                                          return (
                                            <button 
                                              key={m.id} 
                                              onClick={() => {
                                                if (isFinished) {
                                                  setSelectedMatchId(m.id)
                                                  setIsMatchDetailsOpen(true)
                                                }
                                              }}
                                              className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-300 relative overflow-hidden group/m ${
                                                myClubPlaying 
                                                  ? 'bg-[#00FF85]/5 border-[#00FF85]/20 shadow-[0_0_20px_rgba(0,255,133,0.05)]' 
                                                  : 'bg-[#0A0A0A] border-white/[0.03] hover:border-white/10 hover:bg-white/[0.02]'
                                              } ${!isFinished ? 'cursor-default' : ''}`}
                                            >
                                              {/* Home Club */}
                                              <div className="flex items-center gap-2.5 w-[38%]">
                                                <div className="w-7 h-7 rounded-lg bg-[#141414] border border-white/[0.05] flex items-center justify-center p-1.5 shrink-0 shadow-lg group-hover/m:scale-110 transition-transform">
                                                  {m.home_club?.shield_url ? (
                                                    <img src={m.home_club.shield_url} alt="" className="w-full h-full object-contain" />
                                                  ) : (
                                                    <Shield className="w-3.5 h-3.5 text-[#2D2D2D]" />
                                                  )}
                                                </div>
                                                <span className={`text-[10px] font-black truncate uppercase text-left tracking-tighter ${myClubPlaying && m.home_club_id === club.id ? 'text-[#00FF85]' : 'text-[#6A6C6E] group-hover/m:text-white'}`}>
                                                  {m.home_club?.name}
                                                </span>
                                              </div>

                                              {/* Score / Status / VS */}
                                              <div className="flex-1 flex flex-col items-center">
                                                {isFinished ? (
                                                  <div className="flex flex-col items-center">
                                                    <span className="text-sm font-black text-white italic tracking-wider">
                                                      {m.home_score}—{m.away_score}
                                                    </span>
                                                    <span className="text-[6px] font-black text-[#00FF85] uppercase tracking-widest mt-0.5 opacity-60">Result</span>
                                                  </div>
                                                ) : (
                                                  <div className="flex flex-col items-center">
                                                    <div className="px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.05]">
                                                       <span className="text-[8px] font-black text-[#2D2D2D] uppercase tracking-tighter">VS</span>
                                                    </div>
                                                    {m.deadline && (
                                                       <span className="text-[6px] text-[#6A6C6E] font-black uppercase mt-1 tracking-widest animate-pulse">Pending</span>
                                                    )}
                                                  </div>
                                                )}
                                              </div>

                                              {/* Away Club */}
                                              <div className="flex items-center justify-end gap-2.5 w-[38%]">
                                                <span className={`text-[10px] font-black truncate uppercase text-right tracking-tighter ${myClubPlaying && m.away_club_id === club.id ? 'text-[#00FF85]' : 'text-[#6A6C6E] group-hover/m:text-white'}`}>
                                                  {m.away_club?.name}
                                                </span>
                                                <div className="w-7 h-7 rounded-lg bg-[#141414] border border-white/[0.05] flex items-center justify-center p-1.5 shrink-0 shadow-lg group-hover/m:scale-110 transition-transform">
                                                  {m.away_club?.shield_url ? (
                                                    <img src={m.away_club.shield_url} alt="" className="w-full h-full object-contain" />
                                                  ) : (
                                                    <Shield className="w-3.5 h-3.5 text-[#2D2D2D]" />
                                                  )}
                                                </div>
                                              </div>
                                            </button>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )
                                })()}
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
            <div className="space-y-4" key="tab-stats">
              <h2 className="text-[10px] font-bold text-[#6A6C6E] uppercase tracking-widest flex items-center gap-2">
                Estadísticas de Jugadores
              </h2>

              {/* Filter pills */}
              {competitions.length > 1 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
                  <button
                    onClick={() => setStatsFilter('all')}
                    className={`px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-colors border ${
                      statsFilter === 'all'
                        ? 'bg-[#00FF85] text-[#0A0A0A] border-[#00FF85]'
                        : 'bg-[#141414] text-[#6A6C6E] border-[#202020] hover:bg-[#202020] hover:text-white'
                    }`}
                  >
                    Todas
                  </button>
                  {competitions.map(comp => (
                    <button
                      key={comp.id}
                      onClick={() => setStatsFilter(comp.id)}
                      className={`px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-colors border ${
                        statsFilter === comp.id
                          ? 'bg-[#FF3131] text-white border-[#FF3131]'
                          : 'bg-[#141414] text-[#6A6C6E] border-[#202020] hover:bg-[#202020] hover:text-white'
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
                    <div className="rounded-xl border border-[#202020] bg-[#141414] p-8 text-center">
                      <BarChart3 className="w-8 h-8 text-[#6A6C6E]/50 mx-auto mb-2" />
                      <p className="text-[#6A6C6E] text-xs font-bold uppercase tracking-wider">Sin estadísticas aún</p>
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
                          const isMine = entry.player?.club_id === club?.id
                          return (
                            <div key={entry.player?.id} className={`flex items-center gap-3 px-4 py-2.5 ${isMine ? 'bg-primary/5' : ''}`}>
                              <div className="w-6 text-center shrink-0">
                                {i < 3 ? (
                                  <span className="text-sm">{medals[i]}</span>
                                ) : (
                                  <span className="text-xs font-bold text-muted-foreground">{i + 1}</span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${isMine ? 'text-primary' : 'text-foreground'}`}>
                                  {entry.player?.name}
                                </p>
                                <p className="text-[10px] text-muted-foreground">{entry.player?.position} · {entry.played} PJ</p>
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

              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#00FF85]" />
                <h2 className="text-xs font-bold text-[#6A6C6E] uppercase tracking-widest">Calendario</h2>
                <span className="text-[10px] text-[#A0A2A4] ml-auto font-bold uppercase tracking-wider">
                  {filteredMatches.length} partidos
                </span>
              </div>

              {filteredMatches.length === 0 ? (
                <div className="bg-[#141414] rounded-xl border border-[#202020] p-10 text-center animate-fade-in-up">
                  <Calendar className="w-12 h-12 text-[#2D2D2D] mx-auto mb-3" />
                  <p className="text-[#6A6C6E] text-sm font-semibold">Sin partidos programados</p>
                </div>
              ) : (
                <div className="space-y-6 animate-fade-in-up">
                  {(() => {
                    const itemsPerPage = 6
                    const totalPages = Math.ceil(filteredMatches.length / itemsPerPage)
                    const currentPage = Math.min(calendarPage, totalPages - 1)
                    const pageMatches = filteredMatches.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage)

                    return (
                      <>
                        <div className="space-y-3">
                          {pageMatches.map((match) => {
                            const isHome = match.home_club_id === club.id
                            const opponent = isHome ? match.away_club : match.home_club
                            const result = getMatchResult(match)
                            const isFinished = match.status === 'finished'
                            
                            return (
                              <button 
                                key={match.id} 
                                onClick={() => {
                                  if (isFinished) {
                                    setSelectedMatchId(match.id)
                                    setIsMatchDetailsOpen(true)
                                  }
                                }}
                                className={`w-full group relative overflow-hidden flex items-center gap-4 p-5 rounded-[24px] border transition-all duration-500 pt-9 pb-6 ${
                                  isFinished 
                                    ? 'bg-[#141414]/90 border-white/[0.05] hover:border-[#00FF85]/30 hover:bg-[#141414]' 
                                    : 'bg-[#0A0A0A] border-white/[0.03] hover:border-white/10'
                                } ${!isFinished ? 'cursor-default' : ''}`}
                              >
                                {/* Competition Badge Overlay */}
                                <div className="absolute top-0 left-0 px-4 py-1.5 bg-white/[0.03] border-b border-r border-white/5 rounded-br-[18px]">
                                  <span className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-[0.2em] leading-none block italic opacity-70">
                                      {match.competition?.name} — {match.round_name || `Jornada ${match.matchday}`}
                                  </span>
                                </div>

                                {/* Home Team */}
                                <div className="flex-1 flex items-center justify-end gap-3.5 pr-2">
                                  <span className={`text-[11px] font-black uppercase tracking-tighter truncate text-right ${isHome ? 'text-[#00FF85]' : 'text-white/60 group-hover:text-white'}`}>
                                    {match.home_club?.name}
                                  </span>
                                  <div className="w-14 h-14 rounded-2xl bg-black/50 border border-white/10 flex items-center justify-center p-3 shrink-0 shadow-2xl transition-transform duration-500 group-hover:scale-110">
                                    {match.home_club?.shield_url ? (
                                      <img src={match.home_club.shield_url} alt="" className="w-full h-full object-contain" />
                                    ) : (
                                      <Shield className="w-6 h-6 text-[#2D2D2D]" />
                                    )}
                                  </div>
                                </div>

                                {/* Center - Score/Status */}
                                <div className="flex flex-col items-center justify-center w-24 shrink-0 px-2 py-2 rounded-[20px] bg-black/60 border border-white/5 shadow-inner">
                                  {isFinished ? (
                                    <>
                                      <span className="text-xl font-black text-white italic tracking-tighter leading-none">
                                        {match.home_score} — {match.away_score}
                                      </span>
                                      <div className={`mt-2 px-2 py-0.5 rounded-full border border-current/20 bg-current/[0.02] ${
                                        result === 'W' ? 'text-[#00FF85]' : result === 'L' ? 'text-red-500' : 'text-yellow-500'
                                      }`}>
                                        <span className="text-[7px] font-black uppercase tracking-[0.1em] block w-full text-center">
                                          {result === 'W' ? 'W' : result === 'L' ? 'L' : 'D'}
                                        </span>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 mb-2">
                                        <span className="text-[9px] font-black text-white/40 tracking-widest">VS</span>
                                      </div>
                                      {match.deadline ? (
                                          <div className="scale-[0.85] origin-center -my-1">
                                            <CountdownTimer deadline={match.deadline} size="sm" />
                                          </div>
                                      ) : (
                                          <span className="text-[8px] font-black text-[#2D2D2D] uppercase tracking-[0.2em] animate-pulse">Wait</span>
                                      )}
                                    </>
                                  )}
                                </div>

                                {/* Away Team */}
                                <div className="flex-1 flex items-center justify-start gap-3.5 pl-2">
                                  <div className="w-14 h-14 rounded-2xl bg-black/50 border border-white/10 flex items-center justify-center p-3 shrink-0 shadow-2xl transition-transform duration-500 group-hover:scale-110">
                                    {match.away_club?.shield_url ? (
                                      <img src={match.away_club.shield_url} alt="" className="w-full h-full object-contain" />
                                    ) : (
                                      <Shield className="w-6 h-6 text-[#2D2D2D]" />
                                    )}
                                  </div>
                                  <span className={`text-[11px] font-black uppercase tracking-tighter truncate text-left ${!isHome ? 'text-[#00FF85]' : 'text-white/60 group-hover:text-white'}`}>
                                    {match.away_club?.name}
                                  </span>
                                </div>
                              </button>
                            )
                          })}
                        </div>

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between bg-[#141414] p-2 rounded-2xl border border-white/[0.03]">
                            <button 
                              onClick={() => setCalendarPage(p => Math.max(0, p - 1))}
                              disabled={currentPage === 0}
                              className="p-3 bg-[#0A0A0A] rounded-xl border border-white/5 text-[#6A6C6E] hover:text-white disabled:opacity-20 transition-all active:scale-95"
                            >
                              <ChevronDown className="w-5 h-5 rotate-90" />
                            </button>
                            
                            <div className="flex flex-col items-center">
                              <span className="text-[11px] font-black text-[#00FF85] uppercase tracking-[0.2em]">Página {currentPage + 1}</span>
                              <span className="text-[8px] text-[#A0A2A4] font-bold uppercase mt-0.5">{filteredMatches.length} partidos totales</span>
                            </div>

                            <button 
                              onClick={() => setCalendarPage(p => Math.min(totalPages - 1, p + 1))}
                              disabled={currentPage === totalPages - 1}
                              className="p-3 bg-[#0A0A0A] rounded-xl border border-white/5 text-[#6A6C6E] hover:text-white disabled:opacity-20 transition-all active:scale-95"
                            >
                              <ChevronDown className="w-5 h-5 -rotate-90" />
                            </button>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ======== TAB: SQUAD ======== */}
          {activeTab === 'squad' && (
            <div className="space-y-5 animate-slide-in" key="tab-squad">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-[#6A6C6E] uppercase tracking-widest flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#00FF85]" />
                  Plantilla
                </h2>
                <span className="text-[10px] text-[#00FF85] font-bold bg-[#00FF85]/10 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  {players.length} jugadores
                </span>
              </div>

              {/* Squad Sub-Tabs */}
              <div className="flex bg-[#0A0A0A] p-1 rounded-xl border border-[#202020]">
                <button
                  onClick={() => setSquadTab('lista')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    squadTab === 'lista'
                      ? 'bg-[#00FF85] text-[#0A0A0A] shadow-[0_0_15px_rgba(0,255,133,0.2)]'
                      : 'text-[#6A6C6E] hover:text-white'
                  }`}
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  Lista
                </button>
                <button
                  onClick={() => setSquadTab('alineacion')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    squadTab === 'alineacion'
                      ? 'bg-[#00FF85] text-[#0A0A0A] shadow-[0_0_15px_rgba(0,255,133,0.2)]'
                      : 'text-[#6A6C6E] hover:text-white'
                  }`}
                >
                  <Swords className="w-3.5 h-3.5" />
                  Alineación
                </button>
              </div>

              {squadTab === 'alineacion' ? (
                <PitchLineup 
                  players={players} 
                  initialLineup={club?.default_lineup} 
                  onSave={handleSaveLineup}
                />
              ) : players.length === 0 ? (
                <div className="bg-[#141414] rounded-xl border border-[#202020] p-10 text-center animate-fade-in-up">
                  <Users className="w-12 h-12 text-[#2D2D2D] mx-auto mb-3" />
                  <p className="text-[#6A6C6E] text-sm font-semibold">No hay jugadores</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {(() => {
                    // Aggregate stats for current season's competitions
                    const playerSeasonMap = new Map<string, { goals: number, assists: number, matches: number }>()
                    
                    competitions.forEach(comp => {
                      comp.playerStats.forEach((ps: any) => {
                        const pid = ps.player_id
                        const current = playerSeasonMap.get(pid) || { goals: 0, assists: 0, matches: 0 }
                        current.goals += ps.goals || 0
                        current.assists += ps.assists || 0
                        current.matches += ps.matches_played || 0
                        playerSeasonMap.set(pid, current)
                      })
                    })

                    return positionGroups.map((group) => {
                      const groupPlayers = players.filter(p => group.positions.includes(p.position))
                      if (groupPlayers.length === 0) return null

                      return (
                        <div key={group.label}>
                          <div className="flex items-center gap-2 mb-2.5">
                            <div className={`w-1 h-4 rounded-full ${group.color.replace('text-', 'bg-')}`} />
                            <h3 className={`text-xs font-black uppercase tracking-widest ${group.color}`}>
                              {group.label}
                            </h3>
                            <span className="text-[10px] text-[#6A6C6E] font-bold">({groupPlayers.length})</span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 stagger">
                            {groupPlayers.map((player) => {
                              return (
                                <UltimateCard 
                                  key={player.id} 
                                  player={player}
                                  stats={playerSeasonMap.get(player.id)}
                                  onClick={() => setSelectedManagePlayer(player)}
                                />
                              )
                            })}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ======== TAB: MARKET ======== */}
          {activeTab === 'market' && (
            <MarketPage />
          )}
        </div>
      </div>

      <NotificationsDrawer 
        clubId={club.id} 
        isOpen={isNotificationsOpen} 
        onClose={() => setIsNotificationsOpen(false)} 
        onActionComplete={refreshData}
      />

      <MatchDetailsDrawer 
        matchId={selectedMatchId}
        isOpen={isMatchDetailsOpen}
        onClose={() => {
          setIsMatchDetailsOpen(false)
          setSelectedMatchId(null)
        }}
      />

      <PlayerManagementDialog 
        player={selectedManagePlayer}
        isOpen={!!selectedManagePlayer}
        onClose={() => setSelectedManagePlayer(null)}
        onUpdate={() => {
          // Optimization: could just refetch players instead of entire page
          window.location.reload()
        }}
      />

      {/* Bottom Navigation */}
      <DtNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hasMatch={!!nextPlayableMatch || matchResult.waiting}
      />
    </div>
  )
}
