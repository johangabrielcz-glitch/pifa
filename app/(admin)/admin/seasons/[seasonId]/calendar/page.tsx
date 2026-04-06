'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Calendar, ChevronUp, ChevronDown, Save, Lock, AlertTriangle } from 'lucide-react'
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

  // Check if season is editable (only draft status)
  const isEditable = season?.status === 'draft'

  const loadData = async () => {
    setIsLoading(true)
    
    // Load season
    const { data: seasonData, error: seasonError } = await supabase
      .from('seasons')
      .select('*')
      .eq('id', seasonId)
      .single()
    
    if (seasonError || !seasonData) {
      toast.error('Temporada no encontrada')
      router.push('/admin/seasons')
      return
    }
    setSeason(seasonData)
    
    // Load competitions
    const { data: compsData } = await supabase
      .from('competitions')
      .select('*')
      .eq('season_id', seasonId)
      .order('created_at')
    
    if (compsData) {
      setCompetitions(compsData)
    }
    
    // Load all matches from all competitions in this season
    if (compsData && compsData.length > 0) {
      const { data: matchesData } = await supabase
        .from('matches')
        .select(`
          *,
          home_club:clubs!matches_home_club_id_fkey(*),
          away_club:clubs!matches_away_club_id_fkey(*),
          competition:competitions!inner(*)
        `)
        .in('competition_id', compsData.map(c => c.id))
        .order('match_order', { ascending: true })
      
      if (matchesData) {
        setMatches(matchesData as MatchWithDetails[])
      }
    }
    
    setIsLoading(false)
    setHasChanges(false)
  }

  useEffect(() => {
    loadData()
  }, [seasonId])

  const moveMatch = (index: number, direction: 'up' | 'down') => {
    if (!isEditable) return
    
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= filteredMatches.length) return
    
    // Get actual indices in full matches array
    const filteredMatch = filteredMatches[index]
    const swapMatch = filteredMatches[newIndex]
    
    const actualIndex = matches.findIndex(m => m.id === filteredMatch.id)
    const actualSwapIndex = matches.findIndex(m => m.id === swapMatch.id)
    
    const newMatches = [...matches]
    
    // Swap match_order values
    const tempOrder = newMatches[actualIndex].match_order
    newMatches[actualIndex].match_order = newMatches[actualSwapIndex].match_order
    newMatches[actualSwapIndex].match_order = tempOrder
    
    // Sort by new order
    newMatches.sort((a, b) => a.match_order - b.match_order)
    
    setMatches(newMatches)
    setHasChanges(true)
  }

  const saveOrder = async () => {
    if (!isEditable) return
    setIsSaving(true)
    
    try {
      // Update all matches with new order
      for (const match of matches) {
        await supabase
          .from('matches')
          .update({ match_order: match.match_order, updated_at: new Date().toISOString() })
          .eq('id', match.id)
      }
      
      toast.success('Orden guardado')
      setHasChanges(false)
    } catch (error) {
      toast.error('Error al guardar orden')
    } finally {
      setIsSaving(false)
    }
  }

  const filteredMatches = filterCompetition === 'all' 
    ? matches 
    : matches.filter(m => m.competition_id === filterCompetition)

  const getCompetitionColor = (type: string): string => {
    switch (type) {
      case 'league': return 'bg-blue-500/20 text-blue-400'
      case 'cup': return 'bg-pifa-gold/20 text-pifa-gold'
      case 'groups_knockout': return 'bg-purple-500/20 text-purple-400'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  const getStatusBadge = (match: MatchWithDetails) => {
    if (match.status === 'finished') {
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-400">Jugado</span>
    }
    if (match.status === 'in_progress') {
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/20 text-yellow-400">En juego</span>
    }
    if (!match.home_club_id || !match.away_club_id) {
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">Por definir</span>
    }
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400">Pendiente</span>
  }

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-dvh safe-area-top pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <Link href={`/admin/seasons/${seasonId}`} className="p-2 -ml-2 rounded-xl touch-active">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Link>
            <div>
              <h1 className="font-bold text-foreground">Calendario Global</h1>
              <p className="text-xs text-muted-foreground">{season?.name}</p>
            </div>
          </div>
          {isEditable && hasChanges && (
            <Button onClick={saveOrder} disabled={isSaving} size="sm" className="gap-1.5 rounded-xl">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </Button>
          )}
        </div>
        
        {/* Read-only indicator */}
        {!isEditable && (
          <div className="px-4 pb-2">
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <Lock className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-amber-500">Temporada activa - Solo lectura</span>
            </div>
          </div>
        )}
        
        {/* Competition Filter */}
        {competitions.length > 1 && (
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setFilterCompetition('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filterCompetition === 'all' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              Todas ({matches.length})
            </button>
            {competitions.map(comp => {
              const count = matches.filter(m => m.competition_id === comp.id).length
              return (
                <button
                  key={comp.id}
                  onClick={() => setFilterCompetition(comp.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    filterCompetition === comp.id 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
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
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No hay partidos generados</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Genera partidos en cada competicion primero
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {isEditable && (
              <p className="text-xs text-muted-foreground mb-3">
                Usa las flechas para reordenar los partidos. El orden determina cuando se juega cada partido.
              </p>
            )}
            
            {filteredMatches.map((match, index) => (
              <div 
                key={match.id}
                className={`flex items-center gap-2 bg-card rounded-xl p-3 border border-border pifa-shadow ${
                  (!match.home_club_id || !match.away_club_id) ? 'opacity-70' : ''
                }`}
              >
                {/* Order number */}
                <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center text-sm font-bold text-muted-foreground shrink-0">
                  {match.match_order}
                </div>
                
                {/* Match info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium text-sm truncate max-w-[80px] ${
                      match.home_club_id ? 'text-foreground' : 'text-muted-foreground italic'
                    }`}>
                      {match.home_club?.name || 'Por definir'}
                    </span>
                    <span className="text-xs text-muted-foreground">vs</span>
                    <span className={`font-medium text-sm truncate max-w-[80px] ${
                      match.away_club_id ? 'text-foreground' : 'text-muted-foreground italic'
                    }`}>
                      {match.away_club?.name || 'Por definir'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getCompetitionColor(match.competition?.type || '')}`}>
                      {match.competition?.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{match.round_name}</span>
                    {getStatusBadge(match)}
                  </div>
                </div>
                
                {/* Reorder buttons - only show if editable */}
                {isEditable && (
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      onClick={() => moveMatch(index, 'up')}
                      disabled={index === 0}
                      className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => moveMatch(index, 'down')}
                      disabled={index === filteredMatches.length - 1}
                      className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
