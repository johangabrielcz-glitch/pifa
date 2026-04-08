'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Shield, Loader2, Plus, X, Goal, HandHelping, Star, Check, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { submitAnnotation, deleteAnnotation } from '@/lib/match-engine'
import { CountdownTimer } from '@/components/pifa/countdown-timer'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import type { Match, Club, Player, Competition, AuthSession, GoalEntry, AssistEntry, MatchAnnotation } from '@/lib/types'

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
        if (mymine.mvp_player_id) {
          setMvpPlayerId(mymine.mvp_player_id)
          setWantsMvp(true)
        }
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
      wantsMvp && mvpPlayerId ? mvpPlayerId : null
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
                    {myPlayers.map((player) => (
                      <SelectItem key={player.id} value={player.id} className="focus:bg-[#0A0A0A] focus:text-white">
                        {player.name} ({player.position}) {player.number ? `#${player.number}` : ''}
                      </SelectItem>
                    ))}
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
                    {myPlayers.map((player) => (
                      <SelectItem key={player.id} value={player.id} className="focus:bg-[#0A0A0A] focus:text-white">
                        {player.name} ({player.position}) {player.number ? `#${player.number}` : ''}
                      </SelectItem>
                    ))}
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
