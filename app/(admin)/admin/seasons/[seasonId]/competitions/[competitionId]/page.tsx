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
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0A0A0A]/80 backdrop-blur-2xl border-b border-white/[0.04]">
        <div className="flex items-center justify-between px-6 py-4 h-16">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.back()} 
              className="w-10 h-10 rounded-xl bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white hover:border-[#FF3131]/40 transition-all active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-black text-white uppercase tracking-tight truncate max-w-[200px]">{competition?.name}</h1>
              <div className="flex items-center gap-2">
                <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${typeColor.text} bg-white/5 border-white/10`}>
                  {TYPE_LABELS[competition?.type || '']}
                </span>
                {!canEdit && (
                  <span className="flex items-center gap-1 text-[8px] text-amber-500 font-black uppercase tracking-[0.2em]">
                    <Lock className="w-2.5 h-2.5" /> BLOQUEADO
                  </span>
                )}
              </div>
            </div>
          </div>
          <button 
            onClick={() => setIsDeleteCompetitionOpen(true)} 
            className="w-10 h-10 rounded-full bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-red-500/60 hover:text-red-500 hover:border-red-500/40 hover:bg-red-500/10 transition-all active:scale-90"
          >
            <Trash2 className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      <div className="px-6 py-6 pb-32 space-y-6">
        {/* Competition Stats Board */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#141414]/50 backdrop-blur-xl rounded-[28px] p-5 border border-white/[0.04] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-[#FF3131]/5 rounded-full blur-2xl group-hover:bg-[#FF3131]/10 transition-colors" />
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center mb-3">
                <Users className="w-5 h-5 text-[#FF3131]" />
              </div>
              <p className="text-2xl font-black text-white leading-none tabular-nums">{enrolledClubs.length}</p>
              <p className="text-[9px] text-[#6A6C6E] font-black uppercase tracking-widest mt-2 px-1 bg-white/5 w-fit rounded py-0.5">CLUBES INSCRITOS</p>
            </div>
          </div>
          <div className="bg-[#141414]/50 backdrop-blur-xl rounded-[28px] p-5 border border-white/[0.04] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-[#FF3131]/5 rounded-full blur-2xl group-hover:bg-[#FF3131]/10 transition-colors" />
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center mb-3">
                <Swords className="w-5 h-5 text-[#FF3131]" />
              </div>
              <p className="text-2xl font-black text-white leading-none tabular-nums">{matches.length}</p>
              <p className="text-[9px] text-[#6A6C6E] font-black uppercase tracking-widest mt-2 px-1 bg-white/5 w-fit rounded py-0.5">PARTIDOS COORD.</p>
            </div>
          </div>
        </div>

        {!canEdit && (
          <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-center gap-4 animate-fade-in-up">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
              <Lock className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-[10px] text-white font-black uppercase tracking-widest">SISTEMA EN MODO LECTURA</p>
              <p className="text-[9px] text-amber-500/60 font-medium uppercase tracking-tight mt-0.5">La configuración está sellada por el estado de la temporada.</p>
            </div>
          </div>
        )}

        {/* Enrolled Clubs Section */}
        <section className="bg-[#141414]/30 backdrop-blur-xl rounded-[32px] border border-white/[0.04] overflow-hidden">
          <div className="px-6 py-5 flex items-center justify-between border-b border-white/[0.04] bg-[#0A0A0A]/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#FF3131]/10 flex items-center justify-center">
                <Shield size={16} className="text-[#FF3131]" />
              </div>
              <h2 className="text-xs font-black text-white uppercase tracking-[0.15em]">LISTA DE PARTICIPANTES</h2>
            </div>
            {canEdit && (
              <button 
                onClick={openEnrollDialog} 
                className="h-8 px-4 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-lg flex items-center gap-2 font-black uppercase tracking-widest text-[9px] transition-all active:scale-95"
              >
                <Plus size={14} /> Inscribir
              </button>
            )}
          </div>
          
          <div className="p-4">
            {enrolledClubs.length === 0 ? (
              <div className="py-12 text-center">
                <Users className="w-12 h-12 text-[#2D2D2D] mx-auto mb-4" />
                <p className="text-[10px] text-[#6A6C6E] font-black uppercase tracking-[0.2em]">SIN ENTIDADES VINCULADAS</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {enrolledClubs.map((ec) => (
                  <div key={ec.id} className="relative bg-[#0A0A0A]/50 rounded-2xl p-3 flex items-center justify-between group border border-white/[0.02] hover:border-[#FF3131]/20 transition-all">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-black border border-[#202020] flex items-center justify-center p-2 shrink-0">
                        {ec.club?.shield_url ? (
                          <img src={ec.club.shield_url} alt="" className="w-full h-full object-contain filter grayscale group-hover:grayscale-0 transition-all" />
                        ) : (
                          <Shield size={18} className="text-[#2D2D2D]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-white text-[11px] uppercase tracking-tight truncate">{ec.club?.name}</p>
                        {ec.group_name && (
                          <span className="text-[8px] font-black text-[#FF3131] bg-[#FF3131]/10 px-2 py-0.5 rounded-md mt-1 inline-block border border-[#FF3131]/10">
                            GRUPO {ec.group_name}
                          </span>
                        )}
                      </div>
                    </div>
                    {canEdit && (
                      <button 
                        onClick={() => removeClub(ec.club_id)} 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[#6A6C6E] hover:text-red-500 hover:bg-red-500/10 transition-all"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Matches Control Panel */}
        <section className="bg-[#141414]/30 backdrop-blur-xl rounded-[32px] border border-white/[0.04] overflow-hidden">
          <div className="px-6 py-5 flex items-center justify-between border-b border-white/[0.04] bg-[#0A0A0A]/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#FF3131]/10 flex items-center justify-center">
                <Swords size={16} className="text-[#FF3131]" />
              </div>
              <h2 className="text-xs font-black text-white uppercase tracking-[0.15em]">NÚCLEO DE PARTIDOS</h2>
            </div>
            {canEdit && (
              <div className="flex items-center gap-2">
                {matches.length > 0 && (
                  <button 
                    onClick={() => setIsDeleteMatchesOpen(true)} 
                    className="w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-red-500/60 hover:text-red-500 hover:border-red-500/30 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <button 
                  onClick={generateMatches} 
                  disabled={isGenerating || enrolledClubs.length < 2} 
                  className="h-8 px-4 bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/[0.08] rounded-lg flex items-center gap-2 font-black uppercase tracking-widest text-[9px] transition-all active:scale-95 disabled:opacity-30"
                >
                  {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  {matches.length > 0 ? 'Regenerar' : 'Generar'}
                </button>
              </div>
            )}
          </div>

          <div className="p-4">
            {matches.length === 0 ? (
              <div className="py-12 text-center">
                <Swords className="w-12 h-12 text-[#2D2D2D] mx-auto mb-4" />
                <p className="text-[10px] text-[#6A6C6E] font-black uppercase tracking-[0.2em]">GENERADOR EN ESPERA</p>
                {canEdit && <p className="text-[8px] text-[#2D2D2D] font-black uppercase mt-2">VINCULA CLUBES PARA INICIAR EL CÁLCULO</p>}
              </div>
            ) : (
              <div className="max-h-[350px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                {matches.map((match, i) => {
                  const isTBD = !match.home_club_id || !match.away_club_id
                  return (
                    <div key={match.id} className={`flex items-center gap-4 p-3 rounded-2xl bg-[#0A0A0A]/40 border border-white/[0.02] ${isTBD ? 'opacity-40 grayscale' : 'hover:border-[#FF3131]/20'} transition-all`}>
                      <div className="w-8 h-8 rounded-lg bg-black border border-[#202020] flex items-center justify-center text-[10px] font-black text-[#6A6C6E] shrink-0 tabular-nums">
                        {match.match_order}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-tight text-white">
                          <span className="truncate max-w-[90px]">{(match as any).home_club?.name || 'TBD'}</span>
                          <span className="text-[#2D2D2D]">VS</span>
                          <span className="truncate max-w-[90px]">{(match as any).away_club?.name || 'TBD'}</span>
                        </div>
                        <p className="text-[8px] text-[#2D2D2D] font-black uppercase tracking-widest mt-1">{match.round_name}</p>
                      </div>
                      {isTBD && <span className="text-[7px] font-black text-[#FF3131] bg-[#FF3131]/10 px-2 py-0.5 rounded border border-[#FF3131]/20 uppercase tracking-widest">TBD</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {matches.length > 0 && (
            <Link 
              href={`/admin/seasons/${seasonId}/calendar`} 
              className="flex items-center justify-center gap-3 p-5 bg-[#FF3131]/5 hover:bg-[#FF3131]/10 border-t border-white/[0.04] text-[#FF3131] font-black uppercase tracking-[0.2em] text-[10px] transition-all"
            >
              <Play size={16} /> Ver Calendario Global
            </Link>
          )}
        </section>
      </div>

      {/* Modern Ruby Dialog - Enroll Clubes */}
      <Dialog open={isEnrollOpen} onOpenChange={setIsEnrollOpen}>
        <DialogContent className="max-w-md mx-4 rounded-[32px] bg-[#141414]/95 backdrop-blur-2xl border-white/[0.08] p-0 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          <div className="p-8 pb-4">
            <DialogHeader className="mb-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center shadow-xl mx-auto mb-6 text-[#FF3131]">
                <Users size={24} />
              </div>
              <DialogTitle className="text-xl font-black text-white uppercase tracking-tighter">INSCRIBIR <span className="text-[#FF3131]">CLUBES</span></DialogTitle>
            </DialogHeader>
          </div>
          
          <div className="flex-1 overflow-y-auto px-8 py-2 space-y-2 custom-scrollbar">
            {allClubs.map((club) => {
              const isSelected = selectedClubs.includes(club.id)
              return (
                <div 
                  key={club.id} 
                  className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 cursor-pointer ${
                    isSelected 
                      ? 'border-[#FF3131]/40 bg-[#FF3131]/10 shadow-[0_0_20px_rgba(255,49,49,0.1)]' 
                      : 'border-white/[0.04] bg-black/40 hover:bg-black/60 hover:border-white/[0.1]'
                  }`} 
                  onClick={() => toggleClubSelection(club.id)}
                >
                  <Checkbox checked={isSelected} className="pointer-events-none rounded-md border-white/20 data-[state=checked]:bg-[#FF3131] data-[state=checked]:border-[#FF3131]" />
                  <div className="w-10 h-10 rounded-xl bg-black border border-[#202020] flex items-center justify-center p-2 shrink-0">
                    {club.shield_url ? (<img src={club.shield_url} alt="" className="w-full h-full object-contain" />) : (<Shield size={18} className="text-[#2D2D2D]" />)}
                  </div>
                  <span className="flex-1 font-black text-white uppercase tracking-tight text-xs truncate">{club.name}</span>
                  {competition?.type === 'groups_knockout' && isSelected && (
                    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                      <Select value={clubGroups[club.id] || 'A'} onValueChange={(value) => setClubGroups(prev => ({ ...prev, [club.id]: value }))}>
                        <SelectTrigger className="w-20 h-8 text-[9px] font-black font-sans rounded-xl bg-black border-[#202020] text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#141414] border-white/[0.08] min-w-[100px]">
                          {GROUP_LETTERS.slice(0, (competition.config as GroupsKnockoutConfig).groups_count || 4).map(letter => (
                             <SelectItem key={letter} value={letter} className="text-[10px] font-black uppercase py-2">Grupo {letter}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="p-8 bg-[#0A0A0A]/50 border-t border-white/[0.04] flex gap-4">
            <DialogClose asChild>
              <button className="flex-1 h-14 border border-[#202020] text-[#6A6C6E] hover:text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] transition-all">Cancelar</button>
            </DialogClose>
            <button 
              onClick={handleEnrollClubs} 
              disabled={isSaving} 
              className="flex-1 h-14 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] shadow-[0_0_30px_rgba(255,49,49,0.3)] transition-all active:scale-95 disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin mx-auto" /> : `Sellar (${selectedClubs.length})`}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Matches Alert */}
      <AlertDialog open={isDeleteMatchesOpen} onOpenChange={setIsDeleteMatchesOpen}>
        <AlertDialogContent className="max-w-sm mx-4 rounded-[32px] bg-[#141414] border-white/[0.08] p-8 shadow-2xl">
          <AlertDialogHeader className="mb-6">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-8 h-8 text-red-500" />
            </div>
            <AlertDialogTitle className="text-xl font-black text-white uppercase tracking-tighter text-center">PURGAR <span className="text-red-500">PARTIDOS</span></AlertDialogTitle>
            <AlertDialogDescription className="text-center text-xs text-[#6A6C6E] font-bold uppercase tracking-widest mt-2 px-4 leading-relaxed">
              ESTA ACCIÓN ELIMINARÁ TODOS LOS PARTIDOS CALCULADOS. TODOS LOS RESULTADOS ACTUALES SE PERDERÁN.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
            <AlertDialogCancel className="flex-1 h-14 bg-[#0A0A0A] border border-[#202020] text-[#6A6C6E] hover:text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] m-0">No</AlertDialogCancel>
            <AlertDialogAction onClick={deleteAllMatches} className="flex-1 h-14 bg-red-600 hover:bg-red-700 text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] shadow-[0_0_30px_rgba(220,38,38,0.3)] m-0">Confirmar</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Competition Alert */}
      <AlertDialog open={isDeleteCompetitionOpen} onOpenChange={setIsDeleteCompetitionOpen}>
        <AlertDialogContent className="max-w-sm mx-4 rounded-[32px] bg-[#141414] border-white/[0.08] p-8 shadow-2xl">
          <AlertDialogHeader className="mb-6">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <AlertDialogTitle className="text-xl font-black text-white uppercase tracking-tighter text-center">ELIMINAR <span className="text-red-500">COMPETICIÓN</span></AlertDialogTitle>
            <AlertDialogDescription className="text-center text-[10px] text-[#6A6C6E] font-bold uppercase tracking-widest mt-2 px-4 leading-relaxed">
              ESTÁS POR PURGAR <span className="text-white font-black">{competition?.name}</span>. ESTO ELIMINARÁ PERMANENTEMENTE CLUBES INSCRITOS, PARTIDOS Y ESTADÍSTICAS GENERADAS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
            <AlertDialogCancel className="flex-1 h-14 bg-[#0A0A0A] border border-[#202020] text-[#6A6C6E] hover:text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] m-0 text-center">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCompetition} disabled={isDeleting} className="flex-1 h-14 bg-red-600 hover:bg-red-700 text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] shadow-[0_0_30px_rgba(220,38,38,0.3)] m-0">
               {isDeleting ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Confirmar Purgado'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
  )
}
