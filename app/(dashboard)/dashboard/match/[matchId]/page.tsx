'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Shield, Users, Loader2, Plus, X, Goal, HandHelping, Star, Check, Trash2, AlertCircle, CheckCircle2, PlusCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { submitAnnotation, deleteAnnotation } from '@/lib/match-engine'
import { CountdownTimer } from '@/components/pifa/countdown-timer'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import type { Match, Club, Player, Competition, AuthSession, GoalEntry, AssistEntry, MatchAnnotation, SubstitutionEntry } from '@/lib/types'
import { normalizeSubstitutions } from '@/lib/injury-engine'
import { canUsePlayer } from '@/lib/contract-engine'

interface MatchFull extends Match {
  home_club: Club
  away_club: Club
  competition: Competition
}

export default function MatchAnnotationPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = use(params)
  const router = useRouter()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  const [match, setMatch] = useState<MatchFull | null>(null)
  const [clubId, setClubId] = useState<string>('')
  const [myPlayers, setMyPlayers] = useState<Player[]>([])
  const [allMatchPlayers, setAllMatchPlayers] = useState<Player[]>([])
  const [myAnnotation, setMyAnnotation] = useState<MatchAnnotation | null>(null)
  const [opponentAnnotated, setOpponentAnnotated] = useState(false)
  const [matchFinished, setMatchFinished] = useState(false)

  // Form state
  const [goals, setGoals] = useState<GoalEntry[]>([])
  const [assists, setAssists] = useState<AssistEntry[]>([])
  const [mvpPlayerId, setMvpPlayerId] = useState<string>('')
  const [wantsMvp, setWantsMvp] = useState(false)
  const [startingXi, setStartingXi] = useState<string[]>([])
  const [substitutesIn, setSubstitutesIn] = useState<SubstitutionEntry[]>([])
  const [isConvocatoriaLocked, setIsConvocatoriaLocked] = useState(false)
  const [subPopupPlayerId, setSubPopupPlayerId] = useState<string | null>(null)

  useEffect(() => {
    loadMatchData()
  }, [matchId])

  const loadMatchData = async () => {
    setIsLoading(true)

    // Check auth
    const stored = localStorage.getItem('pifa_auth_session')
    if (!stored) {
      router.replace('/login')
      return
    }

    const session: AuthSession = JSON.parse(stored)
    if (!session.user || session.user.role !== 'user' || !session.user.club_id) {
      router.replace('/login')
      return
    }

    const userClubId = session.user.club_id
    setClubId(userClubId)

    // Load match
    const { data: matchData, error } = await supabase
      .from('matches')
      .select(`
        *,
        home_club:clubs!matches_home_club_id_fkey(*),
        away_club:clubs!matches_away_club_id_fkey(*),
        competition:competitions(*)
      `)
      .eq('id', matchId)
      .single()

    if (error || !matchData) {
      toast.error('Partido no encontrado')
      router.back()
      return
    }

    const mData = matchData as any

    setMatch(mData)
    setMatchFinished(mData.status === 'finished')

    // Load my players
    const { data: players } = await supabase
      .from('players')
      .select('*')
      .eq('club_id', userClubId)
      .order('position')
      .order('number')

    if (players) setMyPlayers(players)

    // Load all players from both teams (for MVP selection)
    const bothClubIds = [mData.home_club_id, mData.away_club_id].filter(Boolean)
    const { data: allPlayers } = await supabase
      .from('players')
      .select('*')
      .in('club_id', bothClubIds)
      .order('club_id')
      .order('name')

    if (allPlayers) setAllMatchPlayers(allPlayers)

    // Load club's default lineup to pre-fill startingXi
    const { data: clubData } = await supabase
      .from('clubs')
      .select('default_lineup')
      .eq('id', userClubId)
      .single()

    const defLineup = (clubData as any)?.default_lineup
    if (defLineup?.players) {
      const initial11 = Object.values(defLineup.players).filter(Boolean) as string[]
      
      // FILTRO ANALÍTICO: Solo incluimos a los jugadores DISPONIBLES del 11 ideal
      const availableInitial11 = initial11.filter(id => {
        const p = (players as Player[])?.find(player => player.id === id)
        if (!p) return false
        const isUnavailable = (p.injury_matches_left ?? 0) > 0 || (p.red_card_matches_left ?? 0) > 0 || !canUsePlayer(p).available
        return !isUnavailable
      })
      
      setStartingXi(availableInitial11)
    }

    // Load existing annotations
    const { data: annotations } = await supabase
      .from('match_annotations')
      .select('*')
      .eq('match_id', matchId)

    if (annotations) {
      const mine = annotations.find((a: MatchAnnotation) => a.club_id === userClubId)
      const opponentId = mData.home_club_id === userClubId ? mData.away_club_id : mData.home_club_id
      const opponentExists = annotations.some((a: MatchAnnotation) => a.club_id === opponentId)

      if (mine) {
        setMyAnnotation(mine as MatchAnnotation)
        const mymine = mine as any;
        setGoals((mymine.goals as GoalEntry[]) || [])
        setAssists((mymine.assists as AssistEntry[]) || [])
        if (mymine.starting_xi && mymine.starting_xi.length > 0) {
          setStartingXi(mymine.starting_xi as string[])
        }
        if (mymine.substitutes_in && (Array.isArray(mymine.substitutes_in) ? mymine.substitutes_in.length > 0 : false)) {
          setSubstitutesIn(normalizeSubstitutions(mymine.substitutes_in))
        }
        if (mymine.mvp_player_id) {
          setMvpPlayerId(mymine.mvp_player_id)
          setWantsMvp(true)
        }
        // Lock convocatoria since it already exists
        setIsConvocatoriaLocked(true)
      } else {
        setIsConvocatoriaLocked(false)
      }
      setOpponentAnnotated(opponentExists)
    }

    setIsLoading(false)
  }

  const totalGoals = goals.reduce((sum, g) => sum + g.count, 0)

  const addGoal = (playerId: string) => {
    const existing = goals.find(g => g.player_id === playerId)
    if (existing) {
      setGoals(goals.map(g => g.player_id === playerId ? { ...g, count: g.count + 1 } : g))
    } else {
      setGoals([...goals, { player_id: playerId, count: 1 }])
    }
  }

  const removeGoal = (playerId: string) => {
    const existing = goals.find(g => g.player_id === playerId)
    if (existing && existing.count > 1) {
      setGoals(goals.map(g => g.player_id === playerId ? { ...g, count: g.count - 1 } : g))
    } else {
      setGoals(goals.filter(g => g.player_id !== playerId))
    }
  }

  const addAssist = (playerId: string) => {
    const existing = assists.find(a => a.player_id === playerId)
    if (existing) {
      setAssists(assists.map(a => a.player_id === playerId ? { ...a, count: a.count + 1 } : a))
    } else {
      setAssists([...assists, { player_id: playerId, count: 1 }])
    }
  }

  const removeAssist = (playerId: string) => {
    const existing = assists.find(a => a.player_id === playerId)
    if (existing && existing.count > 1) {
      setAssists(assists.map(a => a.player_id === playerId ? { ...a, count: a.count - 1 } : a))
    } else {
      setAssists(assists.filter(a => a.player_id !== playerId))
    }
  }

  const handleSave = async () => {
    setIsSaving(true)

    const result = await submitAnnotation(
      matchId,
      clubId,
      goals,
      assists,
      wantsMvp && mvpPlayerId ? mvpPlayerId : null,
      startingXi,
      substitutesIn
    )

    if (!result.success) {
      toast.error(result.error || 'Error al guardar')
      setIsSaving(false)
      return
    }

    if (result.matchFinalized) {
      toast.success('¡Partido finalizado! Las estadísticas han sido actualizadas.')
      setMatchFinished(true)
    } else {
      toast.success('Anotación guardada. Esperando al rival.')
    }

    // Reload
    await loadMatchData()
    setIsSaving(false)
  }

  const handleDelete = async () => {
    setIsDeleting(true)

    const result = await deleteAnnotation(matchId, clubId)
    if (!result.success) {
      toast.error(result.error || 'Error al eliminar')
    } else {
      toast.success('Anotación eliminada')
      setMyAnnotation(null)
      setGoals([])
      setAssists([])
      setMvpPlayerId('')
      setWantsMvp(false)
      setIsConvocatoriaLocked(false)
    }

    setIsDeleteOpen(false)
    setIsDeleting(false)
  }

  const getPlayerName = (playerId: string): string => {
    const player = allMatchPlayers.find(p => p.id === playerId) || myPlayers.find(p => p.id === playerId)
    return player?.name || 'Jugador desconocido'
  }

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!match) return null

  const isHome = match.home_club_id === clubId
  const myClub = isHome ? match.home_club : match.away_club
  const opponentClub = isHome ? match.away_club : match.home_club

  return (
    <div className="min-h-dvh bg-[#0A0A0A] safe-area-top safe-area-bottom font-sans">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#141414] border-b border-[#202020]">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded touch-active">
            <ArrowLeft className="w-5 h-5 text-[#6A6C6E]" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-white truncate">Partido</h1>
            <p className="text-[10px] text-[#6A6C6E] uppercase font-bold tracking-wider truncate">{match.competition?.name} — {match.round_name}</p>
          </div>
          {/* Status badge */}
          {matchFinished ? (
            <span className="flex items-center gap-1 px-2 py-1 rounded bg-[#00FF85]/10 text-[#00FF85] text-[10px] font-black uppercase tracking-wider">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Finalizado
            </span>
          ) : myAnnotation ? (
            <span className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/15 text-blue-400 text-[10px] font-black uppercase tracking-wider">
              <Check className="w-3.5 h-3.5" />
              Anotado
            </span>
          ) : opponentAnnotated ? (
            <span className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/15 text-amber-400 text-[10px] font-black uppercase tracking-wider">
              <AlertCircle className="w-3.5 h-3.5" />
              Rival anotó
            </span>
          ) : null}
        </div>
      </header>

      <div className="px-4 py-4 space-y-4 pb-8">
        {/* Match Card */}
        <div className="bg-[#141414] rounded-xl border border-[#202020] p-5 flex flex-col">
          <div className="flex items-center justify-between">
            {/* Home team */}
            <div className="flex-1 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded bg-[#0A0A0A] border border-[#202020] flex items-center justify-center mb-1.5 overflow-hidden">
                {match.home_club?.shield_url ? (
                  <img src={match.home_club.shield_url} alt="" className="w-12 h-12 object-contain" />
                ) : (
                  <Shield className="w-7 h-7 text-[#6A6C6E]" />
                )}
              </div>
              <p className="text-xs font-black text-white truncate max-w-[90px] uppercase">{match.home_club?.name}</p>
              {isHome && <span className="text-[10px] text-[#00FF85] font-black tracking-widest uppercase">Tu equipo</span>}
            </div>

            {/* VS / Score */}
            <div className="px-4 flex flex-col items-center">
              {matchFinished && match.home_score !== null ? (
                <div className="text-center">
                  <p className="text-2xl font-black text-white">
                    {match.home_score} - {match.away_score}
                  </p>
                  <p className="text-[10px] text-[#6A6C6E] mt-1 font-bold uppercase tracking-widest">Final</p>
                </div>
              ) : (
                <div className="w-10 h-10 rounded bg-[#0A0A0A] border border-[#202020] flex items-center justify-center">
                  <span className="text-xs font-black text-[#00FF85] uppercase">VS</span>
                </div>
              )}
            </div>

            {/* Away team */}
            <div className="flex-1 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded bg-[#0A0A0A] border border-[#202020] flex items-center justify-center mb-1.5 overflow-hidden">
                {match.away_club?.shield_url ? (
                  <img src={match.away_club.shield_url} alt="" className="w-12 h-12 object-contain" />
                ) : (
                  <Shield className="w-7 h-7 text-[#6A6C6E]" />
                )}
              </div>
              <p className="text-xs font-black text-white truncate max-w-[90px] uppercase">{match.away_club?.name}</p>
              {!isHome && <span className="text-[10px] text-[#00FF85] font-black tracking-widest uppercase">Tu equipo</span>}
            </div>
          </div>
        </div>

        {/* Countdown Timer */}
        {!matchFinished && match.deadline && (
          <CountdownTimer deadline={match.deadline} size="md" />
        )}

        {/* Annotation Status */}
        {!matchFinished && (
          <div className="grid grid-cols-2 gap-2">
            <div className={`p-3 rounded-xl border text-center ${
              myAnnotation ? 'bg-[#00FF85]/10 border-[#00FF85]/30' : 'bg-[#141414] border-[#202020]'
            }`}>
              <p className="text-[10px] text-[#6A6C6E] uppercase tracking-wider font-bold">Tu club</p>
              <p className={`text-xs font-black mt-1 uppercase ${myAnnotation ? 'text-[#00FF85]' : 'text-[#A0A2A4]'}`}>
                {myAnnotation ? '✓ Anotado' : 'Pendiente'}
              </p>
            </div>
            <div className={`p-3 rounded-xl border text-center ${
              opponentAnnotated ? 'bg-[#00FF85]/10 border-[#00FF85]/30' : 'bg-[#141414] border-[#202020]'
            }`}>
              <p className="text-[10px] text-[#6A6C6E] uppercase tracking-wider font-bold truncate">{opponentClub?.name}</p>
              <p className={`text-xs font-black mt-1 uppercase ${opponentAnnotated ? 'text-[#00FF85]' : 'text-[#A0A2A4]'}`}>
                {opponentAnnotated ? '✓ Anotado' : 'Pendiente'}
              </p>
            </div>
          </div>
        )}

        {/* Match finished summary */}
        {matchFinished && match.notes && (
          <div className="p-3 rounded-xl bg-[#141414] border border-[#202020]">
            <p className="text-xs text-[#A0A2A4]">{match.notes}</p>
          </div>
        )}

        {/* ANNOTATION FORM — only show if match not finished */}
        {!matchFinished && (
          <>
            {/* CONVOCATORIA (11 Inicial y Cambios) */}
            <div className="bg-[#0A0A0A] rounded-2xl border border-[#202020] overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between p-5 border-b border-[#202020] bg-[#141414]/50 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-lg bg-[#00FF85]/10 flex items-center justify-center">
                     <Users className="w-4 h-4 text-[#00FF85]" />
                   </div>
                   <div>
                     <h3 className="text-xs font-bold text-white uppercase tracking-widest">Planilla de Juego</h3>
                     <p className="text-[8px] text-[#6A6C6E] font-bold uppercase mt-0.5">Define quiénes sumarán partido jugado</p>
                   </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-black text-white px-2 py-0.5 rounded bg-white/5 border border-white/10">
                    {startingXi.length + substitutesIn.length} TOTAL
                  </span>
                </div>
              </div>

              <div className="p-5 space-y-8">
                {/* Starters Section */}
                <div className={isConvocatoriaLocked ? 'opacity-80' : ''}>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-black text-[#00FF85] uppercase tracking-[0.2em] flex items-center gap-2">
                       <Shield className="w-3 h-3" /> 11 INICIAL
                    </p>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${startingXi.length === 11 ? 'bg-[#00FF85]/20 text-[#00FF85]' : 'bg-[#FF3333]/10 text-[#FF3333]'}`}>
                      {startingXi.length}/11
                    </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2.5">
                    {myPlayers
                      .sort((a, b) => {
                        const aS = startingXi.includes(a.id) ? 1 : 0
                        const bS = startingXi.includes(b.id) ? 1 : 0
                        return bS - aS
                      })
                      .map(player => {
                        const isSelected = startingXi.includes(player.id)
                        const isInjured = (player.injury_matches_left ?? 0) > 0
                        const isSuspended = (player.red_card_matches_left ?? 0) > 0
                        const contractCheck = canUsePlayer(player as Player)
                        const isUnavailable = isInjured || isSuspended || !contractCheck.available
                        const unavailableReason = isInjured ? `🏥 ${player.injury_matches_left}P` : isSuspended ? `🟥 ${player.red_card_matches_left}P` : contractCheck.reason || ''
                        const stamina = player.stamina ?? 100
                        const staminaColor = stamina > 60 ? '#00FF85' : stamina > 30 ? '#FFB800' : '#FF3333'
                        return (
                          <button
                            key={player.id}
                            disabled={isConvocatoriaLocked || isUnavailable}
                            onClick={() => {
                              if (isUnavailable) return
                              if (isSelected) {
                                setStartingXi(startingXi.filter(id => id !== player.id))
                              } else if (startingXi.length < 11) {
                                setStartingXi([...startingXi, player.id])
                                setSubstitutesIn(substitutesIn.filter(s => s.player_in !== player.id))
                              }
                            }}
                            className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${!isConvocatoriaLocked && !isUnavailable && 'active:scale-[0.98]'} ${
                              isUnavailable
                                ? 'bg-[#1a1010] border-[#FF3333]/20 opacity-50 cursor-not-allowed'
                                : isSelected 
                                  ? 'bg-[#00FF85]/5 border-[#00FF85]/40 shadow-[0_0_15px_rgba(0,255,133,0.05)]' 
                                  : 'bg-[#141414] border-[#1F1F1F] opacity-60'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-[#0A0A0A] overflow-hidden border border-[#2D2D2D] relative group">
                                {player.photo_url ? (
                                  <img src={player.photo_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-white/10">
                                    <Users className="w-5 h-5" />
                                  </div>
                                )}
                                {isSelected && <div className="absolute inset-0 bg-[#00FF85]/10" />}
                                {isUnavailable && <div className="absolute inset-0 bg-red-500/20" />}
                              </div>
                              <div className="flex flex-col items-start">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-xs font-bold uppercase transition-colors ${isUnavailable ? 'text-[#FF3333]/60' : isSelected ? 'text-white' : 'text-[#6A6C6E]'}`}>
                                    {player.name}
                                  </span>
                                  {isInjured && <span className="text-[8px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-black">🏥 {player.injury_matches_left}P</span>}
                                  {isSuspended && <span className="text-[8px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-black">🟥 {player.red_card_matches_left}P</span>}
                                  {!isInjured && !isSuspended && !contractCheck.available && (
                                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-black">{contractCheck.reason}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[9px] font-black text-[#505050] uppercase tracking-tighter">
                                    {player.position} {player.number ? `• #${player.number}` : ''}
                                  </span>
                                  {!isUnavailable && (
                                    <div className="flex items-center gap-1">
                                      <div className="w-12 h-1.5 bg-[#202020] rounded-full overflow-hidden">
                                        <div className="h-full rounded-full transition-all" style={{ width: `${stamina}%`, backgroundColor: staminaColor }} />
                                      </div>
                                      <span className="text-[7px] font-black" style={{ color: staminaColor }}>{stamina}%</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                              isUnavailable ? 'bg-[#FF3333]/10 text-[#FF3333]/40' :
                              isSelected ? 'bg-[#00FF85] text-black scale-110 shadow-lg' : 'bg-[#202020] text-white/10 border border-white/5'
                            }`}>
                              {isUnavailable ? <X className="w-3 h-3" /> : isSelected ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <div className="w-1.5 h-1.5 rounded-full bg-white/10" />}
                            </div>
                          </button>
                        )
                      })}
                  </div>
                </div>

                {/* Substitutes Section */}
                <div className={`pt-2 ${isConvocatoriaLocked ? 'opacity-80' : ''}`}>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2">
                       <PlusCircle className="w-3 h-3" /> CAMBIOS (QUIÉN ENTRÓ POR QUIÉN)
                    </p>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-400/10 text-blue-400">
                      {substitutesIn.length} CAMBIOS
                    </span>
                  </div>

                  {/* Active substitutions display */}
                  {substitutesIn.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {substitutesIn.map((sub) => {
                        const playerIn = myPlayers.find(p => p.id === sub.player_in)
                        const playerOut = myPlayers.find(p => p.id === sub.player_out)
                        return (
                          <div key={sub.player_in} className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-400/5 border border-blue-400/20">
                            <div className="flex-1 flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-black text-[#00FF85] uppercase truncate">🔼 {playerIn?.name?.split(' ').pop()}</span>
                              <span className="text-[8px] text-[#6A6C6E]">←</span>
                              <span className="text-[10px] font-black text-[#FF3333] uppercase truncate">🔽 {playerOut?.name?.split(' ').pop()}</span>
                            </div>
                            {!isConvocatoriaLocked && (
                              <button
                                onClick={() => setSubstitutesIn(substitutesIn.filter(s => s.player_in !== sub.player_in))}
                                className="w-6 h-6 rounded bg-[#FF3333]/10 flex items-center justify-center text-[#FF3333] shrink-0"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="bg-[#141414] rounded-2xl border border-[#202020] p-4">
                    {!isConvocatoriaLocked && (
                      <p className="text-[10px] text-[#4A4A4A] font-bold uppercase tracking-wider mb-4 leading-relaxed italic text-center">
                        Toca un jugador del banco para indicar que entró de cambio
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {myPlayers
                        .filter(p => !startingXi.includes(p.id))
                        .map(player => {
                          const isSubIn = substitutesIn.some(s => s.player_in === player.id)
                          const isInjured = (player.injury_matches_left ?? 0) > 0
                          const isSuspended = (player.red_card_matches_left ?? 0) > 0
                          const contractCheck2 = canUsePlayer(player as Player)
                          const isUnavailable = isInjured || isSuspended || !contractCheck2.available
                          return (
                            <button
                              key={player.id}
                              disabled={isConvocatoriaLocked || isSubIn || isUnavailable}
                              onClick={() => {
                                if (isUnavailable) return
                                // Open popup to select which starter this sub replaced
                                setSubPopupPlayerId(player.id)
                              }}
                              className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${!isConvocatoriaLocked && !isUnavailable && !isSubIn && 'active:scale-[0.95]'} ${
                                isUnavailable
                                  ? 'bg-[#1a1010] border-[#FF3333]/15 text-[#FF3333]/40 opacity-50 cursor-not-allowed'
                                  : isSubIn
                                    ? 'bg-blue-400/10 border-blue-400/40 text-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.05)]'
                                    : 'bg-[#0A0A0A] border-[#252525] text-[#4A4A4A] opacity-70'
                              }`}
                            >
                              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-all ${
                                isUnavailable ? 'bg-[#FF3333]/10 border-[#FF3333]/20 text-[#FF3333]' :
                                isSubIn ? 'bg-blue-400 border-blue-400 text-black' : 'bg-[#202020] border-white/5 text-transparent'
                              }`}>
                                {isUnavailable ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3 stroke-[3]" />}
                              </div>
                              <div className="flex flex-col items-start min-w-0">
                                <span className="text-[10px] font-black uppercase truncate">{player.name.split(' ').pop()}</span>
                                {isInjured && <span className="text-[7px] text-[#FF3333] font-bold">🏥 {player.injury_matches_left}P</span>}
                                {isSuspended && <span className="text-[7px] text-[#FF3333] font-bold">🟥 {player.red_card_matches_left}P</span>}
                                {!isInjured && !isSuspended && !contractCheck2.available && <span className="text-[7px] text-amber-400 font-bold">{contractCheck2.reason}</span>}
                              </div>
                            </button>
                          )
                        })}
                    </div>
                  </div>

                  {/* Substitution popup: select which starter was replaced */}
                  {subPopupPlayerId && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setSubPopupPlayerId(null)}>
                      <div className="bg-[#141414] rounded-2xl border border-[#202020] p-5 w-full max-w-sm max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider mb-1 text-center">
                          ¿A quién reemplazó?
                        </h4>
                        <p className="text-[9px] text-[#6A6C6E] font-bold text-center mb-4 uppercase">
                          {myPlayers.find(p => p.id === subPopupPlayerId)?.name} entró por...
                        </p>
                        <div className="space-y-2">
                          {startingXi
                            .filter(starterId => !substitutesIn.some(s => s.player_out === starterId))
                            .map(starterId => {
                              const starter = myPlayers.find(p => p.id === starterId)
                              if (!starter) return null
                              return (
                                <button
                                  key={starterId}
                                  onClick={() => {
                                    setSubstitutesIn([...substitutesIn, { player_in: subPopupPlayerId!, player_out: starterId }])
                                    setSubPopupPlayerId(null)
                                  }}
                                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#202020] bg-[#0A0A0A] hover:border-[#00FF85]/40 hover:bg-[#00FF85]/5 transition-all active:scale-[0.98]"
                                >
                                  <div className="w-8 h-8 rounded-lg bg-[#141414] border border-[#2D2D2D] flex items-center justify-center overflow-hidden">
                                    {starter.photo_url ? (
                                      <img src={starter.photo_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <Users className="w-4 h-4 text-white/10" />
                                    )}
                                  </div>
                                  <div className="flex flex-col items-start">
                                    <span className="text-[11px] font-black text-white uppercase">{starter.name}</span>
                                    <span className="text-[8px] text-[#6A6C6E] font-bold uppercase">{starter.position} {starter.number ? `#${starter.number}` : ''}</span>
                                  </div>
                                </button>
                              )
                            })}
                        </div>
                        <button
                          onClick={() => setSubPopupPlayerId(null)}
                          className="w-full mt-4 py-2.5 rounded-xl bg-[#202020] text-[#6A6C6E] text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Button */}
                {!isConvocatoriaLocked && (
                  <Button 
                    onClick={() => {
                      if (startingXi.length === 0) {
                        toast.error('Debes seleccionar al menos un jugador titular')
                        return
                      }
                      if (startingXi.length < 11) {
                         toast.warning('Has seleccionado menos de 11 titulares')
                      }
                      setIsConvocatoriaLocked(true)
                      toast.success('Convocatoria fijada. Ahora puedes anotar las estadísticas.')
                    }}
                    className="w-full bg-[#00FF85] hover:bg-[#00E075] text-[#0A0A0A] font-black uppercase tracking-widest py-6 rounded-xl shadow-[0_10px_20px_-10px_rgba(0,255,133,0.3)]"
                  >
                    Guardar Convocatoria
                  </Button>
                )}
              </div>
            </div>

            {/* ESTADÍSTICAS (Goles, Asistencias, MVP) - Bloqueadas si no hay convocatoria */}
            <div className={`space-y-4 transition-all duration-500 ${!isConvocatoriaLocked ? 'opacity-30 pointer-events-none grayscale select-none' : ''}`}>
               {!isConvocatoriaLocked && (
                 <div className="bg-[#141414]/80 backdrop-blur-sm border border-[#202020] p-4 rounded-xl text-center">
                    <p className="text-[10px] text-[#00FF85] font-black uppercase tracking-[0.2em]">Fase 1: Convocatoria</p>
                    <p className="text-[9px] text-white/40 uppercase mt-1">Confirma tu plantilla para habilitar el reporte de goles</p>
                 </div>
               )}

              {/* GOLES */}
              <div className="bg-[#0A0A0A] rounded-xl border border-[#202020] overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-[#202020] bg-[#141414]">
                  <div className="flex items-center gap-2">
                     <Goal className="w-4 h-4 text-[#00FF85]" />
                     <h3 className="text-xs font-black text-white uppercase tracking-wider">Goles de tu equipo</h3>
                  </div>
                  <span className="text-lg font-black text-white">{totalGoals}</span>
                </div>

              {/* Current goals */}
              {goals.length > 0 && (
                <div className="divide-y divide-[#202020]">
                  {goals.map((goal) => (
                    <div key={goal.player_id} className="flex items-center gap-3 p-3">
                      <div className="w-8 h-8 rounded bg-[#141414] border border-[#202020] flex items-center justify-center">
                        <Goal className="w-4 h-4 text-[#00FF85]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {getPlayerName(goal.player_id)}
                        </p>
                        <p className="text-[10px] text-[#6A6C6E] font-bold uppercase">
                          {goal.count} {goal.count === 1 ? 'GOL' : 'GOLES'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => addGoal(goal.player_id)}
                          className="w-7 h-7 rounded bg-[#00FF85]/10 border border-[#00FF85]/20 text-[#00FF85] flex items-center justify-center text-sm font-bold touch-active"
                        >
                          +
                        </button>
                        <button
                          onClick={() => removeGoal(goal.player_id)}
                          className="w-7 h-7 rounded bg-[#FF3333]/10 border border-[#FF3333]/20 text-[#FF3333] flex items-center justify-center text-sm font-bold touch-active"
                        >
                          −
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add goal */}
              <div className="p-3 border-t border-[#202020] bg-[#141414]/50">
                <Select onValueChange={(val) => addGoal(val)}>
                  <SelectTrigger className="h-10 rounded border-[#202020] bg-[#0A0A0A] text-sm text-white">
                    <div className="flex items-center gap-2 text-[#6A6C6E] font-bold">
                      <Plus className="w-4 h-4 text-[#00FF85]" />
                      <span>AGREGAR GOL</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-[#141414] border-[#202020] text-white">
                    {myPlayers
                      .filter(p => startingXi.includes(p.id) || substitutesIn.some(s => s.player_in === p.id))
                      .map((player) => (
                        <SelectItem key={player.id} value={player.id} className="focus:bg-[#0A0A0A] focus:text-white">
                          {player.name} ({player.position}) {player.number ? `#${player.number}` : ''}
                        </SelectItem>
                      ))}
                    {(startingXi.length + substitutesIn.length === 0) && (
                      <div className="p-2 text-[10px] text-[#FF3333] font-bold uppercase text-center">
                        Debes confirmar la convocatoria primero
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ASISTENCIAS */}
            <div className="bg-[#0A0A0A] rounded-xl border border-[#202020] overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-[#202020] bg-[#141414]">
                <div className="flex items-center gap-2">
                  <HandHelping className="w-4 h-4 text-[#00FF85]" />
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">Asistencias</h3>
                </div>
                <span className="text-lg font-black text-white">
                  {assists.reduce((s, a) => s + a.count, 0)}
                </span>
              </div>

              {assists.length > 0 && (
                <div className="divide-y divide-[#202020]">
                  {assists.map((assist) => (
                    <div key={assist.player_id} className="flex items-center gap-3 p-3">
                      <div className="w-8 h-8 rounded bg-[#141414] border border-[#202020] flex items-center justify-center">
                        <HandHelping className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {getPlayerName(assist.player_id)}
                        </p>
                        <p className="text-[10px] text-[#6A6C6E] uppercase font-bold">
                          {assist.count} {assist.count === 1 ? 'ASIST' : 'ASISTS'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => addAssist(assist.player_id)}
                          className="w-7 h-7 rounded bg-[#00FF85]/10 border border-[#00FF85]/20 text-[#00FF85] flex items-center justify-center text-sm font-bold touch-active"
                        >
                          +
                        </button>
                        <button
                          onClick={() => removeAssist(assist.player_id)}
                          className="w-7 h-7 rounded bg-[#FF3333]/10 border border-[#FF3333]/20 text-[#FF3333] flex items-center justify-center text-sm font-bold touch-active"
                        >
                          −
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 border-t border-[#202020] bg-[#141414]/50">
                <Select onValueChange={(val) => addAssist(val)}>
                  <SelectTrigger className="h-10 rounded border-[#202020] bg-[#0A0A0A] text-sm text-white">
                    <div className="flex items-center gap-2 text-[#6A6C6E] font-bold">
                      <Plus className="w-4 h-4 text-blue-400" />
                      <span>AGREGAR ASISTENCIA</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-[#141414] border-[#202020] text-white">
                    {myPlayers
                      .filter(p => startingXi.includes(p.id) || substitutesIn.some(s => s.player_in === p.id))
                      .map((player) => (
                        <SelectItem key={player.id} value={player.id} className="focus:bg-[#0A0A0A] focus:text-white">
                          {player.name} ({player.position}) {player.number ? `#${player.number}` : ''}
                        </SelectItem>
                      ))}
                    {(startingXi.length + substitutesIn.length === 0) && (
                      <div className="p-2 text-[10px] text-[#FF3333] font-bold uppercase text-center">
                        Debes confirmar la convocatoria primero
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* MVP */}
            <div className="bg-[#0A0A0A] rounded-xl border border-[#202020] overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-[#202020] bg-[#141414]">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">MVP del partido</h3>
                </div>
                <span className="text-[10px] font-bold text-[#6A6C6E] uppercase tracking-widest">Opcional</span>
              </div>

              <div className="p-3 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wantsMvp}
                    onChange={(e) => {
                      setWantsMvp(e.target.checked)
                      if (!e.target.checked) setMvpPlayerId('')
                    }}
                    className="w-4 h-4 rounded border-[#202020] bg-[#141414] text-[#00FF85] focus:ring-[#00FF85] focus:ring-offset-0 placeholder-[#0A0A0A]"
                  />
                  <span className="text-sm font-bold text-white tracking-wide">Quiero nominar un MVP</span>
                </label>

                {wantsMvp && (
                  <Select value={mvpPlayerId} onValueChange={setMvpPlayerId}>
                    <SelectTrigger className="h-10 rounded border-[#202020] bg-[#141414] text-sm text-white">
                      <SelectValue placeholder="Seleccionar jugador MVP" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#141414] border-[#202020] text-white">
                      <div className="px-2 py-1.5 text-xs font-black text-[#00FF85] uppercase tracking-wider">
                        {myClub?.name}
                      </div>
                      {allMatchPlayers
                        .filter(p => p.club_id === clubId)
                        .map((player) => (
                          <SelectItem key={player.id} value={player.id} className="focus:bg-[#0A0A0A] focus:text-white">
                            {player.name} ({player.position})
                          </SelectItem>
                        ))}
                      <div className="px-2 py-1.5 text-xs font-black text-amber-400 uppercase tracking-wider border-t border-[#202020] mt-1 pt-2">
                        {opponentClub?.name}
                      </div>
                      {allMatchPlayers
                        .filter(p => p.club_id !== clubId)
                        .map((player) => (
                          <SelectItem key={player.id} value={player.id} className="focus:bg-[#0A0A0A] focus:text-white">
                            {player.name} ({player.position})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="space-y-3 pt-4">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full h-12 text-xs font-black uppercase tracking-widest bg-[#00FF85] text-[#0A0A0A] hover:bg-[#00CC6A] rounded transition-colors"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : myAnnotation ? (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    Actualizar
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    Guardar
                  </>
                )}
              </Button>

              {myAnnotation && (
                <Button
                  variant="ghost"
                  onClick={() => setIsDeleteOpen(true)}
                  className="w-full h-11 text-xs font-bold uppercase tracking-widest text-[#FF3333] hover:text-[#FF3333] hover:bg-[#FF3333]/10 rounded"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Borrar Anotación
                </Button>
              )}
            </div>
            </div>
          </>
        )}

        {/* If finished: show go back */}
        {matchFinished && (
          <Button
            onClick={() => router.push('/dashboard')}
            className="w-full h-12 rounded bg-[#141414] text-white border border-[#202020] font-black uppercase tracking-widest hover:bg-[#202020]"
          >
            Volver
          </Button>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="max-w-sm mx-4 rounded-xl border border-[#202020] bg-[#141414]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-black uppercase">Borrar anotación</AlertDialogTitle>
            <AlertDialogDescription className="text-[#A0A2A4] font-medium">
              Se borrará tu pre-anotación y podrás volver a anotar desde cero. ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded bg-[#0A0A0A] border border-[#202020] text-white font-bold uppercase">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded bg-[#FF3333] text-white font-bold uppercase hover:bg-[#CC0000]"
            >
              {isDeleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
