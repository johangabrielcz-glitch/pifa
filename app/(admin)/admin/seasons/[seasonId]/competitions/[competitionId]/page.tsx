'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Loader2, Shield, X, Users, Swords, Play, Trash2, RefreshCw, Lock, AlertTriangle, Trophy, LayoutList, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import type { Competition, Club, CompetitionClub, Match, LeagueConfig, CupConfig, GroupsKnockoutConfig, Season } from '@/lib/types'

// ============================================================
// Match generation utilities
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
      const isFinal = teamsInNextRound === 2
      const useTwoLegs = config.legs === 2 && !isFinal
      matches.push({ home_club_id: null, away_club_id: null, matchday, round_name: useTwoLegs ? `${roundName} - Ida` : roundName, leg: 1, status: 'scheduled' })
      if (useTwoLegs) { matches.push({ home_club_id: null, away_club_id: null, matchday, round_name: `${roundName} - Vuelta`, leg: 2, status: 'scheduled' }) }
    }
    teamsInNextRound = matchesInRound + (teamsInNextRound % 2); matchday++
  }
  return matches
}

function generateGroupsMatches(clubs: CompetitionClub[], config: GroupsKnockoutConfig): Partial<Match>[] {
  const matches: Partial<Match>[] = []
  const groups: Record<string, CompetitionClub[]> = {}
  clubs.forEach(c => { const g = c.group_name || 'A'; if (!groups[g]) groups[g] = []; groups[g].push(c) })
  let maxGroupRounds = 0
  Object.entries(groups).forEach(([groupName, groupClubs]) => {
    const n = groupClubs.length; if (n < 2) return
    const teams = n % 2 === 0 ? [...groupClubs] : [...groupClubs, null]; const totalTeams = teams.length
    for (let round = 0; round < totalTeams - 1; round++) {
      for (let i = 0; i < totalTeams / 2; i++) {
        const home = teams[i]; const away = teams[totalTeams - 1 - i]
        if (home && away) { 
          matches.push({ 
            home_club_id: home.club_id, away_club_id: away.club_id, matchday: round + 1, 
            round_name: `Grupo ${groupName} - J${round + 1}`, group_name: groupName, leg: 1, status: 'scheduled' 
          }) 
        }
      }
      const last = teams.pop()!; teams.splice(1, 0, last)
    }
    const roundsForThisGroup = totalTeams - 1
    if (roundsForThisGroup > maxGroupRounds) maxGroupRounds = roundsForThisGroup
  })
  const totalGroups = Object.keys(groups).length; const teamsPerGroup = config.qualify_per_group || 2; const totalAdvancing = totalGroups * teamsPerGroup
  const bracketSize = nextPowerOf2(totalAdvancing)
  const roundNames: Record<number, string> = { 2: 'Final', 4: 'Semifinales', 8: 'Cuartos de Final', 16: 'Octavos de Final', 32: 'Dieciseisavos de Final' }
  let currentTeams = bracketSize; let koMatchday = maxGroupRounds + 1
  while (currentTeams >= 2) {
    const roundName = roundNames[currentTeams] || `Ronda de ${currentTeams}`; const matchesInRound = Math.floor(currentTeams / 2)
    for (let i = 0; i < matchesInRound; i++) {
      const isFinal = currentTeams === 2
      const useTwoLegs = config.knockout_legs === 2 && !isFinal
      matches.push({ home_club_id: null, away_club_id: null, matchday: koMatchday, round_name: useTwoLegs ? `${roundName} - Ida` : roundName, group_name: null, leg: 1, status: 'scheduled' })
      if (useTwoLegs) { matches.push({ home_club_id: null, away_club_id: null, matchday: koMatchday, round_name: `${roundName} - Vuelta`, group_name: null, leg: 2, status: 'scheduled' }) }
    }
    currentTeams = Math.floor(currentTeams / 2); koMatchday++
  }
  return matches
}

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const TYPE_LABELS: Record<string, string> = { league: 'Liga Profesional', cup: 'Copa Eliminatoria', groups_knockout: 'Grupos + Eliminatorias' }

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
    const [seasonRes, compRes, enrolledRes, allClubsRes, matchesRes] = await Promise.all([
      supabase.from('seasons').select('*').eq('id', seasonId).single(),
      supabase.from('competitions').select('*').eq('id', competitionId).single(),
      supabase.from('competition_clubs').select('*, club:clubs(*)').eq('competition_id', competitionId).order('group_name', { ascending: true }),
      supabase.from('clubs').select('*').order('name'),
      supabase.from('matches').select('*, home_club:clubs!matches_home_club_id_fkey(*), away_club:clubs!matches_away_club_id_fkey(*)').eq('competition_id', competitionId).order('match_order', { ascending: true })
    ])

    if (seasonRes.data) setSeason(seasonRes.data)
    if (compRes.data) setCompetition(compRes.data)
    if (enrolledRes.data) setEnrolledClubs(enrolledRes.data)
    if (allClubsRes.data) setAllClubs(allClubsRes.data)
    if (matchesRes.data) setMatches(matchesRes.data)
    setIsLoading(false)
  }

  useEffect(() => { loadData() }, [competitionId])

  const toggleClubSelection = (clubId: string) => {
    setSelectedClubs(prev => {
      if (prev.includes(clubId)) return prev.filter(id => id !== clubId)
      return [...prev, clubId]
    })
  }

  const handleEnrollClubs = async () => {
    if (!canEdit) return
    setIsSaving(true)
    try {
      await supabase.from('competition_clubs').delete().eq('competition_id', competitionId)
      if (selectedClubs.length > 0) {
        const inserts = selectedClubs.map((clubId, index) => ({ 
          competition_id: competitionId, 
          club_id: clubId, 
          group_name: competition?.type === 'groups_knockout' ? (clubGroups[clubId] || 'A') : null, 
          seed: index + 1 
        }))
        const { error } = await supabase.from('competition_clubs').insert(inserts)
        if (error) throw error
      }
      toast.success('Entidades vinculadas correctamente'); setIsEnrollOpen(false); loadData()
    } catch (error) { 
      toast.error('Error al guardar configuración') 
    } finally { 
      setIsSaving(false) 
    }
  }

  const generateMatches = async () => {
    if (!canEdit || !competition || enrolledClubs.length < 2) { 
      toast.error('Se requieren al menos 2 entidades vinculadas'); return 
    }
    setIsGenerating(true)
    try {
      await supabase.from('matches').delete().eq('competition_id', competitionId)
      let newMatches: Partial<Match>[] = []
      const clubsForGen = enrolledClubs.map(ec => ec.club as Club).filter(Boolean)
      
      switch (competition.type) {
        case 'league': newMatches = generateLeagueMatches(clubsForGen, competition.config as LeagueConfig); break
        case 'cup': newMatches = generateCupMatches(clubsForGen, competition.config as CupConfig); break
        case 'groups_knockout': newMatches = generateGroupsMatches(enrolledClubs, competition.config as GroupsKnockoutConfig); break
      }

      if (newMatches.length === 0) { toast.error('Fallo en el cálculo de enfrentamientos'); return }

      // 1. Get all matches for this season to find occupied dates and current max match_order
      const { data: seasonComps } = await supabase
        .from('competitions')
        .select('id, name')
        .eq('season_id', seasonId)
      
      const compIds = (seasonComps || []).map(c => c.id)
      const isWorldCup = competition.name.toLowerCase().includes('mundial')
      
      const { data: existingMatches } = await supabase
        .from('matches')
        .select('match_order, deadline, round_name')
        .in('competition_id', compIds)
        .order('match_order', { ascending: false })

      const maxOrder = existingMatches && existingMatches.length > 0 ? existingMatches[0].match_order : 0
      
      // Map of occupied dates (YYYY-MM-DD)
      const occupiedDates = new Set((existingMatches || [])
        .filter(m => m.deadline)
        .map(m => m.deadline!.split('T')[0]))

      // 2. Assign order and calculation of deadlines
      const isTourney = competition.type !== 'league'
      const startOrder = isTourney ? maxOrder : 0
      
      // Starting date for the season (April 18th)
      let currentGenDate = new Date('2026-04-18T04:49:30.01Z')
      
      // If it's a World Cup, find the last date of the season and start the day after
      if (isWorldCup) {
        const lastMatch = [...(existingMatches || [])].sort((a, b) => {
          if (!a.deadline) return 1
          if (!b.deadline) return -1
          return new Date(b.deadline).getTime() - new Date(a.deadline).getTime()
        })[0]
        
        if (lastMatch?.deadline) {
          currentGenDate = new Date(lastMatch.deadline)
          currentGenDate.setDate(currentGenDate.getDate() + 1)
        }
      }

      const matchesWithOrder = []
      const matchdayDates: Record<number, string> = {}

      for (let i = 0; i < newMatches.length; i++) {
        const m = newMatches[i]
        const md = m.matchday || 1
        
        if (!matchdayDates[md]) {
          let dateStr = currentGenDate.toISOString().split('T')[0]
          
          // Logic to find the next available day
          // If league, just take the next day. If cup, check for overlaps.
          while (occupiedDates.has(dateStr)) {
            currentGenDate.setDate(currentGenDate.getDate() + 1)
            dateStr = currentGenDate.toISOString().split('T')[0]
          }

          // Special Rule: Semis Ida must be 1 day apart if there's already one
          if (m.round_name?.includes('Semifinales - Ida')) {
            const hasOtherSemisIda = existingMatches?.some(em => 
              em.round_name?.includes('Semifinales - Ida') && 
              em.deadline?.split('T')[0] === dateStr
            )
            if (hasOtherSemisIda) {
              currentGenDate.setDate(currentGenDate.getDate() + 1)
              dateStr = currentGenDate.toISOString().split('T')[0]
            }
          }

          matchdayDates[md] = `${dateStr}T04:49:30.01Z`
          occupiedDates.add(dateStr)
          currentGenDate.setDate(currentGenDate.getDate() + 1)
        }

        matchesWithOrder.push({ 
          ...m, 
          competition_id: competitionId, 
          match_order: startOrder + i + 1,
          deadline: matchdayDates[md]
        })
      }

      const { error } = await supabase.from('matches').insert(matchesWithOrder)
      if (error) throw error
      
      // Create standings for league and groups_knockout (group stage)
      if (competition.type === 'league' || competition.type === 'groups_knockout') {
        // Delete existing standings first
        await supabase.from('standings').delete().eq('competition_id', competitionId)
        
        // Create standings for each enrolled club
        const standingsInserts = enrolledClubs.map(ec => ({
          competition_id: competitionId,
          club_id: ec.club_id,
          group_name: ec.group_name || null,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goals_for: 0,
          goals_against: 0,
          goal_difference: 0,
          points: 0
        }))
        
        const { error: standingsError } = await supabase.from('standings').insert(standingsInserts)
        if (standingsError) console.error('Error creating standings:', standingsError)
      }
      
      toast.success(`${matchesWithOrder.length} enfrentamientos sincronizados`); loadData()
    } catch (error) { 
      toast.error('Error en el generador táctico') 
    } finally { 
      setIsGenerating(false) 
    }
  }

  const handleDeleteCompetition = async () => {
    setIsDeleting(true)
    try {
      await supabase.from('matches').delete().eq('competition_id', competitionId)
      await supabase.from('competition_clubs').delete().eq('competition_id', competitionId)
      const { error } = await supabase.from('competitions').delete().eq('id', competitionId)
      if (error) throw error
      toast.success('Competencia purgada'); router.push(`/admin/seasons/${seasonId}`)
    } catch (error) { 
      toast.error('Fallo en la purga absoluta') 
    } finally { 
      setIsDeleting(false) 
    }
  }

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A]">
      <Loader2 className="w-8 h-8 animate-spin text-[#FF3131]" />
    </div>
  )

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0A0A0A]/80 backdrop-blur-2xl border-b border-white/[0.04]">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push(`/admin/seasons/${seasonId}`)} 
              className="w-10 h-10 rounded-xl bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white hover:border-[#FF3131]/40 transition-all active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-white uppercase tracking-tight truncate max-w-[200px]">{competition?.name}</h1>
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border text-[#FF3131] bg-white/5 border-white/10">
                  {TYPE_LABELS[competition?.type || 'league']}
                </span>
                {!canEdit && (
                  <span className="flex items-center gap-1 text-[8px] text-amber-500 font-black uppercase tracking-[0.2em]">
                    <Lock className="w-2.5 h-2.5" /> SELLADO
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

      <div className="px-6 py-6 space-y-6 pb-32">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#141414]/50 backdrop-blur-xl rounded-[28px] p-5 border border-white/[0.04] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-[#FF3131]/5 rounded-full blur-2xl group-hover:bg-[#FF3131]/10 transition-colors" />
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center mb-3 text-[#FF3131]">
                <Users className="w-5 h-5" />
              </div>
              <p className="text-2xl font-black text-white tabular-nums">{enrolledClubs.length}</p>
              <p className="text-[9px] text-[#6A6C6E] font-black uppercase tracking-widest mt-2 px-1 bg-white/5 w-fit rounded">ENTIDADES</p>
            </div>
          </div>
          <div className="bg-[#141414]/50 backdrop-blur-xl rounded-[28px] p-5 border border-white/[0.04] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-[#FF3131]/5 rounded-full blur-2xl group-hover:bg-[#FF3131]/10 transition-colors" />
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center mb-3 text-[#FF3131]">
                <Swords className="w-5 h-5" />
              </div>
              <p className="text-2xl font-black text-white tabular-nums">{matches.length}</p>
              <p className="text-[9px] text-[#6A6C6E] font-black uppercase tracking-widest mt-2 px-1 bg-white/5 w-fit rounded">ENFRENTAMIENTOS</p>
            </div>
          </div>
        </div>

        {/* Participants Section */}
        <section className="bg-[#141414]/30 backdrop-blur-xl rounded-[32px] border border-white/[0.04] overflow-hidden shadow-2xl">
          <div className="px-6 py-5 flex items-center justify-between border-b border-white/[0.04] bg-[#0A0A0A]/30">
            <div className="flex items-center gap-3">
              <Shield size={16} className="text-[#FF3131]" />
              <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">EQUIPOS CONFIGURADOS</h2>
            </div>
            {canEdit && (
              <button 
                onClick={() => { 
                  setSelectedClubs(enrolledClubs.map(c => c.club_id))
                  // Initialize group assignments from existing data
                  const groups: Record<string, string> = {}
                  enrolledClubs.forEach(c => {
                    if (c.group_name) groups[c.club_id] = c.group_name
                  })
                  setClubGroups(groups)
                  setIsEnrollOpen(true) 
                }} 
                className="h-8 px-4 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-lg flex items-center gap-2 font-black uppercase tracking-widest text-[9px] transition-all"
              >
                <Plus size={14} /> Vincular
              </button>
            )}
          </div>
          
          <div className="p-5 max-h-[300px] overflow-y-auto custom-scrollbar">
            {enrolledClubs.length === 0 ? (
              <div className="py-12 text-center opacity-40">
                <Users className="w-10 h-10 text-[#2D2D2D] mx-auto mb-3" />
                <p className="text-[9px] font-black uppercase tracking-widest">Esperando Asignación</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {enrolledClubs.map((ec) => (
                  <div key={ec.id} className="bg-[#0A0A0A]/50 rounded-2xl p-4 flex items-center justify-between border border-white/[0.02]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-black border border-[#202020] flex items-center justify-center p-2 text-[#6A6C6E]">
                        {ec.club?.shield_url ? <img src={ec.club.shield_url} className="w-full h-full object-contain" /> : <Shield size={18} />}
                      </div>
                      <p className="font-black text-white text-xs uppercase tracking-tight">{ec.club?.name}</p>
                    </div>
                    {ec.group_name && <span className="text-[8px] font-black text-[#FF3131] bg-[#FF3131]/10 px-2 py-1 rounded border border-[#FF3131]/10">GRUPO {ec.group_name}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Generator Section */}
        <section className="bg-[#141414]/30 backdrop-blur-xl rounded-[32px] border border-white/[0.04] overflow-hidden shadow-2xl">
          <div className="px-6 py-5 flex items-center justify-between border-b border-white/[0.04] bg-[#0A0A0A]/30">
            <div className="flex items-center gap-3">
              <Swords size={16} className="text-[#FF3131]" />
              <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">CALENDARIO DE COMPETICIÓN</h2>
            </div>
            {canEdit && (
              <button 
                onClick={generateMatches} 
                disabled={isGenerating || enrolledClubs.length < 2} 
                className="h-8 px-4 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg flex items-center gap-2 font-black uppercase tracking-widest text-[9px] transition-all disabled:opacity-20"
              >
                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Cálculo Táctico
              </button>
            )}
          </div>

          <div className="p-5 max-h-[400px] overflow-y-auto custom-scrollbar space-y-2">
            {matches.length === 0 ? (
              <div className="py-20 text-center opacity-40">
                <Swords className="w-12 h-12 text-[#2D2D2D] mx-auto mb-4" />
                <p className="text-[9px] font-black uppercase tracking-widest">Protocolo de Partidos Desactivado</p>
              </div>
            ) : (
              matches.map((match) => (
                <div key={match.id} className="bg-[#0A0A0A]/40 border border-white/[0.02] rounded-2xl p-4 flex items-center justify-between group hover:border-[#FF3131]/20 transition-all">
                  <div className="w-8 h-8 rounded-lg bg-black border border-[#202020] flex items-center justify-center text-[10px] font-black text-[#6A6C6E] shrink-0 tabular-nums">
                    {match.match_order}
                  </div>
                  <div className="flex-1 text-center px-4 min-w-0">
                    <div className="flex items-center justify-center gap-3 text-[11px] font-black text-white uppercase">
                      <span className="truncate">{(match as any).home_club?.name || 'TBD'}</span>
                      <span className="text-[#2D2D2D]">VS</span>
                      <span className="truncate">{(match as any).away_club?.name || 'TBD'}</span>
                    </div>
                    <p className="text-[8px] text-[#2D2D2D] font-black uppercase tracking-[0.2em] mt-1">{match.round_name}</p>
                  </div>
                  <ChevronRight size={14} className="text-[#2D2D2D] group-hover:text-[#FF3131] transition-colors" />
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Enroll Dialog */}
      <Dialog open={isEnrollOpen} onOpenChange={setIsEnrollOpen}>
        <DialogContent className="max-w-md w-full rounded-[32px] bg-[#141414]/95 backdrop-blur-2xl border-white/[0.08] p-0 overflow-hidden shadow-2xl max-h-[85vh] flex flex-col fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="p-8 pb-4">
             <DialogHeader className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center mx-auto mb-6 text-[#FF3131]">
                  <Plus size={24} />
                </div>
                <DialogTitle className="text-xl font-black text-white uppercase tracking-tighter">VINCULACIÓN DE <span className="text-[#FF3131]">ENTIDADES</span></DialogTitle>
             </DialogHeader>
          </div>
          
          <div className="flex-1 overflow-y-auto px-8 py-2 space-y-2 custom-scrollbar">
            {allClubs.map(club => {
              const selected = selectedClubs.includes(club.id)
              const isGroupsKnockout = competition?.type === 'groups_knockout'
              const config = competition?.config as GroupsKnockoutConfig | undefined
              const numberOfGroups = config?.groups_count || 2
              const availableGroups = GROUP_LETTERS.slice(0, numberOfGroups)
              
              return (
                <div 
                  key={club.id} 
                  className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                    selected ? 'border-[#FF3131]/40 bg-[#FF3131]/10' : 'border-white/5 bg-black/40 hover:bg-black/60'
                  }`}
                >
                  <div 
                    onClick={() => toggleClubSelection(club.id)}
                    className="flex items-center gap-4 flex-1 cursor-pointer"
                  >
                    <Checkbox checked={selected} className="border-white/20 data-[state=checked]:bg-[#FF3131]" />
                    <div className="w-10 h-10 rounded-xl bg-black border border-[#202020] p-2 shrink-0">
                      {club.shield_url ? <img src={club.shield_url} className="w-full h-full object-contain" /> : <Shield size={18} className="text-[#2D2D2D] mx-auto" />}
                    </div>
                    <span className="text-xs font-black text-white uppercase tracking-tight truncate">{club.name}</span>
                  </div>
                  
                  {isGroupsKnockout && selected && (
                    <Select 
                      value={clubGroups[club.id] || 'A'} 
                      onValueChange={(value) => setClubGroups(prev => ({ ...prev, [club.id]: value }))}
                    >
                      <SelectTrigger 
                        className="w-24 h-9 bg-black border-[#202020] text-white text-[10px] font-black uppercase tracking-wide rounded-xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <SelectValue placeholder="Grupo" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#141414] border-[#202020] rounded-xl">
                        {availableGroups.map(letter => (
                          <SelectItem 
                            key={letter} 
                            value={letter}
                            className="text-white text-[10px] font-black uppercase tracking-wide"
                          >
                            Grupo {letter}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )
            })}
          </div>

          <div className="p-8 bg-[#0A0A0A]/50 border-t border-white/[0.04] flex gap-4">
             <DialogClose asChild><button className="flex-1 h-14 border border-[#202020] text-[#6A6C6E] hover:text-white rounded-[20px] font-black uppercase text-[10px] tracking-widest transition-all">Abortar</button></DialogClose>
             <button onClick={handleEnrollClubs} disabled={isSaving} className="flex-1 h-14 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-[20px] font-black uppercase text-[10px] tracking-widest shadow-[0_0_30px_rgba(255,49,49,0.3)] transition-all active:scale-95 disabled:opacity-50">
               {isSaving ? <Loader2 size={16} className="animate-spin mx-auto" /> : `Vincular (${selectedClubs.length})`}
             </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete/Purge Dialogs */}
      <AlertDialog open={isDeleteCompetitionOpen} onOpenChange={setIsDeleteCompetitionOpen}>
        <AlertDialogContent className="max-w-sm w-full rounded-[32px] bg-[#141414] border-white/[0.08] p-8 shadow-2xl fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <AlertDialogHeader className="mb-6">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6 text-red-500">
              <AlertTriangle size={32} />
            </div>
            <AlertDialogTitle className="text-xl font-black text-white uppercase tracking-tighter text-center">ELIMINAR <span className="text-red-500">PROGRAMA</span></AlertDialogTitle>
            <AlertDialogDescription className="text-center text-[10px] text-[#6A6C6E] font-bold uppercase tracking-widest mt-2 px-4 leading-relaxed">
              ¿CONFIRMAS LA PURGA ABSOLUTA DE <span className="text-white font-black">{competition?.name}</span>? TODOS LOS REGISTROS Y PARTIDOS SERÁN ELIMINADOS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
             <AlertDialogCancel className="flex-1 h-14 bg-[#0A0A0A] border border-[#202020] text-[#6A6C6E] hover:text-white rounded-[20px] font-black uppercase tracking-[0.1em] text-[10px]">No</AlertDialogCancel>
             <AlertDialogAction onClick={handleDeleteCompetition} className="flex-1 h-14 bg-red-600 hover:bg-red-700 text-white rounded-[20px] font-black uppercase tracking-[0.1em] text-[10px] shadow-[0_0_30px_rgba(220,38,38,0.3)]">Purgar</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
