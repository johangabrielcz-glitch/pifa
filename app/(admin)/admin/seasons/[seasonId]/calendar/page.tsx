'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Calendar, ChevronUp, ChevronDown, Save, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { Season, Competition, Match, Club } from '@/lib/types'

interface MatchWithDetails extends Match {
  home_club: Club | null
  away_club: Club | null
  competition: Competition
}

export default function SeasonCalendarPage({ params }: { params: Promise<{ seasonId: string }> }) {
  const { seasonId } = use(params)
  const router = useRouter()
  
  const [season, setSeason] = useState<Season | null>(null)
  const [matches, setMatches] = useState<MatchWithDetails[]>([])
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [filterCompetition, setFilterCompetition] = useState<string>('all')

  const isEditable = season?.status === 'draft'

  const loadData = async () => {
    setIsLoading(true)
    const { data: seasonData, error: seasonError } = await supabase.from('seasons').select('*').eq('id', seasonId).single()
    if (seasonError || !seasonData) { toast.error('Temporada no encontrada'); router.push('/admin/seasons'); return }
    setSeason(seasonData)
    const { data: compsData } = await supabase.from('competitions').select('*').eq('season_id', seasonId).order('created_at')
    if (compsData) setCompetitions(compsData)
    if (compsData && compsData.length > 0) {
      const { data: matchesData } = await supabase.from('matches').select(`*, home_club:clubs!matches_home_club_id_fkey(*), away_club:clubs!matches_away_club_id_fkey(*), competition:competitions!inner(*)`).in('competition_id', compsData.map(c => c.id)).order('match_order', { ascending: true })
      if (matchesData) setMatches(matchesData as MatchWithDetails[])
    }
    setIsLoading(false)
    setHasChanges(false)
  }

  useEffect(() => { loadData() }, [seasonId])

  const moveMatch = (index: number, direction: 'up' | 'down') => {
    if (!isEditable) return
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= filteredMatches.length) return
    const filteredMatch = filteredMatches[index]
    const swapMatch = filteredMatches[newIndex]
    const actualIndex = matches.findIndex(m => m.id === filteredMatch.id)
    const actualSwapIndex = matches.findIndex(m => m.id === swapMatch.id)
    const newMatches = [...matches]
    const tempOrder = newMatches[actualIndex].match_order
    newMatches[actualIndex].match_order = newMatches[actualSwapIndex].match_order
    newMatches[actualSwapIndex].match_order = tempOrder
    newMatches.sort((a, b) => a.match_order - b.match_order)
    setMatches(newMatches)
    setHasChanges(true)
  }

  const saveOrder = async () => {
    if (!isEditable) return
    setIsSaving(true)
    try {
      for (const match of matches) {
        await supabase.from('matches').update({ match_order: match.match_order, updated_at: new Date().toISOString() }).eq('id', match.id)
      }
      toast.success('Orden guardado')
      setHasChanges(false)
    } catch (error) { toast.error('Error al guardar orden') } finally { setIsSaving(false) }
  }

  const filteredMatches = filterCompetition === 'all' ? matches : matches.filter(m => m.competition_id === filterCompetition)

  const getCompetitionColor = (type: string): string => {
    switch (type) {
      case 'league': return 'bg-blue-500/15 text-blue-400 ring-blue-400/20'
      case 'cup': return 'bg-amber-400/15 text-amber-400 ring-amber-400/20'
      case 'groups_knockout': return 'bg-purple-500/15 text-purple-400 ring-purple-400/20'
      default: return 'bg-muted/20 text-muted-foreground'
    }
  }

  const getStatusDot = (match: MatchWithDetails) => {
    if (match.status === 'finished') return 'bg-emerald-400 shadow-emerald-400/30'
    if (match.status === 'in_progress') return 'bg-yellow-400 shadow-yellow-400/30 animate-pulse'
    if (!match.home_club_id || !match.away_club_id) return 'bg-muted-foreground/30'
    return 'bg-blue-400 shadow-blue-400/30'
  }

  const getStatusLabel = (match: MatchWithDetails) => {
    if (match.status === 'finished') return { text: 'Jugado', class: 'bg-emerald-400/10 text-emerald-400' }
    if (match.status === 'in_progress') return { text: 'En juego', class: 'bg-yellow-400/10 text-yellow-400' }
    if (!match.home_club_id || !match.away_club_id) return { text: 'TBD', class: 'bg-white/[0.04] text-muted-foreground' }
    return { text: 'Pendiente', class: 'bg-blue-400/10 text-blue-400' }
  }

  if (isLoading) return (<div className="min-h-dvh flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>)

  return (
    <div className="min-h-dvh safe-area-top pb-24">
      {/* Header */}
      <header className="sticky top-[57px] z-30 bg-background/80 backdrop-blur-2xl border-b border-white/[0.06]">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <Link href={`/admin/seasons/${seasonId}`} className="p-2 -ml-2 rounded-xl active:scale-95 transition-transform"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></Link>
            <div>
              <h1 className="font-bold text-foreground">Calendario Global</h1>
              <p className="text-[10px] text-muted-foreground">{season?.name} · {matches.length} partidos</p>
            </div>
          </div>
          {isEditable && hasChanges && (
            <Button onClick={saveOrder} disabled={isSaving} size="sm" className="gap-1.5 rounded-xl shadow-lg shadow-primary/20">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar
            </Button>
          )}
        </div>
        
        {!isEditable && (
          <div className="px-4 pb-2">
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/8 border border-amber-500/15 rounded-xl">
              <Lock className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[11px] text-amber-500 font-medium">Temporada activa — Solo lectura</span>
            </div>
          </div>
        )}
        
        {competitions.length > 1 && (
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
            <button onClick={() => setFilterCompetition('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 ${filterCompetition === 'all' ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' : 'bg-card/60 text-muted-foreground border border-white/[0.06]'}`}>
              Todas ({matches.length})
            </button>
            {competitions.map(comp => {
              const count = matches.filter(m => m.competition_id === comp.id).length
              return (
                <button key={comp.id} onClick={() => setFilterCompetition(comp.id)} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 ${filterCompetition === comp.id ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' : 'bg-card/60 text-muted-foreground border border-white/[0.06]'}`}>
                  {comp.name} ({count})
                </button>
              )
            })}
          </div>
        )}
      </header>

      {/* Content */}
      <div className="px-4 py-4">
        {matches.length === 0 ? (
          <div className="text-center py-12 animate-fade-in-up">
            <Calendar className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No hay partidos generados</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Genera partidos en cada competición primero</p>
          </div>
        ) : (
          <div className="relative">
            {isEditable && (
              <p className="text-[11px] text-muted-foreground/60 mb-4 px-1">
                Usa las flechas para reordenar los partidos. El orden determina cuándo se juega cada partido.
              </p>
            )}
            
            {/* Timeline line */}
            <div className="absolute left-[22px] top-8 bottom-0 w-px bg-gradient-to-b from-white/[0.06] via-white/[0.04] to-transparent" />
            
            <div className="space-y-1.5">
              {filteredMatches.map((match, index) => {
                const isTBD = !match.home_club_id || !match.away_club_id
                const statusDot = getStatusDot(match)
                const statusLabel = getStatusLabel(match)
                
                return (
                  <div key={match.id} className={`relative flex items-center gap-3 animate-fade-in-up ${isTBD ? 'opacity-50' : ''}`} style={{ animationDelay: `${index * 20}ms` }}>
                    {/* Timeline dot */}
                    <div className="relative z-10 flex-shrink-0">
                      <div className={`w-3 h-3 rounded-full ${statusDot} shadow-md ring-2 ring-background`} />
                    </div>
                    
                    {/* Match card */}
                    <div className="flex-1 flex items-center gap-2 bg-card/50 backdrop-blur-sm rounded-xl p-3 border border-white/[0.04] hover:bg-card/70 transition-colors">
                      {/* Order */}
                      <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-[11px] font-bold text-muted-foreground/60 shrink-0">
                        {match.match_order}
                      </div>
                      
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className={`font-semibold truncate max-w-[80px] ${isTBD ? 'text-muted-foreground italic text-xs' : 'text-foreground'}`}>
                            {match.home_club?.name || 'TBD'}
                          </span>
                          <span className="text-[10px] text-muted-foreground/40 font-medium">vs</span>
                          <span className={`font-semibold truncate max-w-[80px] ${isTBD ? 'text-muted-foreground italic text-xs' : 'text-foreground'}`}>
                            {match.away_club?.name || 'TBD'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ring-1 ${getCompetitionColor(match.competition?.type || '')}`}>
                            {match.competition?.name}
                          </span>
                          <span className="text-[9px] text-muted-foreground/50">{match.round_name}</span>
                        </div>
                      </div>
                      
                      {/* Status */}
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${statusLabel.class}`}>
                        {statusLabel.text}
                      </span>
                    </div>
                    
                    {/* Reorder buttons */}
                    {isEditable && (
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button onClick={() => moveMatch(index, 'up')} disabled={index === 0} className="p-1 rounded-lg hover:bg-white/[0.06] disabled:opacity-20 disabled:cursor-not-allowed transition-colors active:scale-90">
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button onClick={() => moveMatch(index, 'down')} disabled={index === filteredMatches.length - 1} className="p-1 rounded-lg hover:bg-white/[0.06] disabled:opacity-20 disabled:cursor-not-allowed transition-colors active:scale-90">
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
