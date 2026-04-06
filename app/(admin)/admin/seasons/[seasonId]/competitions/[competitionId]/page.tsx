'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Loader2, Shield, X, Users, Swords, Play, Trash2, RefreshCw, Lock, AlertTriangle, Trophy, LayoutList } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import type { Competition, Club, CompetitionClub, Match, LeagueConfig, CupConfig, GroupsKnockoutConfig, Season } from '@/lib/types'

// ============================================================
// Match generation utilities (unchanged logic)
// ============================================================
function generateLeagueMatches(clubs: Club[], config: LeagueConfig): Partial<Match>[] {
  const n = clubs.length
  if (n < 2) return []
  const matches: Partial<Match>[] = []
  const teams = n % 2 === 0 ? [...clubs] : [...clubs, null]
  const totalTeams = teams.length
  for (let round = 0; round < totalTeams - 1; round++) {
    for (let i = 0; i < totalTeams / 2; i++) {
      const home = teams[i]
      const away = teams[totalTeams - 1 - i]
      if (home && away) {
        matches.push({ home_club_id: home.id, away_club_id: away.id, matchday: round + 1, round_name: `Jornada ${round + 1}`, leg: 1, status: 'scheduled' })
      }
    }
    const last = teams.pop()!
    teams.splice(1, 0, last)
  }
  if (config.rounds === 2) {
    const firstRoundCount = matches.length
    for (let i = 0; i < firstRoundCount; i++) {
      const m = matches[i]
      matches.push({ home_club_id: m.away_club_id, away_club_id: m.home_club_id, matchday: (m.matchday || 0) + (totalTeams - 1), round_name: `Jornada ${(m.matchday || 0) + (totalTeams - 1)}`, leg: 2, status: 'scheduled' })
    }
  }
  return matches
}

function nextPowerOf2(n: number): number { if (n <= 1) return 2; let power = 1; while (power < n) power *= 2; return power }

function generateCupMatches(clubs: Club[], config: CupConfig): Partial<Match>[] {
  const n = clubs.length
  if (n < 2) return []
  const matches: Partial<Match>[] = []
  const roundNames: Record<number, string> = { 2: 'Final', 4: 'Semifinales', 8: 'Cuartos de Final', 16: 'Octavos de Final', 32: 'Dieciseisavos de Final' }
  const shuffled = [...clubs].sort(() => Math.random() - 0.5)
  let matchday = 1
  const clubsToPlay = n % 2 === 1 ? shuffled.slice(0, -1) : shuffled
  const firstRoundMatchCount = Math.floor(clubsToPlay.length / 2)
  const getNextPowerOf2Teams = (teams: number) => { let p = 1; while (p < teams) p *= 2; return p }
  const effectiveBracketSize = getNextPowerOf2Teams(n)
  const firstRoundName = roundNames[effectiveBracketSize] || `Ronda de ${effectiveBracketSize}`
  for (let i = 0; i < firstRoundMatchCount; i++) {
    const homeClub = clubsToPlay[i * 2]?.id || null; const awayClub = clubsToPlay[i * 2 + 1]?.id || null
    matches.push({ home_club_id: homeClub, away_club_id: awayClub, matchday, round_name: config.legs === 2 ? `${firstRoundName} - Ida` : firstRoundName, leg: 1, status: 'scheduled' })
    if (config.legs === 2) { matches.push({ home_club_id: awayClub, away_club_id: homeClub, matchday, round_name: `${firstRoundName} - Vuelta`, leg: 2, status: 'scheduled' }) }
  }
  let teamsInNextRound = firstRoundMatchCount + (n - clubsToPlay.length); matchday++
  while (teamsInNextRound >= 2) {
    const matchesInRound = Math.floor(teamsInNextRound / 2)
    const roundName = roundNames[teamsInNextRound] || `Ronda de ${teamsInNextRound}`
    for (let i = 0; i < matchesInRound; i++) {
      matches.push({ home_club_id: null, away_club_id: null, matchday, round_name: config.legs === 2 ? `${roundName} - Ida` : roundName, leg: 1, status: 'scheduled' })
      if (config.legs === 2) { matches.push({ home_club_id: null, away_club_id: null, matchday, round_name: `${roundName} - Vuelta`, leg: 2, status: 'scheduled' }) }
    }
    teamsInNextRound = matchesInRound + (teamsInNextRound % 2); matchday++
  }
  return matches
}

function generateGroupsMatches(clubs: CompetitionClub[], config: GroupsKnockoutConfig): Partial<Match>[] {
  const matches: Partial<Match>[] = []
  const groups: Record<string, CompetitionClub[]> = {}
  clubs.forEach(c => { const g = c.group_name || 'A'; if (!groups[g]) groups[g] = []; groups[g].push(c) })
  let matchdayOffset = 0
  Object.entries(groups).forEach(([groupName, groupClubs]) => {
    const n = groupClubs.length; if (n < 2) return
    const teams = n % 2 === 0 ? [...groupClubs] : [...groupClubs, null]; const totalTeams = teams.length
    for (let round = 0; round < totalTeams - 1; round++) {
      for (let i = 0; i < totalTeams / 2; i++) {
        const home = teams[i]; const away = teams[totalTeams - 1 - i]
        if (home && away) { matches.push({ home_club_id: home.club_id, away_club_id: away.club_id, matchday: round + 1 + matchdayOffset, round_name: `Grupo ${groupName} - J${round + 1}`, group_name: groupName, leg: 1, status: 'scheduled' }) }
      }
      const last = teams.pop()!; teams.splice(1, 0, last)
    }
    matchdayOffset += totalTeams - 1
  })
  const totalGroups = Object.keys(groups).length; const teamsPerGroup = config.teams_advance_per_group || 2; const totalAdvancing = totalGroups * teamsPerGroup
  const bracketSize = nextPowerOf2(totalAdvancing)
  const roundNames: Record<number, string> = { 2: 'Final', 4: 'Semifinales', 8: 'Cuartos de Final', 16: 'Octavos de Final', 32: 'Dieciseisavos de Final' }
  let currentTeams = bracketSize; let koMatchday = matchdayOffset + 1
  while (currentTeams >= 2) {
    const roundName = roundNames[currentTeams] || `Ronda de ${currentTeams}`; const matchesInRound = Math.floor(currentTeams / 2)
    for (let i = 0; i < matchesInRound; i++) {
      matches.push({ home_club_id: null, away_club_id: null, matchday: koMatchday, round_name: config.knockout_legs === 2 ? `${roundName} - Ida` : roundName, group_name: null, leg: 1, status: 'scheduled' })
      if (config.knockout_legs === 2) { matches.push({ home_club_id: null, away_club_id: null, matchday: koMatchday, round_name: `${roundName} - Vuelta`, group_name: null, leg: 2, status: 'scheduled' }) }
    }
    currentTeams = Math.floor(currentTeams / 2); koMatchday++
  }
  return matches
}

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

const TYPE_ICONS: Record<string, React.ReactNode> = {
  league: <LayoutList className="w-5 h-5" />,
  cup: <Trophy className="w-5 h-5" />,
  groups_knockout: <Swords className="w-5 h-5" />,
}

const TYPE_LABELS: Record<string, string> = { league: 'Liga', cup: 'Copa', groups_knockout: 'Grupos + K.O.' }
const TYPE_COLORS: Record<string, { gradient: string; text: string }> = {
  league: { gradient: 'from-blue-500 to-blue-600', text: 'text-blue-400' },
  cup: { gradient: 'from-amber-400 to-amber-600', text: 'text-amber-400' },
  groups_knockout: { gradient: 'from-purple-500 to-purple-600', text: 'text-purple-400' },
}

// ============================================================
// Component
// ============================================================
export default function CompetitionDetailPage({ params }: { params: Promise<{ seasonId: string; competitionId: string }> }) {
  const { seasonId, competitionId } = use(params)
  const router = useRouter()
  
  const [season, setSeason] = useState<Season | null>(null)
  const [competition, setCompetition] = useState<Competition | null>(null)
  const [enrolledClubs, setEnrolledClubs] = useState<CompetitionClub[]>([])
  const [allClubs, setAllClubs] = useState<Club[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  const [isEnrollOpen, setIsEnrollOpen] = useState(false)
  const [selectedClubs, setSelectedClubs] = useState<string[]>([])
  const [clubGroups, setClubGroups] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDeleteMatchesOpen, setIsDeleteMatchesOpen] = useState(false)
  const [isDeleteCompetitionOpen, setIsDeleteCompetitionOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  const canEdit = season?.status === 'draft'

  const loadData = async () => {
    setIsLoading(true)
    const { data: seasonData } = await supabase.from('seasons').select('*').eq('id', seasonId).single()
    if (seasonData) setSeason(seasonData)
    const { data: compData, error: compError } = await supabase.from('competitions').select('*').eq('id', competitionId).single()
    if (compError || !compData) { toast.error('Competición no encontrada'); router.push(`/admin/seasons/${seasonId}`); return }
    setCompetition(compData)
    const { data: enrolledData } = await supabase.from('competition_clubs').select('*, club:clubs(*)').eq('competition_id', competitionId).order('group_name', { ascending: true })
    if (enrolledData) setEnrolledClubs(enrolledData)
    const { data: allClubsData } = await supabase.from('clubs').select('*').order('name')
    if (allClubsData) setAllClubs(allClubsData)
    const { data: matchesData } = await supabase.from('matches').select('*, home_club:clubs!matches_home_club_id_fkey(*), away_club:clubs!matches_away_club_id_fkey(*)').eq('competition_id', competitionId).order('match_order', { ascending: true })
    if (matchesData) setMatches(matchesData)
    setIsLoading(false)
  }

  useEffect(() => { loadData() }, [competitionId])

  const openEnrollDialog = () => {
    if (!canEdit) return
    setSelectedClubs(enrolledClubs.map(c => c.club_id))
    const groups: Record<string, string> = {}
    enrolledClubs.forEach(c => { if (c.group_name) groups[c.club_id] = c.group_name })
    setClubGroups(groups)
    setIsEnrollOpen(true)
  }

  const toggleClubSelection = (clubId: string) => {
    setSelectedClubs(prev => {
      if (prev.includes(clubId)) return prev.filter(id => id !== clubId)
      if (competition?.type === 'groups_knockout' && !clubGroups[clubId]) setClubGroups(g => ({ ...g, [clubId]: 'A' }))
      return [...prev, clubId]
    })
  }

  const handleEnrollClubs = async () => {
    if (!canEdit) return
    setIsSaving(true)
    try {
      const previousEnrolled = enrolledClubs.map(ec => ec.club_id)
      const newlyEnrolled = selectedClubs.filter(id => !previousEnrolled.includes(id))
      const removedClubs = previousEnrolled.filter(id => !selectedClubs.includes(id))
      if (removedClubs.length > 0) {
        await supabase.from('standings').delete().eq('competition_id', competitionId).in('club_id', removedClubs)
        await supabase.from('player_competition_stats').delete().eq('competition_id', competitionId).in('club_id', removedClubs)
      }
      await supabase.from('competition_clubs').delete().eq('competition_id', competitionId)
      if (selectedClubs.length > 0) {
        const inserts = selectedClubs.map((clubId, index) => ({ competition_id: competitionId, club_id: clubId, group_name: competition?.type === 'groups_knockout' ? (clubGroups[clubId] || 'A') : null, seed: index + 1 }))
        const { error } = await supabase.from('competition_clubs').insert(inserts)
        if (error) throw error
        if (newlyEnrolled.length > 0) {
          const standingsInserts = newlyEnrolled.map(clubId => ({ competition_id: competitionId, club_id: clubId, stage_id: null, group_name: competition?.type === 'groups_knockout' ? (clubGroups[clubId] || 'A') : null, played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, goal_difference: 0, points: 0, position: null }))
          for (const standing of standingsInserts) { const { error } = await supabase.from('standings').insert(standing); if (error && !error.message.includes('duplicate')) console.error('Error inserting standing:', error) }
        }
        if (newlyEnrolled.length > 0) {
          const { data: players } = await supabase.from('players').select('id, club_id').in('club_id', newlyEnrolled)
          if (players && players.length > 0) {
            const playerStatsInserts = players.map(player => ({ competition_id: competitionId, player_id: player.id, club_id: player.club_id, matches_played: 0, goals: 0, assists: 0, mvp_count: 0, yellow_cards: 0, red_cards: 0, minutes_played: 0 }))
            for (const stat of playerStatsInserts) { const { error } = await supabase.from('player_competition_stats').insert(stat); if (error && !error.message.includes('duplicate')) console.error('Error inserting player stat:', error) }
          }
        }
      }
      toast.success('Clubes actualizados'); setIsEnrollOpen(false); loadData()
    } catch (error) { console.error('Error enrolling clubs:', error); toast.error('Error al guardar clubes') } finally { setIsSaving(false) }
  }

  const generateMatches = async () => {
    if (!canEdit || !competition || enrolledClubs.length < 2) { toast.error('Se necesitan al menos 2 clubes'); return }
    setIsGenerating(true)
    try {
      if (matches.length > 0) await supabase.from('matches').delete().eq('competition_id', competitionId)
      let newMatches: Partial<Match>[] = []
      const clubsForGen = enrolledClubs.map(ec => ec.club as Club).filter(Boolean)
      switch (competition.type) {
        case 'league': newMatches = generateLeagueMatches(clubsForGen, competition.config as LeagueConfig); break
        case 'cup': newMatches = generateCupMatches(clubsForGen, competition.config as CupConfig); break
        case 'groups_knockout': newMatches = generateGroupsMatches(enrolledClubs, competition.config as GroupsKnockoutConfig); break
      }
      if (newMatches.length === 0) { toast.error('No se pudieron generar partidos'); setIsGenerating(false); return }
      const { data: seasonComps } = await supabase.from('competitions').select('id').eq('season_id', seasonId).neq('id', competitionId)
      let maxOrder = 0
      if (seasonComps && seasonComps.length > 0) {
        const { data: otherMatches } = await supabase.from('matches').select('match_order').in('competition_id', seasonComps.map(c => c.id)).order('match_order', { ascending: false }).limit(1)
        if (otherMatches && otherMatches.length > 0) maxOrder = otherMatches[0].match_order || 0
      }
      const matchesWithOrder = newMatches.map((m, i) => ({ ...m, competition_id: competitionId, match_order: maxOrder + i + 1 }))
      const { error } = await supabase.from('matches').insert(matchesWithOrder)
      if (error) throw error
      toast.success(`${matchesWithOrder.length} partidos generados`); loadData()
    } catch (error) { console.error(error); toast.error('Error al generar partidos') } finally { setIsGenerating(false) }
  }

  const deleteAllMatches = async () => {
    if (!canEdit) return
    try { const { error } = await supabase.from('matches').delete().eq('competition_id', competitionId); if (error) throw error; toast.success('Partidos eliminados'); setIsDeleteMatchesOpen(false); loadData() } catch (error) { toast.error('Error al eliminar partidos') }
  }

  const removeClub = async (clubId: string) => {
    if (!canEdit) return
    try { const { error } = await supabase.from('competition_clubs').delete().eq('competition_id', competitionId).eq('club_id', clubId); if (error) throw error; toast.success('Club eliminado de la competición'); loadData() } catch (error) { toast.error('Error al eliminar club') }
  }

  const handleDeleteCompetition = async () => {
    setIsDeleting(true)
    try {
      await supabase.from('player_competition_stats').delete().eq('competition_id', competitionId)
      await supabase.from('standings').delete().eq('competition_id', competitionId)
      await supabase.from('matches').delete().eq('competition_id', competitionId)
      await supabase.from('competition_clubs').delete().eq('competition_id', competitionId)
      await supabase.from('competition_stages').delete().eq('competition_id', competitionId)
      const { error } = await supabase.from('competitions').delete().eq('id', competitionId)
      if (error) throw error
      toast.success('Competición eliminada'); router.push(`/admin/seasons/${seasonId}`)
    } catch (error) { console.error(error); toast.error('Error al eliminar competición') } finally { setIsDeleting(false) }
  }

  if (isLoading) return (<div className="min-h-dvh flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>)

  const typeColor = TYPE_COLORS[competition?.type || 'league']

  return (
    <div className="min-h-dvh safe-area-top">
      {/* Header */}
      <header className="sticky top-[57px] z-30 bg-background/80 backdrop-blur-2xl border-b border-white/[0.06]">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <Link href={`/admin/seasons/${seasonId}`} className="p-2 -ml-2 rounded-xl active:scale-95 transition-transform"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></Link>
            <div>
              <h1 className="font-bold text-foreground truncate max-w-[180px]">{competition?.name}</h1>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold ${typeColor.text}`}>{TYPE_LABELS[competition?.type || '']}</span>
                {!canEdit && <span className="flex items-center gap-1 text-[9px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium"><Lock className="w-2.5 h-2.5" />Bloqueado</span>}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setIsDeleteCompetitionOpen(true)} className="text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-xl">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Competition Hero */}
      <div className="px-4 pt-4">
        <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-card via-card to-transparent border border-white/[0.06] p-5 animate-fade-in-up`}>
          <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${typeColor.gradient} rounded-full blur-3xl opacity-10`} />
          <div className="relative flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${typeColor.gradient} flex items-center justify-center shadow-xl`}>
              <div className="text-white">{TYPE_ICONS[competition?.type || 'league']}</div>
            </div>
            <div>
              <h2 className="font-bold text-lg text-foreground">{competition?.name}</h2>
              <div className="flex items-center gap-4 mt-1">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="w-3.5 h-3.5" />{enrolledClubs.length} clubes</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Swords className="w-3.5 h-3.5" />{matches.length} partidos</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!canEdit && (
        <div className="mx-4 mt-3 p-3 bg-amber-500/6 border border-amber-500/15 rounded-xl flex items-center gap-3 animate-fade-in-up">
          <Lock className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-[11px] text-amber-500">La configuración está bloqueada. Solo puedes ver la información.</p>
        </div>
      )}

      <div className="px-4 py-4 pb-24 space-y-5">
        
        {/* Enrolled Clubs */}
        <section className="bg-card/50 backdrop-blur-sm rounded-2xl border border-white/[0.06] overflow-hidden animate-fade-in-up" style={{ animationDelay: '60ms' }}>
          <div className="flex items-center justify-between p-4 border-b border-white/[0.04] bg-white/[0.02]">
            <h2 className="text-sm font-bold text-foreground">Clubes Inscritos ({enrolledClubs.length})</h2>
            {canEdit && (
              <Button onClick={openEnrollDialog} size="sm" variant="outline" className="gap-1.5 rounded-xl h-8 border-white/[0.08]">
                <Plus className="w-3.5 h-3.5" />Inscribir
              </Button>
            )}
          </div>
          
          {enrolledClubs.length === 0 ? (
            <div className="text-center py-10">
              <Users className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm font-medium">Sin clubes inscritos</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-px bg-white/[0.03]">
              {enrolledClubs.map((ec) => (
                <div key={ec.id} className="relative bg-card/80 p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/[0.04] flex items-center justify-center overflow-hidden ring-1 ring-white/[0.06] shrink-0">
                    {ec.club?.shield_url ? (
                      <img src={ec.club.shield_url} alt="" className="w-7 h-7 object-contain" />
                    ) : (
                      <Shield className="w-5 h-5 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-xs truncate">{ec.club?.name}</p>
                    {ec.group_name && (
                      <span className="text-[9px] font-bold text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                        Grupo {ec.group_name}
                      </span>
                    )}
                  </div>
                  {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => removeClub(ec.club_id)} className="h-7 w-7 p-0 text-muted-foreground/40 hover:text-destructive rounded-lg absolute top-1 right-1">
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Matches Section */}
        <section className="bg-card/50 backdrop-blur-sm rounded-2xl border border-white/[0.06] overflow-hidden animate-fade-in-up" style={{ animationDelay: '120ms' }}>
          <div className="flex items-center justify-between p-4 border-b border-white/[0.04] bg-white/[0.02]">
            <h2 className="text-sm font-bold text-foreground">Partidos ({matches.length})</h2>
            {canEdit && (
              <div className="flex items-center gap-2">
                {matches.length > 0 && (
                  <Button onClick={() => setIsDeleteMatchesOpen(true)} size="sm" variant="ghost" className="gap-1.5 rounded-xl h-8 text-destructive/60 hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button onClick={generateMatches} disabled={isGenerating || enrolledClubs.length < 2} size="sm" variant="outline" className="gap-1.5 rounded-xl h-8 border-white/[0.08]">
                  {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {matches.length > 0 ? 'Regenerar' : 'Generar'}
                </Button>
              </div>
            )}
          </div>

          {matches.length === 0 ? (
            <div className="text-center py-10">
              <Swords className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm font-medium">Sin partidos generados</p>
              {canEdit && <p className="text-xs text-muted-foreground/40 mt-1">Inscribe clubes y genera partidos</p>}
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              {matches.map((match, i) => {
                const isTBD = !match.home_club_id || !match.away_club_id
                return (
                  <div key={match.id} className={`flex items-center gap-2.5 px-4 py-2.5 border-b border-white/[0.03] last:border-0 ${isTBD ? 'opacity-40' : ''} hover:bg-white/[0.02] transition-colors`}>
                    <div className="w-6 h-6 rounded-md bg-white/[0.04] flex items-center justify-center text-[10px] font-bold text-muted-foreground/50 shrink-0">
                      {match.match_order}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className={`font-semibold truncate max-w-[80px] ${isTBD ? 'text-muted-foreground italic text-xs' : 'text-foreground'}`}>
                          {(match as any).home_club?.name || 'TBD'}
                        </span>
                        <span className="text-[10px] text-muted-foreground/30">vs</span>
                        <span className={`font-semibold truncate max-w-[80px] ${isTBD ? 'text-muted-foreground italic text-xs' : 'text-foreground'}`}>
                          {(match as any).away_club?.name || 'TBD'}
                        </span>
                      </div>
                      <p className="text-[9px] text-muted-foreground/40 truncate">{match.round_name}</p>
                    </div>
                    {isTBD && <span className="text-[9px] text-amber-500/80 bg-amber-500/8 px-1.5 py-0.5 rounded font-medium">TBD</span>}
                  </div>
                )
              })}
            </div>
          )}

          {matches.length > 0 && (
            <Link href={`/admin/seasons/${seasonId}/calendar`} className="flex items-center justify-center gap-2 p-3 border-t border-white/[0.04] bg-primary/5 text-primary font-semibold text-sm transition-colors hover:bg-primary/10 active:scale-[0.98]">
              <Play className="w-4 h-4" />Ver Calendario Global
            </Link>
          )}
        </section>
      </div>

      {/* Enroll Clubs Dialog */}
      <Dialog open={isEnrollOpen} onOpenChange={setIsEnrollOpen}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl bg-card/95 backdrop-blur-xl border-white/[0.08] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-foreground">Inscribir Clubes</DialogTitle>
            <DialogDescription className="sr-only">Selecciona los clubes que participarán en esta competición</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-2 space-y-2">
            {allClubs.map((club) => {
              const isSelected = selectedClubs.includes(club.id)
              return (
                <div key={club.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 cursor-pointer ${isSelected ? 'border-primary/40 bg-primary/8 shadow-md shadow-primary/5' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1]'}`} onClick={() => toggleClubSelection(club.id)}>
                  <Checkbox checked={isSelected} className="pointer-events-none" />
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center overflow-hidden ring-1 ring-white/[0.06]">
                    {club.shield_url ? (<img src={club.shield_url} alt="" className="w-6 h-6 object-contain" />) : (<Shield className="w-4 h-4 text-muted-foreground/40" />)}
                  </div>
                  <span className="flex-1 font-semibold text-sm text-foreground truncate">{club.name}</span>
                  {competition?.type === 'groups_knockout' && isSelected && (
                    <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                      <Select value={clubGroups[club.id] || 'A'} onValueChange={(value) => setClubGroups(prev => ({ ...prev, [club.id]: value }))}>
                        <SelectTrigger className="w-16 h-7 text-xs rounded-lg bg-purple-400/10 border-purple-400/20 text-purple-400"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-card/95 backdrop-blur-xl border-white/[0.08]">
                          {GROUP_LETTERS.slice(0, (competition.config as GroupsKnockoutConfig).groups_count || 4).map(letter => (<SelectItem key={letter} value={letter}>Grupo {letter}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <DialogFooter className="gap-2 sm:gap-2 border-t border-white/[0.06] pt-4">
            <DialogClose asChild><Button type="button" variant="ghost" className="rounded-xl">Cancelar</Button></DialogClose>
            <Button onClick={handleEnrollClubs} disabled={isSaving} className="rounded-xl shadow-lg shadow-primary/20">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Guardar ({selectedClubs.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Matches */}
      <AlertDialog open={isDeleteMatchesOpen} onOpenChange={setIsDeleteMatchesOpen}>
        <AlertDialogContent className="max-w-sm mx-4 rounded-2xl bg-card/95 backdrop-blur-xl border-white/[0.08]">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar partidos</AlertDialogTitle>
            <AlertDialogDescription>Se eliminarán todos los partidos generados. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteAllMatches} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Competition */}
      <AlertDialog open={isDeleteCompetitionOpen} onOpenChange={setIsDeleteCompetitionOpen}>
        <AlertDialogContent className="max-w-sm mx-4 rounded-2xl bg-card/95 backdrop-blur-xl border-white/[0.08]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />Eliminar Competición</AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              <span className="font-semibold text-foreground block mb-2">{competition?.name}</span>
              Esta acción eliminará permanentemente:
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>{enrolledClubs.length} clubes inscritos</li>
                <li>{matches.length} partidos</li>
                <li>Tabla de posiciones</li>
                <li>Estadísticas de jugadores</li>
              </ul>
              <span className="block mt-3 text-destructive font-semibold">Esta acción no se puede deshacer.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCompetition} disabled={isDeleting} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Eliminar Competición
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
