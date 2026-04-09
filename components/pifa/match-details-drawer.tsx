'use client'

import { useEffect, useState } from 'react'
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
  SheetDescription 
} from '@/components/ui/sheet'
import { supabase } from '@/lib/supabase'
import { Loader2, Shield, Goal, HandHelping, Star, Trophy, Calendar, Users } from 'lucide-react'
import type { Match, Club, MatchAnnotation, Player } from '@/lib/types'

interface MatchDetailsDrawerProps {
  matchId: string | null
  isOpen: boolean
  onClose: () => void
}

interface MatchWithClubs extends Match {
  home_club: Club
  away_club: Club
}

interface StatEntry {
  playerId: string
  name: string
  count: number
  clubId: string
}

export function MatchDetailsDrawer({ matchId, isOpen, onClose }: MatchDetailsDrawerProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [match, setMatch] = useState<MatchWithClubs | null>(null)
  const [goals, setGoals] = useState<StatEntry[]>([])
  const [assists, setAssists] = useState<StatEntry[]>([])
  const [mvp, setMvp] = useState<{ player: Player; club: Club } | null>(null)

  useEffect(() => {
    if (matchId && isOpen) {
      loadData()
    } else {
      setMatch(null)
      setGoals([])
      setAssists([])
      setMvp(null)
    }
  }, [matchId, isOpen])

  const loadData = async () => {
    setIsLoading(true)
    try {
      // 1. Load Match
      const { data: matchData } = await supabase
        .from('matches')
        .select(`
          *,
          home_club:clubs!matches_home_club_id_fkey(*),
          away_club:clubs!matches_away_club_id_fkey(*)
        `)
        .eq('id', matchId)
        .single()

      if (!matchData) return
      const m = matchData as MatchWithClubs
      setMatch(m)

      // 2. Load Annotations
      const { data: annData } = await supabase
        .from('match_annotations')
        .select('*')
        .eq('match_id', matchId)

      if (!annData) return
      const annotations = annData as MatchAnnotation[]

      // 3. Load Players needed for names
      const playerIds = new Set<string>()
      annotations.forEach(ann => {
        ann.goals?.forEach(g => playerIds.add(g.player_id))
        ann.assists?.forEach(a => playerIds.add(a.player_id))
        if (ann.mvp_player_id) playerIds.add(ann.mvp_player_id)
      })

      let playersMap: Record<string, Player> = {}
      if (playerIds.size > 0) {
        const { data: playersData } = await supabase
          .from('players')
          .select('*')
          .in('id', Array.from(playerIds))
        
        if (playersData) {
          playersData.forEach(p => {
            playersMap[p.id] = p as Player
          })
        }
      }

      // 4. Process Goals & Assists
      const goalList: StatEntry[] = []
      const assistList: StatEntry[] = []

      annotations.forEach(ann => {
        ann.goals?.forEach(g => {
          goalList.push({
            playerId: g.player_id,
            name: playersMap[g.player_id]?.name || 'Jugador desconocido',
            count: g.count,
            clubId: ann.club_id
          })
        })
        ann.assists?.forEach(a => {
          assistList.push({
            playerId: a.player_id,
            name: playersMap[a.player_id]?.name || 'Jugador desconocido',
            count: a.count,
            clubId: ann.club_id
          })
        })
      })

      setGoals(goalList.sort((a, b) => b.count - a.count))
      setAssists(assistList.sort((a, b) => b.count - a.count))

      // 5. Process MVP (assuming they should agree, but taking first available or prioritizing winner)
      const mvpId = annotations[0]?.mvp_player_id || annotations[1]?.mvp_player_id
      if (mvpId && playersMap[mvpId]) {
        const p = playersMap[mvpId]
        const club = p.club_id === m.home_club_id ? m.home_club : m.away_club
        setMvp({ player: p, club })
      }

    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="bg-[#0A0A0A] border-white/5 text-white w-full sm:max-w-md p-0 overflow-y-auto no-scrollbar pt-[env(safe-area-inset-top)]">
        <SheetHeader className="sr-only">
          <SheetTitle>Detalles del Partido</SheetTitle>
          <SheetDescription>Vista detallada de las estadísticas y resultado final del encuentro.</SheetDescription>
        </SheetHeader>
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#00FF85]" />
          </div>
        ) : match ? (
          <div className="flex flex-col h-full animate-fade-in">
            {/* Header / Scoreboard */}
            <div className="relative h-48 bg-gradient-to-b from-[#141414] to-black border-b border-white/5 flex flex-col items-center justify-center p-6 pt-12">
              <div className="absolute top-8 left-6">
                <p className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-[0.2em]">Resultado Final</p>
              </div>
              
              <div className="flex items-center justify-between w-full max-w-[280px]">
                {/* Home */}
                <div className="flex flex-col items-center gap-2 flex-1">
                  <div className="w-16 h-16 rounded-2xl bg-black border border-white/10 flex items-center justify-center p-3 shadow-2xl overflow-hidden">
                    {match.home_club.shield_url ? (
                      <img src={match.home_club.shield_url} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <Shield className="w-8 h-8 text-[#2D2D2D]" />
                    )}
                  </div>
                  <p className="text-[10px] font-black text-white uppercase text-center truncate w-full">{match.home_club.name}</p>
                </div>

                {/* Score */}
                <div className="flex flex-col items-center px-4">
                  <p className="text-4xl font-black text-white italic tracking-tighter">
                    {match.home_score}—{match.away_score}
                  </p>
                  <div className="mt-1 px-2 py-0.5 rounded-full bg-[#00FF85]/10 border border-[#00FF85]/20">
                    <p className="text-[8px] font-black text-[#00FF85] uppercase tracking-widest">Finalizado</p>
                  </div>
                </div>

                {/* Away */}
                <div className="flex flex-col items-center gap-2 flex-1">
                  <div className="w-16 h-16 rounded-2xl bg-black border border-white/10 flex items-center justify-center p-3 shadow-2xl overflow-hidden">
                    {match.away_club.shield_url ? (
                      <img src={match.away_club.shield_url} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <Shield className="w-8 h-8 text-[#2D2D2D]" />
                    )}
                  </div>
                  <p className="text-[10px] font-black text-white uppercase text-center truncate w-full">{match.away_club.name}</p>
                </div>
              </div>
            </div>

            {/* Stats Content */}
            <div className="p-6 space-y-8">
              {/* GOALS */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 h-4">
                  <Goal className="w-4 h-4 text-[#00FF85]" />
                  <h3 className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-[0.2em]">Goleadores</h3>
                  <div className="h-px flex-1 bg-white/5" />
                </div>
                
                {goals.length === 0 ? (
                  <p className="text-[10px] text-[#2D2D2D] font-black uppercase text-center py-4 border border-dashed border-white/5 rounded-xl">Sin goles registrados</p>
                ) : (
                  <div className="grid gap-2">
                    {goals.map((g, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-1 h-4 rounded-full ${g.clubId === match.home_club_id ? 'bg-[#00FF85]' : 'bg-blue-400'}`} />
                          <p className="text-sm font-bold text-white uppercase tracking-tight">{g.name}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-white">{g.count}</span>
                          <span className="text-[10px] font-black text-[#6A6C6E] uppercase">GOL{g.count > 1 ? 'ES' : ''}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ASSISTS */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 h-4">
                  <HandHelping className="w-4 h-4 text-blue-400" />
                  <h3 className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-[0.2em]">Asistencias</h3>
                  <div className="h-px flex-1 bg-white/5" />
                </div>
                
                {assists.length === 0 ? (
                  <p className="text-[10px] text-[#2D2D2D] font-black uppercase text-center py-4 border border-dashed border-white/5 rounded-xl">Sin asistencias registradas</p>
                ) : (
                  <div className="grid gap-2">
                    {assists.map((a, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-1 h-4 rounded-full ${a.clubId === match.home_club_id ? 'bg-[#00FF85]' : 'bg-blue-400'}`} />
                          <p className="text-sm font-bold text-white uppercase tracking-tight">{a.name}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-white">{a.count}</span>
                          <span className="text-[10px] font-black text-[#6A6C6E] uppercase">ASI{a.count > 1 ? 'STS' : 'ST'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* MVP */}
              {mvp && (
                <section className="space-y-4">
                  <div className="flex items-center gap-2 h-4">
                    <Star className="w-4 h-4 text-amber-400" />
                    <h3 className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-[0.2em]">MVP del Partido</h3>
                    <div className="h-px flex-1 bg-white/5" />
                  </div>
                  
                  <div className="relative group overflow-hidden p-0.5 rounded-2xl bg-gradient-to-br from-amber-400/20 to-transparent">
                    <div className="p-4 rounded-2xl bg-black flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl bg-[#141414] border border-white/10 flex items-center justify-center p-2 shadow-2xl overflow-hidden shrink-0">
                        {mvp.player.photo_url ? (
                          <img src={mvp.player.photo_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Star className="w-8 h-8 text-amber-400/20" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-black text-white uppercase tracking-tighter truncate leading-none mb-1">{mvp.player.name}</p>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-black border border-white/5 flex items-center justify-center p-0.5">
                            {mvp.club.shield_url ? (
                              <img src={mvp.club.shield_url} alt="" className="w-full h-full object-contain" />
                            ) : (
                              <Shield className="w-2 h-2 text-[#6A6C6E]" />
                            )}
                          </div>
                          <p className="text-[10px] font-bold text-[#6A6C6E] uppercase tracking-widest truncate">{mvp.club.name}</p>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center shadow-[0_0_15px_rgba(251,191,36,0.5)]">
                        <Star className="w-4 h-4 text-black fill-current" />
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>
            
            <div className="mt-auto p-6 border-t border-white/5">
              <button 
                onClick={onClose}
                className="w-full h-11 bg-white/[0.05] hover:bg-white/[0.1] text-[#6A6C6E] hover:text-white font-black uppercase tracking-widest text-[9px] rounded-xl transition-all"
              >
                Cerrar Informe
              </button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
