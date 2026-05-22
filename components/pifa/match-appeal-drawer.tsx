'use client'

import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Loader2, Shield, Plus, Minus, XCircle, Gavel } from 'lucide-react'
import { TeamAnnotationEditor, type AnnotationEdit } from './team-annotation-editor'
import type { Match, Club, Player, MatchAnnotation, GoalEntry, AssistEntry } from '@/lib/types'

interface MatchAppealDrawerProps {
  isOpen: boolean
  onClose: () => void
  matchId: string | null
  currentClubId: string
  userId?: string | null
  onSubmitted?: () => void
}

interface MatchWithClubs extends Match {
  home_club: Club
  away_club: Club
}

const EMPTY_ANN: AnnotationEdit = {
  goals: [],
  assists: [],
  mvp_player_id: null,
  starting_xi: [],
  substitutes_in: [],
}

export function MatchAppealDrawer({
  isOpen,
  onClose,
  matchId,
  currentClubId,
  userId,
  onSubmitted,
}: MatchAppealDrawerProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [match, setMatch] = useState<MatchWithClubs | null>(null)
  const [homePlayers, setHomePlayers] = useState<Player[]>([])
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([])
  const [homeScore, setHomeScore] = useState(0)
  const [awayScore, setAwayScore] = useState(0)
  const [homeAnnotation, setHomeAnnotation] = useState<AnnotationEdit>(EMPTY_ANN)
  const [awayAnnotation, setAwayAnnotation] = useState<AnnotationEdit>(EMPTY_ANN)
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (isOpen && matchId) {
      loadData()
    } else {
      setMatch(null)
      setHomePlayers([])
      setAwayPlayers([])
      setHomeScore(0)
      setAwayScore(0)
      setHomeAnnotation(EMPTY_ANN)
      setAwayAnnotation(EMPTY_ANN)
      setReason('')
    }
  }, [isOpen, matchId])

  async function loadData() {
    if (!matchId) return
    setIsLoading(true)
    try {
      const { data: matchData } = await supabase
        .from('matches')
        .select(`
          *,
          home_club:clubs!matches_home_club_id_fkey(*),
          away_club:clubs!matches_away_club_id_fkey(*)
        `)
        .eq('id', matchId)
        .single() as any

      if (!matchData) {
        toast.error('Partido no encontrado')
        onClose()
        return
      }
      const m = matchData as MatchWithClubs
      setMatch(m)
      setHomeScore(m.home_score ?? 0)
      setAwayScore(m.away_score ?? 0)

      const [homeRes, awayRes, annRes] = await Promise.all([
        supabase.from('players').select('*').eq('club_id', m.home_club_id).order('name'),
        supabase.from('players').select('*').eq('club_id', m.away_club_id).order('name'),
        supabase.from('match_annotations').select('*').eq('match_id', matchId),
      ])

      const annotations = ((annRes as any).data || []) as MatchAnnotation[]
      const homeAnn = annotations.find(a => a.club_id === m.home_club_id)
      const awayAnn = annotations.find(a => a.club_id === m.away_club_id)

      // Merge in any players referenced in annotations who are no longer in the club
      // (transferred or released). They appear with an "(ex)" suffix so the DT can still
      // edit goals/assists attributed to them.
      const referencedIds = new Set<string>()
      annotations.forEach(ann => {
        ;(ann.goals || []).forEach(g => referencedIds.add(g.player_id))
        ;(ann.assists || []).forEach(a => referencedIds.add(a.player_id))
        if (ann.mvp_player_id) referencedIds.add(ann.mvp_player_id)
      })

      const homeIds = new Set((homeRes.data || []).map(p => (p as any).id as string))
      const awayIds = new Set((awayRes.data || []).map(p => (p as any).id as string))
      const missingIds = Array.from(referencedIds).filter(id => !homeIds.has(id) && !awayIds.has(id))

      let exPlayersByClub: Record<string, Player[]> = { home: [], away: [] }
      if (missingIds.length > 0) {
        const { data: missingPlayers } = await supabase
          .from('players')
          .select('*')
          .in('id', missingIds)
        ;(missingPlayers || []).forEach(rawP => {
          const p = { ...(rawP as any), name: `${(rawP as any).name} (ex)` } as Player
          // Best-effort attribution: if they show in the home annotation, place in home list; else away.
          const inHomeAnn = (homeAnn?.goals || []).some(g => g.player_id === p.id) ||
            (homeAnn?.assists || []).some(a => a.player_id === p.id) ||
            homeAnn?.mvp_player_id === p.id
          if (inHomeAnn) exPlayersByClub.home.push(p)
          else exPlayersByClub.away.push(p)
        })
      }

      setHomePlayers([...(homeRes.data || []) as Player[], ...exPlayersByClub.home])
      setAwayPlayers([...(awayRes.data || []) as Player[], ...exPlayersByClub.away])

      setHomeAnnotation({
        goals: (homeAnn?.goals || []) as GoalEntry[],
        assists: (homeAnn?.assists || []) as AssistEntry[],
        mvp_player_id: homeAnn?.mvp_player_id || null,
        starting_xi: (homeAnn?.starting_xi || []) as string[],
        substitutes_in: homeAnn?.substitutes_in || [],
      })
      setAwayAnnotation({
        goals: (awayAnn?.goals || []) as GoalEntry[],
        assists: (awayAnn?.assists || []) as AssistEntry[],
        mvp_player_id: awayAnn?.mvp_player_id || null,
        starting_xi: (awayAnn?.starting_xi || []) as string[],
        substitutes_in: awayAnn?.substitutes_in || [],
      })
    } catch (e) {
      console.error('[MatchAppealDrawer] loadData error:', e)
      toast.error('Error al cargar el partido')
    } finally {
      setIsLoading(false)
    }
  }

  const homeGoalTotal = homeAnnotation.goals.reduce((s, g) => s + g.count, 0)
  const awayGoalTotal = awayAnnotation.goals.reduce((s, a) => s + a.count, 0)
  const scoreValid = homeGoalTotal === homeScore && awayGoalTotal === awayScore
  const reasonValid = reason.trim().length > 0
  const canSubmit = !isSubmitting && !isLoading && scoreValid && reasonValid && !!match

  async function handleSubmit() {
    if (!match || !matchId) return
    if (!scoreValid) {
      if (homeGoalTotal !== homeScore) {
        toast.error(`Los goles del local suman ${homeGoalTotal} pero el marcador propone ${homeScore}`)
      } else {
        toast.error(`Los goles del visitante suman ${awayGoalTotal} pero el marcador propone ${awayScore}`)
      }
      return
    }
    if (!reasonValid) {
      toast.error('Escribe una razón para la apelación')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/appeals/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId,
          clubId: currentClubId,
          submittedBy: userId || null,
          proposedHomeScore: homeScore,
          proposedAwayScore: awayScore,
          proposedHomeAnnotation: homeAnnotation,
          proposedAwayAnnotation: awayAnnotation,
          reason: reason.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Error al enviar la apelación')
        return
      }
      toast.success('Apelación enviada. El admin la revisará pronto.')
      onSubmitted?.()
      onClose()
    } catch (e: any) {
      console.error('[MatchAppealDrawer] submit error:', e)
      toast.error('Error de red al enviar la apelación')
    } finally {
      setIsSubmitting(false)
    }
  }

  const appellantIsHome = match ? currentClubId === match.home_club_id : false

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="bg-[#0A0A0A] border-white/5 text-white w-full sm:max-w-md p-0 overflow-y-auto no-scrollbar pt-[env(safe-area-inset-top)] [&>button]:hidden">
        <SheetHeader className="sr-only">
          <SheetTitle>Apelar Resultado</SheetTitle>
          <SheetDescription>Propón una corrección al resultado y estadísticas del partido. El admin debe aprobarla.</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="h-full min-h-[60vh] flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF3131]" />
          </div>
        ) : match ? (
          <div className="flex flex-col h-full animate-fade-in">
            {/* Header */}
            <div className="relative bg-gradient-to-b from-[#141414] to-black border-b border-white/5 px-6 pt-12 pb-5">
              <div className="absolute top-8 left-6 flex items-center gap-2">
                <Gavel className="w-3.5 h-3.5 text-[#FF3131]" />
                <p className="text-[10px] font-black text-[#FF3131] uppercase tracking-[0.2em]">Apelar Resultado</p>
              </div>
              <button
                onClick={onClose}
                className="absolute top-8 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-full transition-all border border-white/5 active:scale-95"
              >
                <XCircle className="w-5 h-5 text-[#6A6C6E]" />
              </button>

              <div className="flex items-center justify-between gap-3 mt-4">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-black border border-white/10 flex items-center justify-center p-1.5 overflow-hidden shrink-0">
                    {match.home_club.shield_url ? (
                      <img src={match.home_club.shield_url} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <Shield className="w-4 h-4 text-[#2D2D2D]" />
                    )}
                  </div>
                  <p className="text-[10px] font-black text-white uppercase truncate">{match.home_club.name}</p>
                </div>
                <span className="text-[9px] font-black text-[#6A6C6E]">VS</span>
                <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                  <p className="text-[10px] font-black text-white uppercase truncate">{match.away_club.name}</p>
                  <div className="w-9 h-9 rounded-lg bg-black border border-white/10 flex items-center justify-center p-1.5 overflow-hidden shrink-0">
                    {match.away_club.shield_url ? (
                      <img src={match.away_club.shield_url} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <Shield className="w-4 h-4 text-[#2D2D2D]" />
                    )}
                  </div>
                </div>
              </div>
              <p className="text-[9px] text-[#6A6C6E] text-center mt-2 font-bold uppercase tracking-widest">
                Resultado actual: {match.home_score ?? 0}—{match.away_score ?? 0}
              </p>
            </div>

            {/* Body */}
            <div className="flex-1 px-6 py-5 space-y-6">
              {/* Score inputs */}
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <p className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-widest mb-2">Local</p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setHomeScore(Math.max(0, homeScore - 1))}
                      className="w-9 h-9 rounded-lg bg-[#141414] border border-white/[0.06] flex items-center justify-center text-white hover:bg-white/10 transition-all"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-14 h-14 rounded-xl bg-[#141414] border border-[#FF3131]/30 flex items-center justify-center">
                      <span className="text-2xl font-black text-white tabular-nums">{homeScore}</span>
                    </div>
                    <button
                      onClick={() => setHomeScore(homeScore + 1)}
                      className="w-9 h-9 rounded-lg bg-[#141414] border border-white/[0.06] flex items-center justify-center text-white hover:bg-white/10 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <span className="text-lg font-black text-[#2D2D2D] mt-5">-</span>
                <div className="text-center">
                  <p className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-widest mb-2">Visitante</p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setAwayScore(Math.max(0, awayScore - 1))}
                      className="w-9 h-9 rounded-lg bg-[#141414] border border-white/[0.06] flex items-center justify-center text-white hover:bg-white/10 transition-all"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-14 h-14 rounded-xl bg-[#141414] border border-[#FF3131]/30 flex items-center justify-center">
                      <span className="text-2xl font-black text-white tabular-nums">{awayScore}</span>
                    </div>
                    <button
                      onClick={() => setAwayScore(awayScore + 1)}
                      className="w-9 h-9 rounded-lg bg-[#141414] border border-white/[0.06] flex items-center justify-center text-white hover:bg-white/10 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Team editors */}
              <TeamAnnotationEditor
                label={match.home_club.name}
                players={homePlayers}
                annotation={homeAnnotation}
                onChange={setHomeAnnotation}
                accentColor={appellantIsHome ? '#00FF85' : '#3B82F6'}
              />
              <TeamAnnotationEditor
                label={match.away_club.name}
                players={awayPlayers}
                annotation={awayAnnotation}
                onChange={setAwayAnnotation}
                accentColor={appellantIsHome ? '#3B82F6' : '#00FF85'}
              />

              {/* Reason */}
              <div className="space-y-2">
                <label className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest">
                  Razón <span className="text-[#FF3131]">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  placeholder="Explica al admin por qué propones esta corrección..."
                  className="w-full bg-[#141414] border border-white/[0.06] focus:border-[#FF3131]/40 outline-none text-white text-[12px] font-bold rounded-xl px-3 py-2.5 placeholder:text-[#3a3a3a] resize-none transition-colors"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-[#0A0A0A]/95 backdrop-blur p-6 border-t border-white/5 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 h-12 border border-[#202020] text-[#6A6C6E] hover:text-white rounded-2xl font-black uppercase text-[9px] tracking-widest transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1 h-12 bg-[#FF3131] hover:bg-[#D32F2F] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl font-black uppercase text-[9px] tracking-widest shadow-[0_0_20px_rgba(255,49,49,0.3)] transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gavel className="w-4 h-4" />}
                Enviar Apelación
              </button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
