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

    setMatch(matchData as MatchFull)
    setMatchFinished(matchData.status === 'finished')

    // Load my players
    const { data: players } = await supabase
      .from('players')
      .select('*')
      .eq('club_id', userClubId)
      .order('position')
      .order('number')

    if (players) setMyPlayers(players)

    // Load all players from both teams (for MVP selection)
    const bothClubIds = [matchData.home_club_id, matchData.away_club_id].filter(Boolean)
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
      const opponentId = matchData.home_club_id === userClubId ? matchData.away_club_id : matchData.home_club_id
      const opponentExists = annotations.some((a: MatchAnnotation) => a.club_id === opponentId)

      if (mine) {
        setMyAnnotation(mine as MatchAnnotation)
        setGoals((mine.goals as GoalEntry[]) || [])
        setAssists((mine.assists as AssistEntry[]) || [])
        if (mine.mvp_player_id) {
          setMvpPlayerId(mine.mvp_player_id)
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
    <div className="min-h-dvh bg-background safe-area-top safe-area-bottom">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-xl touch-active">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-foreground truncate">Partido</h1>
            <p className="text-xs text-muted-foreground truncate">{match.competition?.name} — {match.round_name}</p>
          </div>
          {/* Status badge */}
          {matchFinished ? (
            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Finalizado
            </span>
          ) : myAnnotation ? (
            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/15 text-blue-400 text-xs font-medium">
              <Check className="w-3.5 h-3.5" />
              Anotado
            </span>
          ) : opponentAnnotated ? (
            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              Rival anotó
            </span>
          ) : null}
        </div>
      </header>

      <div className="px-4 py-4 space-y-4 pb-8">
        {/* Match Card */}
        <div className="bg-card rounded-2xl border border-border p-4 pifa-shadow">
          <div className="flex items-center justify-between">
            {/* Home team */}
            <div className="flex-1 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-xl bg-muted/50 flex items-center justify-center mb-1.5 overflow-hidden">
                {match.home_club?.shield_url ? (
                  <img src={match.home_club.shield_url} alt="" className="w-12 h-12 object-contain" />
                ) : (
                  <Shield className="w-7 h-7 text-muted-foreground" />
                )}
              </div>
              <p className="text-xs font-semibold text-foreground truncate max-w-[90px]">{match.home_club?.name}</p>
              {isHome && <span className="text-[10px] text-primary font-medium">Tu equipo</span>}
            </div>

            {/* VS / Score */}
            <div className="px-4 flex flex-col items-center">
              {matchFinished && match.home_score !== null ? (
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {match.home_score} - {match.away_score}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">Final</p>
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">VS</span>
                </div>
              )}
            </div>

            {/* Away team */}
            <div className="flex-1 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-xl bg-muted/50 flex items-center justify-center mb-1.5 overflow-hidden">
                {match.away_club?.shield_url ? (
                  <img src={match.away_club.shield_url} alt="" className="w-12 h-12 object-contain" />
                ) : (
                  <Shield className="w-7 h-7 text-muted-foreground" />
                )}
              </div>
              <p className="text-xs font-semibold text-foreground truncate max-w-[90px]">{match.away_club?.name}</p>
              {!isHome && <span className="text-[10px] text-primary font-medium">Tu equipo</span>}
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
              myAnnotation ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-muted/30 border-border'
            }`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tu club</p>
              <p className={`text-xs font-semibold mt-1 ${myAnnotation ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                {myAnnotation ? '✓ Anotado' : 'Pendiente'}
              </p>
            </div>
            <div className={`p-3 rounded-xl border text-center ${
              opponentAnnotated ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-muted/30 border-border'
            }`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{opponentClub?.name}</p>
              <p className={`text-xs font-semibold mt-1 ${opponentAnnotated ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                {opponentAnnotated ? '✓ Anotado' : 'Pendiente'}
              </p>
            </div>
          </div>
        )}

        {/* Match finished summary */}
        {matchFinished && match.notes && (
          <div className="p-3 rounded-xl bg-muted/30 border border-border">
            <p className="text-xs text-muted-foreground">{match.notes}</p>
          </div>
        )}

        {/* ANNOTATION FORM — only show if match not finished */}
        {!matchFinished && (
          <>
            {/* GOLES */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden pifa-shadow">
              <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Goal className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Goles de tu equipo</h3>
                </div>
                <span className="text-lg font-bold text-primary">{totalGoals}</span>
              </div>

              {/* Current goals */}
              {goals.length > 0 && (
                <div className="divide-y divide-border">
                  {goals.map((goal) => (
                    <div key={goal.player_id} className="flex items-center gap-3 p-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Goal className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {getPlayerName(goal.player_id)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {goal.count} {goal.count === 1 ? 'gol' : 'goles'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => addGoal(goal.player_id)}
                          className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-sm font-bold touch-active"
                        >
                          +
                        </button>
                        <button
                          onClick={() => removeGoal(goal.player_id)}
                          className="w-7 h-7 rounded-lg bg-red-500/15 text-red-400 flex items-center justify-center text-sm font-bold touch-active"
                        >
                          −
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add goal */}
              <div className="p-3 border-t border-border">
                <Select onValueChange={(val) => addGoal(val)}>
                  <SelectTrigger className="h-10 rounded-xl bg-muted/30 border-border text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Plus className="w-4 h-4" />
                      <span>Agregar gol</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {myPlayers.map((player) => (
                      <SelectItem key={player.id} value={player.id}>
                        {player.name} ({player.position}) {player.number ? `#${player.number}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ASISTENCIAS */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden pifa-shadow">
              <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <HandHelping className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-semibold text-foreground">Asistencias</h3>
                </div>
                <span className="text-lg font-bold text-blue-400">
                  {assists.reduce((s, a) => s + a.count, 0)}
                </span>
              </div>

              {assists.length > 0 && (
                <div className="divide-y divide-border">
                  {assists.map((assist) => (
                    <div key={assist.player_id} className="flex items-center gap-3 p-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <HandHelping className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {getPlayerName(assist.player_id)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {assist.count} {assist.count === 1 ? 'asistencia' : 'asistencias'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => addAssist(assist.player_id)}
                          className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-sm font-bold touch-active"
                        >
                          +
                        </button>
                        <button
                          onClick={() => removeAssist(assist.player_id)}
                          className="w-7 h-7 rounded-lg bg-red-500/15 text-red-400 flex items-center justify-center text-sm font-bold touch-active"
                        >
                          −
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 border-t border-border">
                <Select onValueChange={(val) => addAssist(val)}>
                  <SelectTrigger className="h-10 rounded-xl bg-muted/30 border-border text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Plus className="w-4 h-4" />
                      <span>Agregar asistencia</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {myPlayers.map((player) => (
                      <SelectItem key={player.id} value={player.id}>
                        {player.name} ({player.position}) {player.number ? `#${player.number}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* MVP */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden pifa-shadow">
              <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-pifa-gold" />
                  <h3 className="text-sm font-semibold text-foreground">MVP del partido</h3>
                </div>
                <span className="text-[10px] text-muted-foreground">Opcional</span>
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
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-foreground">Quiero nominar un MVP</span>
                </label>

                {wantsMvp && (
                  <Select value={mvpPlayerId} onValueChange={setMvpPlayerId}>
                    <SelectTrigger className="h-10 rounded-xl bg-muted/30 border-border text-sm">
                      <SelectValue placeholder="Seleccionar jugador MVP" />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {myClub?.name}
                      </div>
                      {allMatchPlayers
                        .filter(p => p.club_id === clubId)
                        .map((player) => (
                          <SelectItem key={player.id} value={player.id}>
                            {player.name} ({player.position})
                          </SelectItem>
                        ))}
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-t border-border mt-1 pt-2">
                        {opponentClub?.name}
                      </div>
                      {allMatchPlayers
                        .filter(p => p.club_id !== clubId)
                        .map((player) => (
                          <SelectItem key={player.id} value={player.id}>
                            {player.name} ({player.position})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="space-y-3 pt-2">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full h-14 text-base font-semibold bg-pifa-gradient hover:opacity-90 transition-opacity rounded-2xl glow-orange"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : myAnnotation ? (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    Actualizar Anotación
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    Guardar Anotación
                  </>
                )}
              </Button>

              {myAnnotation && (
                <Button
                  variant="ghost"
                  onClick={() => setIsDeleteOpen(true)}
                  className="w-full h-11 text-sm text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl"
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
            className="w-full h-12 rounded-2xl"
          >
            Volver al Dashboard
          </Button>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="max-w-sm mx-4 rounded-2xl bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Borrar anotación</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará tu pre-anotación y podrás volver a anotar desde cero. ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
