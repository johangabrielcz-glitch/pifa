'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Calendar, ChevronUp, ChevronDown, Save, Lock, ChevronLeft, Swords, LayoutList, Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
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
    const { data: seasonData } = await supabase.from('seasons').select('*').eq('id', seasonId).single()
    if (seasonData) setSeason(seasonData)
    
    const { data: compsData } = await supabase.from('competitions').select('*').eq('season_id', seasonId).order('created_at')
    if (compsData) {
      setCompetitions(compsData)
      if (compsData.length > 0) {
        const { data: matchesData } = await supabase
          .from('matches')
          .select(`*, home_club:clubs!matches_home_club_id_fkey(*), away_club:clubs!matches_away_club_id_fkey(*), competition:competitions!inner(*)`)
          .in('competition_id', compsData.map(c => c.id))
          .order('match_order', { ascending: true })
        if (matchesData) setMatches(matchesData as MatchWithDetails[])
      }
    }
    setIsLoading(false)
    setHasChanges(false)
  }

  useEffect(() => { loadData() }, [seasonId])

  const moveMatch = (index: number, direction: 'up' | 'down') => {
    if (!isEditable) return
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= filteredMatches.length) return
    
    const newMatches = [...matches]
    const filteredMatch = filteredMatches[index]
    const swapMatch = filteredMatches[newIndex]
    
    const actualIndex = matches.findIndex(m => m.id === filteredMatch.id)
    const actualSwapIndex = matches.findIndex(m => m.id === swapMatch.id)
    
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
        await supabase.from('matches').update({ match_order: match.match_order }).eq('id', match.id)
      }
      toast.success('Orden de enfrentamientos sincronizado')
      setHasChanges(false)
    } catch (error) { 
      toast.error('Error al guardar el nuevo orden táctico') 
    } finally { 
      setIsSaving(false) 
    }
  }

  const filteredMatches = filterCompetition === 'all' ? matches : matches.filter(m => m.competition_id === filterCompetition)

  const getCompetitionIcon = (type: string) => {
    switch (type) {
      case 'league': return <LayoutList size={14} />
      case 'cup': return <Trophy size={14} />
      default: return <Swords size={14} />
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
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-black text-white uppercase tracking-tight">CALENDARIO <span className="text-[#FF3131]">GLOBAL</span></h1>
              <p className="text-[10px] text-[#6A6C6E] font-black uppercase tracking-[0.2em]">{season?.name} · {matches.length} ENCUENTROS</p>
            </div>
          </div>
          {isEditable && hasChanges && (
            <button 
              onClick={saveOrder} 
              disabled={isSaving}
              className="h-11 px-5 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-xl flex items-center gap-2.5 font-black uppercase tracking-widest text-[10px] shadow-[0_0_20px_rgba(255,49,49,0.3)] transition-all active:scale-95"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar Orden
            </button>
          )}
        </div>
        
        {/* Filters */}
        <div className="px-6 pb-4">
           {competitions.length > 1 && (
             <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                <button
                  onClick={() => setFilterCompetition('all')}
                  className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap border ${
                    filterCompetition === 'all' 
                      ? 'bg-[#FF3131] text-white border-[#FF3131]' 
                      : 'bg-[#141414] text-[#6A6C6E] border-white/[0.04] hover:text-white hover:border-white/10'
                  }`}
                >
                  TODOS LOS EVENTOS
                </button>
                {competitions.map(comp => (
                  <button
                    key={comp.id}
                    onClick={() => setFilterCompetition(comp.id)}
                    className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap border ${
                      filterCompetition === comp.id
                        ? 'bg-[#FF3131] text-white border-[#FF3131]' 
                        : 'bg-[#141414] text-[#6A6C6E] border-white/[0.04] hover:text-white hover:border-white/10'
                    }`}
                  >
                    {comp.name}
                  </button>
                ))}
             </div>
           )}
        </div>
      </header>

      <div className="px-6 py-6 pb-32">
        {matches.length === 0 ? (
          <div className="text-center py-20 bg-[#141414]/30 rounded-[32px] border border-dashed border-white/[0.06] animate-fade-in-up">
            <Calendar className="w-16 h-16 text-[#2D2D2D] mx-auto mb-6" />
            <p className="text-[#6A6C6E] font-black uppercase tracking-[0.2em] text-[10px]">PROGRAMACIÓN DE ENCUENTROS VACÍA</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredMatches.map((match, index) => {
              const isTBD = !match.home_club_id || !match.away_club_id
              return (
                <div 
                  key={match.id} 
                  className={`group relative flex items-center gap-4 animate-fade-in-up ${isTBD ? 'opacity-40 grayscale' : ''}`}
                  style={{ animationDelay: `${index * 20}ms` }}
                >
                  {/* Sequence Number */}
                  <div className="relative z-10 w-10 flex-shrink-0 text-center">
                    <p className="text-[10px] font-black text-[#2D2D2D] group-hover:text-[#FF3131] transition-colors">{match.match_order}</p>
                  </div>
                  
                  {/* Match Card */}
                  <div className="flex-1 bg-[#141414]/50 backdrop-blur-xl rounded-[24px] p-4 border border-white/[0.04] flex items-center justify-between group-hover:border-[#FF3131]/20 transition-all">
                     <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                           <span className="text-xs font-black text-white uppercase tracking-tight truncate">
                             {match.home_club?.name || 'POR DEFINIR'}
                           </span>
                           <span className="text-[9px] font-black text-[#2D2D2D]">VS</span>
                           <span className="text-xs font-black text-white uppercase tracking-tight truncate">
                             {match.away_club?.name || 'POR DEFINIR'}
                           </span>
                        </div>
                        <div className="flex items-center gap-2">
                           <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 border border-white/5">
                              <span className="text-[#FF3131]">{getCompetitionIcon(match.competition.type)}</span>
                              <span className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest">{match.competition.name}</span>
                           </div>
                           <span className="text-[8px] text-[#2D2D2D] font-black uppercase tracking-widest">{match.round_name}</span>
                        </div>
                     </div>
                     
                     <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest ${
                          match.status === 'finished' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                          match.status === 'in_progress' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 animate-pulse' :
                          'bg-white/5 text-[#2D2D2D] border border-white/5'
                        }`}>
                          {match.status === 'finished' ? 'Finalizado' : match.status === 'in_progress' ? 'En Vivo' : 'Pendiente'}
                        </span>
                        
                        {isEditable && (
                          <div className="flex flex-col gap-1">
                            <button 
                              onClick={() => moveMatch(index, 'up')} 
                              disabled={index === 0}
                              className="w-7 h-7 rounded-lg bg-black border border-[#202020] flex items-center justify-center text-[#2D2D2D] hover:text-white hover:border-[#FF3131]/40 transition-all disabled:opacity-10"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button 
                              onClick={() => moveMatch(index, 'down')} 
                              disabled={index === filteredMatches.length - 1}
                              className="w-7 h-7 rounded-lg bg-black border border-[#202020] flex items-center justify-center text-[#2D2D2D] hover:text-white hover:border-[#FF3131]/40 transition-all disabled:opacity-10"
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>
                        )}
                     </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {!isEditable && (
        <div className="fixed bottom-6 left-6 right-6 z-40 p-4 bg-[#FF3131]/10 backdrop-blur-xl border border-[#FF3131]/20 rounded-[20px] shadow-2xl animate-fade-in-up">
           <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#FF3131]/20 flex items-center justify-center">
                 <Lock className="w-5 h-5 text-[#FF3131]" />
              </div>
              <div>
                 <p className="text-[10px] text-white font-black uppercase tracking-widest">REGISTRO DE ORDEN BLOQUEADO</p>
                 <p className="text-[9px] text-[#6A6C6E] font-medium uppercase tracking-tight mt-0.5">El ciclo está activo. No se permiten reestructuraciones tácticas.</p>
              </div>
           </div>
        </div>
      )}
    </div>
  )
}
