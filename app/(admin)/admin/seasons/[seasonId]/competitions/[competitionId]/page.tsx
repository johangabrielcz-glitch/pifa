'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Loader2, Shield, X, Users, Swords, Play, Trash2, RefreshCw, Lock, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import type { Competition, Club, CompetitionClub, Match, LeagueConfig, CupConfig, GroupsKnockoutConfig, Season } from '@/lib/types'

// Match generation utilities
function generateLeagueMatches(clubs: Club[], config: LeagueConfig): Partial<Match>[] {
  const n = clubs.length
  if (n < 2) return []
  
  const matches: Partial<Match>[] = []
  const teams = n % 2 === 0 ? [...clubs] : [...clubs, null]
  const totalTeams = teams.length
  
  // First round (round-robin)
  for (let round = 0; round < totalTeams - 1; round++) {
    for (let i = 0; i < totalTeams / 2; i++) {
      const home = teams[i]
      const away = teams[totalTeams - 1 - i]
      
      if (home && away) {
        matches.push({
          home_club_id: home.id,
          away_club_id: away.id,
          matchday: round + 1,
          round_name: `Jornada ${round + 1}`,
          leg: 1,
          status: 'scheduled',
        })
      }
    }
    // Rotate teams (first stays fixed)
    const last = teams.pop()!
    teams.splice(1, 0, last)
  }
  
  // Second round (if configured)
  if (config.rounds === 2) {
    const firstRoundCount = matches.length
    for (let i = 0; i < firstRoundCount; i++) {
      const m = matches[i]
      matches.push({
        home_club_id: m.away_club_id,
        away_club_id: m.home_club_id,
        matchday: (m.matchday || 0) + (totalTeams - 1),
        round_name: `Jornada ${(m.matchday || 0) + (totalTeams - 1)}`,
        leg: 2,
        status: 'scheduled',
      })
    }
  }
  
  return matches
}

// Helper function to get the next power of 2
function nextPowerOf2(n: number): number {
  if (n <= 1) return 2
  let power = 1
  while (power < n) power *= 2
  return power
}

function generateCupMatches(clubs: Club[], config: CupConfig): Partial<Match>[] {
  const n = clubs.length
  if (n < 2) return []
  
  const matches: Partial<Match>[] = []
  const roundNames: Record<number, string> = {
    2: 'Final',
    4: 'Semifinales',
    8: 'Cuartos de Final',
    16: 'Octavos de Final',
    32: 'Dieciseisavos de Final',
  }
  
  // Shuffle clubs for random seeding
  const shuffled = [...clubs].sort(() => Math.random() - 0.5)
  
  // Simple approach: pair clubs and create matches
  // First round: pair all clubs, some may have "byes" if odd number
  let matchday = 1
  
  // If odd number of clubs, one gets a bye (advances automatically)
  const clubsToPlay = n % 2 === 1 ? shuffled.slice(0, -1) : shuffled
  const firstRoundMatchCount = Math.floor(clubsToPlay.length / 2)
  
  // Calculate total rounds needed
  let remainingTeams = firstRoundMatchCount + (n % 2 === 1 ? 1 : 0) // Winners + bye
  if (firstRoundMatchCount === 0) remainingTeams = n
  
  // Determine first round name based on remaining teams after this round
  const getNextPowerOf2Teams = (teams: number) => {
    let p = 1
    while (p < teams) p *= 2
    return p
  }
  
  const effectiveBracketSize = getNextPowerOf2Teams(n)
  const firstRoundName = roundNames[effectiveBracketSize] || `Ronda de ${effectiveBracketSize}`
  
  // Generate first round with actual clubs
  for (let i = 0; i < firstRoundMatchCount; i++) {
    const homeClub = clubsToPlay[i * 2]?.id || null
    const awayClub = clubsToPlay[i * 2 + 1]?.id || null
    
    matches.push({
      home_club_id: homeClub,
      away_club_id: awayClub,
      matchday: matchday,
      round_name: config.legs === 2 ? `${firstRoundName} - Ida` : firstRoundName,
      leg: 1,
      status: 'scheduled',
    })
    
    if (config.legs === 2) {
      matches.push({
        home_club_id: awayClub,
        away_club_id: homeClub,
        matchday: matchday,
        round_name: `${firstRoundName} - Vuelta`,
        leg: 2,
        status: 'scheduled',
      })
    }
  }
  
  // Generate future rounds (all TBD)
  let teamsInNextRound = firstRoundMatchCount + (n - clubsToPlay.length) // winners + byes
  matchday++
  
  while (teamsInNextRound >= 2) {
    const matchesInRound = Math.floor(teamsInNextRound / 2)
    const roundName = roundNames[teamsInNextRound] || `Ronda de ${teamsInNextRound}`
    
    for (let i = 0; i < matchesInRound; i++) {
      matches.push({
        home_club_id: null,
        away_club_id: null,
        matchday: matchday,
        round_name: config.legs === 2 ? `${roundName} - Ida` : roundName,
        leg: 1,
        status: 'scheduled',
      })
      
      if (config.legs === 2) {
        matches.push({
          home_club_id: null,
          away_club_id: null,
          matchday: matchday,
          round_name: `${roundName} - Vuelta`,
          leg: 2,
          status: 'scheduled',
        })
      }
    }
    
    teamsInNextRound = matchesInRound + (teamsInNextRound % 2) // winners + potential bye
    matchday++
  }
  
  return matches
}

function generateGroupsMatches(clubs: CompetitionClub[], config: GroupsKnockoutConfig): Partial<Match>[] {
  const matches: Partial<Match>[] = []
  
  // Group clubs by group_name
  const groups: Record<string, CompetitionClub[]> = {}
  clubs.forEach(c => {
    const g = c.group_name || 'A'
    if (!groups[g]) groups[g] = []
    groups[g].push(c)
  })
  
  // Generate round-robin matches for each group
  let matchdayOffset = 0
  Object.entries(groups).forEach(([groupName, groupClubs]) => {
    const n = groupClubs.length
    if (n < 2) return
    
    const teams = n % 2 === 0 ? [...groupClubs] : [...groupClubs, null]
    const totalTeams = teams.length
    
    for (let round = 0; round < totalTeams - 1; round++) {
      for (let i = 0; i < totalTeams / 2; i++) {
        const home = teams[i]
        const away = teams[totalTeams - 1 - i]
        
        if (home && away) {
          matches.push({
            home_club_id: home.club_id,
            away_club_id: away.club_id,
            matchday: round + 1 + matchdayOffset,
            round_name: `Grupo ${groupName} - J${round + 1}`,
            group_name: groupName,
            leg: 1,
            status: 'scheduled',
          })
        }
      }
      const last = teams.pop()!
      teams.splice(1, 0, last)
    }
    matchdayOffset += totalTeams - 1
  })
  
  // Generate K.O. empty matches
  const totalGroups = Object.keys(groups).length
  const teamsPerGroup = config.teams_advance_per_group || 2
  const totalAdvancing = totalGroups * teamsPerGroup
  
  // Calculate K.O. bracket size (must be power of 2)
  const bracketSize = nextPowerOf2(totalAdvancing)
  
  const roundNames: Record<number, string> = {
    2: 'Final',
    4: 'Semifinales',
    8: 'Cuartos de Final',
    16: 'Octavos de Final',
    32: 'Dieciseisavos de Final',
  }
  
  // Generate empty K.O. matches from bracket size down to final
  let currentTeams = bracketSize
  let koMatchday = matchdayOffset + 1
  
  while (currentTeams >= 2) {
    const roundName = roundNames[currentTeams] || `Ronda de ${currentTeams}`
    const matchesInRound = Math.floor(currentTeams / 2)
    
    for (let i = 0; i < matchesInRound; i++) {
      matches.push({
        home_club_id: null, // TBD - Por definir
        away_club_id: null, // TBD - Por definir
        matchday: koMatchday,
        round_name: config.knockout_legs === 2 ? `${roundName} - Ida` : roundName,
        group_name: null,
        leg: 1,
        status: 'scheduled',
      })
      
      if (config.knockout_legs === 2) {
        matches.push({
          home_club_id: null,
          away_club_id: null,
          matchday: koMatchday,
          round_name: `${roundName} - Vuelta`,
          group_name: null,
          leg: 2,
          status: 'scheduled',
        })
      }
    }
    
    currentTeams = Math.floor(currentTeams / 2)
    koMatchday++
  }
  
  return matches
}

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

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
  
  // Check if editing is allowed (only in draft mode)
  const canEdit = season?.status === 'draft'

  const loadData = async () => {
    setIsLoading(true)
    
    // Load season first to check status
    const { data: seasonData } = await supabase
      .from('seasons')
      .select('*')
      .eq('id', seasonId)
      .single()
    
    if (seasonData) {
      setSeason(seasonData)
    }
    
    // Load competition
    const { data: compData, error: compError } = await supabase
      .from('competitions')
      .select('*')
      .eq('id', competitionId)
      .single()
    
    if (compError || !compData) {
      toast.error('Competicion no encontrada')
      router.push(`/admin/seasons/${seasonId}`)
      return
    }
    setCompetition(compData)
    
    // Load enrolled clubs with club details
    const { data: enrolledData } = await supabase
      .from('competition_clubs')
      .select('*, club:clubs(*)')
      .eq('competition_id', competitionId)
      .order('group_name', { ascending: true })
    
    if (enrolledData) {
      setEnrolledClubs(enrolledData)
    }
    
    // Load all clubs
    const { data: allClubsData } = await supabase
      .from('clubs')
      .select('*')
      .order('name')
    
    if (allClubsData) {
      setAllClubs(allClubsData)
    }
    
    // Load matches with club details
    const { data: matchesData } = await supabase
      .from('matches')
      .select('*, home_club:clubs!matches_home_club_id_fkey(*), away_club:clubs!matches_away_club_id_fkey(*)')
      .eq('competition_id', competitionId)
      .order('match_order', { ascending: true })
    
    if (matchesData) {
      setMatches(matchesData)
    }
    
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [competitionId])

  const openEnrollDialog = () => {
    if (!canEdit) return
    // Pre-select already enrolled clubs
    setSelectedClubs(enrolledClubs.map(c => c.club_id))
    // Pre-set groups
    const groups: Record<string, string> = {}
    enrolledClubs.forEach(c => {
      if (c.group_name) groups[c.club_id] = c.group_name
    })
    setClubGroups(groups)
    setIsEnrollOpen(true)
  }

  const toggleClubSelection = (clubId: string) => {
    setSelectedClubs(prev => {
      if (prev.includes(clubId)) {
        return prev.filter(id => id !== clubId)
      } else {
        // Initialize group to 'A' when selecting a club for groups_knockout
        if (competition?.type === 'groups_knockout' && !clubGroups[clubId]) {
          setClubGroups(g => ({ ...g, [clubId]: 'A' }))
        }
        return [...prev, clubId]
      }
    })
  }

  const handleEnrollClubs = async () => {
    if (!canEdit) return
    setIsSaving(true)
    
    try {
      // 1. Get currently enrolled clubs to track changes
      const previousEnrolled = enrolledClubs.map(ec => ec.club_id)
      const newlyEnrolled = selectedClubs.filter(id => !previousEnrolled.includes(id))
      const removedClubs = previousEnrolled.filter(id => !selectedClubs.includes(id))
      
      // 2. Delete standings and player_stats for removed clubs
      if (removedClubs.length > 0) {
        await supabase
          .from('standings')
          .delete()
          .eq('competition_id', competitionId)
          .in('club_id', removedClubs)
        
        await supabase
          .from('player_competition_stats')
          .delete()
          .eq('competition_id', competitionId)
          .in('club_id', removedClubs)
      }
      
      // 3. Delete all current enrollments
      await supabase
        .from('competition_clubs')
        .delete()
        .eq('competition_id', competitionId)
      
      // 4. Insert new enrollments
      if (selectedClubs.length > 0) {
        const inserts = selectedClubs.map((clubId, index) => ({
          competition_id: competitionId,
          club_id: clubId,
          group_name: competition?.type === 'groups_knockout' ? (clubGroups[clubId] || 'A') : null,
          seed: index + 1,
        }))
        
        const { error } = await supabase
          .from('competition_clubs')
          .insert(inserts)
        
        if (error) throw error
        
        // 5. Create standings for newly enrolled clubs
        if (newlyEnrolled.length > 0) {
          const standingsInserts = newlyEnrolled.map(clubId => ({
            competition_id: competitionId,
            club_id: clubId,
            stage_id: null,
            group_name: competition?.type === 'groups_knockout' ? (clubGroups[clubId] || 'A') : null,
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goals_for: 0,
            goals_against: 0,
            goal_difference: 0,
            points: 0,
            position: null,
          }))
          
          // Insert standings one by one to avoid conflicts
          for (const standing of standingsInserts) {
            const { error } = await supabase
              .from('standings')
              .insert(standing)
            if (error && !error.message.includes('duplicate')) {
              console.error('Error inserting standing:', error)
            }
          }
        }
        
        // 6. Create player_competition_stats for players of newly enrolled clubs
        if (newlyEnrolled.length > 0) {
          const { data: players } = await supabase
            .from('players')
            .select('id, club_id')
            .in('club_id', newlyEnrolled)
          
          if (players && players.length > 0) {
            const playerStatsInserts = players.map(player => ({
              competition_id: competitionId,
              player_id: player.id,
              club_id: player.club_id,
              matches_played: 0,
              goals: 0,
              assists: 0,
              mvp_count: 0,
              yellow_cards: 0,
              red_cards: 0,
              minutes_played: 0,
            }))
            
            for (const stat of playerStatsInserts) {
              const { error } = await supabase
                .from('player_competition_stats')
                .insert(stat)
              if (error && !error.message.includes('duplicate')) {
                console.error('Error inserting player stat:', error)
              }
            }
          }
        }
      }
      
      toast.success('Clubes actualizados')
      setIsEnrollOpen(false)
      loadData()
    } catch (error) {
      console.error('Error enrolling clubs:', error)
      toast.error('Error al guardar clubes')
    } finally {
      setIsSaving(false)
    }
  }

  const generateMatches = async () => {
    if (!canEdit || !competition || enrolledClubs.length < 2) {
      toast.error('Se necesitan al menos 2 clubes')
      return
    }
    
    setIsGenerating(true)
    
    try {
      // 1. Delete existing matches for this competition first
      if (matches.length > 0) {
        await supabase
          .from('matches')
          .delete()
          .eq('competition_id', competitionId)
      }
      
      let newMatches: Partial<Match>[] = []
      
      // Get club details for generation
      const clubsForGen = enrolledClubs.map(ec => ec.club as Club).filter(Boolean)
      
      switch (competition.type) {
        case 'league':
          newMatches = generateLeagueMatches(clubsForGen, competition.config as LeagueConfig)
          break
        case 'cup':
          newMatches = generateCupMatches(clubsForGen, competition.config as CupConfig)
          break
        case 'groups_knockout':
          newMatches = generateGroupsMatches(enrolledClubs, competition.config as GroupsKnockoutConfig)
          break
      }
      
      if (newMatches.length === 0) {
        toast.error('No se pudieron generar partidos')
        setIsGenerating(false)
        return
      }
      
      // 2. Get max order from OTHER competitions in same season
      const { data: seasonComps } = await supabase
        .from('competitions')
        .select('id')
        .eq('season_id', seasonId)
        .neq('id', competitionId)
      
      let maxOrder = 0
      if (seasonComps && seasonComps.length > 0) {
        const { data: otherMatches } = await supabase
          .from('matches')
          .select('match_order')
          .in('competition_id', seasonComps.map(c => c.id))
          .order('match_order', { ascending: false })
          .limit(1)
        
        if (otherMatches && otherMatches.length > 0) {
          maxOrder = otherMatches[0].match_order || 0
        }
      }
      
      // 3. Assign sequential match_order starting from maxOrder + 1
      const matchesWithOrder = newMatches.map((m, i) => ({
        ...m,
        competition_id: competitionId,
        match_order: maxOrder + i + 1,
      }))
      
      const { error } = await supabase
        .from('matches')
        .insert(matchesWithOrder)
      
      if (error) throw error
      
      toast.success(`${matchesWithOrder.length} partidos generados`)
      loadData()
    } catch (error) {
      console.error(error)
      toast.error('Error al generar partidos')
    } finally {
      setIsGenerating(false)
    }
  }

  const deleteAllMatches = async () => {
    if (!canEdit) return
    try {
      const { error } = await supabase
        .from('matches')
        .delete()
        .eq('competition_id', competitionId)
      
      if (error) throw error
      
      toast.success('Partidos eliminados')
      setIsDeleteMatchesOpen(false)
      loadData()
    } catch (error) {
      toast.error('Error al eliminar partidos')
    }
  }

  const removeClub = async (clubId: string) => {
    if (!canEdit) return
    try {
      const { error } = await supabase
        .from('competition_clubs')
        .delete()
        .eq('competition_id', competitionId)
        .eq('club_id', clubId)
      
      if (error) throw error
      toast.success('Club eliminado de la competicion')
      loadData()
    } catch (error) {
      toast.error('Error al eliminar club')
    }
  }

  const handleDeleteCompetition = async () => {
    setIsDeleting(true)
    try {
      // Delete in order: player_stats -> standings -> matches -> competition_clubs -> competition
      await supabase.from('player_competition_stats').delete().eq('competition_id', competitionId)
      await supabase.from('standings').delete().eq('competition_id', competitionId)
      await supabase.from('matches').delete().eq('competition_id', competitionId)
      await supabase.from('competition_clubs').delete().eq('competition_id', competitionId)
      await supabase.from('competition_stages').delete().eq('competition_id', competitionId)
      
      const { error } = await supabase.from('competitions').delete().eq('id', competitionId)
      if (error) throw error
      
      toast.success('Competicion eliminada')
      router.push(`/admin/seasons/${seasonId}`)
    } catch (error) {
      console.error(error)
      toast.error('Error al eliminar competicion')
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-dvh safe-area-top">
      {/* Header */}
      <header className="sticky top-[57px] z-30 bg-background/95 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <Link href={`/admin/seasons/${seasonId}`} className="p-2 -ml-2 rounded-xl touch-active">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Link>
            <div>
              <h1 className="font-bold text-foreground truncate max-w-[160px]">{competition?.name}</h1>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground capitalize">
                  {competition?.type === 'league' ? 'Liga' : competition?.type === 'cup' ? 'Copa' : 'Grupos + K.O.'}
                </p>
                {!canEdit && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                    <Lock className="w-3 h-3" />
                    Bloqueado
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDeleteCompetitionOpen(true)}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Read-only banner */}
      {!canEdit && (
        <div className="mx-4 mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3">
          <Lock className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-500">Temporada Activa</p>
            <p className="text-xs text-amber-500/80">La configuracion esta bloqueada. Solo puedes ver la informacion.</p>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="px-4 py-4 pb-24 space-y-6">
        
        {/* Enrolled Clubs Section */}
        <section className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
            <h2 className="text-sm font-semibold text-foreground">
              Clubes Inscritos ({enrolledClubs.length})
            </h2>
            {canEdit && (
              <Button onClick={openEnrollDialog} size="sm" variant="outline" className="gap-1.5 rounded-xl h-8">
                <Plus className="w-3.5 h-3.5" />
                Inscribir
              </Button>
            )}
          </div>
          
          {enrolledClubs.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Sin clubes inscritos</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {enrolledClubs.map((ec) => (
                <div key={ec.id} className="flex items-center gap-3 p-3">
                  <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden">
                    {ec.club?.shield_url ? (
                      <img src={ec.club.shield_url} alt="" className="w-8 h-8 object-contain" />
                    ) : (
                      <Shield className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">{ec.club?.name}</p>
                    {ec.group_name && (
                      <p className="text-xs text-muted-foreground">Grupo {ec.group_name}</p>
                    )}
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeClub(ec.club_id)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Matches Section */}
        <section className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
            <h2 className="text-sm font-semibold text-foreground">
              Partidos ({matches.length})
            </h2>
            {canEdit && (
              <div className="flex items-center gap-2">
                {matches.length > 0 && (
                  <Button 
                    onClick={() => setIsDeleteMatchesOpen(true)} 
                    size="sm" 
                    variant="ghost" 
                    className="gap-1.5 rounded-xl h-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button 
                  onClick={generateMatches} 
                  disabled={isGenerating || enrolledClubs.length < 2}
                  size="sm" 
                  variant="outline" 
                  className="gap-1.5 rounded-xl h-8"
                >
                  {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {matches.length > 0 ? 'Regenerar' : 'Generar'}
                </Button>
              </div>
            )}
          </div>

          {matches.length === 0 ? (
            <div className="text-center py-8">
              <Swords className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Sin partidos generados</p>
              {canEdit && (
                <p className="text-xs text-muted-foreground/70 mt-1">Inscribe clubes y genera partidos</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
              {matches.map((match) => {
                const isTBD = !match.home_club_id || !match.away_club_id
                return (
                  <div key={match.id} className={`flex items-center gap-2 p-3 ${isTBD ? 'bg-muted/20' : ''}`}>
                    <div className="w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center text-xs font-medium text-muted-foreground">
                      {match.match_order}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`font-medium truncate max-w-[80px] ${isTBD ? 'text-muted-foreground italic' : 'text-foreground'}`}>
                          {match.home_club?.name || 'Por definir'}
                        </span>
                        <span className="text-muted-foreground">vs</span>
                        <span className={`font-medium truncate max-w-[80px] ${isTBD ? 'text-muted-foreground italic' : 'text-foreground'}`}>
                          {match.away_club?.name || 'Por definir'}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{match.round_name}</p>
                    </div>
                    {isTBD && (
                      <span className="text-[10px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">TBD</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {matches.length > 0 && (
            <Link
              href={`/admin/seasons/${seasonId}/calendar`}
              className="flex items-center justify-center gap-2 p-3 border-t border-border bg-primary/5 text-primary font-medium text-sm touch-active hover:bg-primary/10 transition-colors"
            >
              <Play className="w-4 h-4" />
              Ver Calendario Global
            </Link>
          )}
        </section>
      </div>

      {/* Enroll Clubs Dialog */}
      <Dialog open={isEnrollOpen} onOpenChange={setIsEnrollOpen}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl bg-card max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-foreground">Inscribir Clubes</DialogTitle>
            <DialogDescription className="sr-only">
              Selecciona los clubes que participaran en esta competicion
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto py-2 space-y-2">
            {allClubs.map((club) => {
              const isSelected = selectedClubs.includes(club.id)
              return (
                <div 
                  key={club.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                    isSelected ? 'border-primary bg-primary/10' : 'border-border bg-muted/30'
                  }`}
                  onClick={() => toggleClubSelection(club.id)}
                >
                  <Checkbox checked={isSelected} className="pointer-events-none" />
                  <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden">
                    {club.shield_url ? (
                      <img src={club.shield_url} alt="" className="w-6 h-6 object-contain" />
                    ) : (
                      <Shield className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <span className="flex-1 font-medium text-sm text-foreground truncate">{club.name}</span>
                  
                  {/* Group selector for groups_knockout format */}
                  {competition?.type === 'groups_knockout' && isSelected && (
                    <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                      <Select
                        value={clubGroups[club.id] || 'A'}
                        onValueChange={(value) => setClubGroups(prev => ({ ...prev, [club.id]: value }))}
                      >
                        <SelectTrigger className="w-16 h-7 text-xs rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GROUP_LETTERS.slice(0, (competition.config as GroupsKnockoutConfig).groups_count || 4).map(letter => (
                            <SelectItem key={letter} value={letter}>Grupo {letter}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          
          <DialogFooter className="gap-2 sm:gap-2 border-t border-border pt-4">
            <DialogClose asChild>
              <Button type="button" variant="ghost" className="rounded-xl">
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={handleEnrollClubs} disabled={isSaving} className="rounded-xl">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Guardar ({selectedClubs.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Matches Confirmation */}
      <AlertDialog open={isDeleteMatchesOpen} onOpenChange={setIsDeleteMatchesOpen}>
        <AlertDialogContent className="max-w-sm mx-4 rounded-2xl bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar partidos</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminaran todos los partidos generados. Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteAllMatches} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Competition Confirmation */}
      <AlertDialog open={isDeleteCompetitionOpen} onOpenChange={setIsDeleteCompetitionOpen}>
        <AlertDialogContent className="max-w-sm mx-4 rounded-2xl bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Eliminar Competicion
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              <span className="font-medium text-foreground block mb-2">{competition?.name}</span>
              Esta accion eliminara permanentemente:
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>{enrolledClubs.length} clubes inscritos</li>
                <li>{matches.length} partidos</li>
                <li>Tabla de posiciones</li>
                <li>Estadisticas de jugadores</li>
              </ul>
              <span className="block mt-3 text-destructive font-medium">Esta accion no se puede deshacer.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteCompetition} 
              disabled={isDeleting}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Eliminar Competicion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
