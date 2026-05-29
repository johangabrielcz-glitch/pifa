'use client'

import { useEffect, useState, use, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Calendar, ChevronUp, ChevronDown, Save, Lock, ChevronLeft, Swords, LayoutList, Trophy, Clock, Pencil, RotateCcw, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { computeSeasonSchedule, DEFAULT_GAP_HOURS, type ScheduleMatchInput } from '@/lib/match-engine'
import { toast } from 'sonner'
import type { Season, Competition, Match, Club } from '@/lib/types'

interface MatchWithDetails extends Match {
  home_club: Club | null
  away_club: Club | null
  competition: Competition
}

// datetime-local <-> ISO helpers (local time, no seconds)
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function localInputToISO(local: string): string {
  return new Date(local).toISOString()
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

  // View + schedule config
  const [viewMode, setViewMode] = useState<'order' | 'calendar'>('order')
  const [anchorLocal, setAnchorLocal] = useState<string>('') // '' = relative to activation
  const [gapHours, setGapHours] = useState<number>(DEFAULT_GAP_HOURS)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [editingSlot, setEditingSlot] = useState<string | null>(null)
  // Stable "now" for previewing the relative model without jitter on re-render
  const [previewNow] = useState<number>(() => Date.now())

  const isEditable = season?.status === 'draft'

  const loadData = async () => {
    setIsLoading(true)
    const { data: seasonData } = await supabase.from('seasons').select('*').eq('id', seasonId).single()
    if (seasonData) {
      setSeason(seasonData)
      setAnchorLocal(isoToLocalInput((seasonData as any).deadline_anchor ?? null))
      setGapHours((seasonData as any).deadline_gap_hours ?? DEFAULT_GAP_HOURS)
      setOverrides(((seasonData as any).deadline_overrides ?? {}) as Record<string, string>)
    }

    const { data: compsData } = await supabase.from('competitions').select('*').eq('season_id', seasonId).order('created_at')
    if (compsData) {
      setCompetitions(compsData)
      if (compsData.length > 0) {
        const { data: matchesData } = await supabase
          .from('matches')
          .select(`*, home_club:clubs!matches_home_club_id_fkey(*), away_club:clubs!matches_away_club_id_fkey(*), competition:competitions!inner(*)`)
          .in('competition_id', compsData.map(c => c.id))
          .order('match_order', { ascending: true })
        if (matchesData) {
          // Normalize orders to be 1..N unique immediately to avoid "stuck" bugs
          const normalized = (matchesData as MatchWithDetails[]).map((m, i) => ({ ...m, match_order: i + 1 }))
          setMatches(normalized)
        }
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

    // To move in the full list when filtered, we find the absolute goal position
    const targetMatch = filteredMatches[newIndex]
    moveToPosition(filteredMatches[index].id, targetMatch.match_order)
  }

  const moveToPosition = (matchId: string, newRequestedPosition: number) => {
    if (!isEditable) return
    const pos = Math.max(1, Math.min(newRequestedPosition, matches.length))
    const list = [...matches]
    const index = list.findIndex(m => m.id === matchId)
    if (index === -1) return

    const [movedMatch] = list.splice(index, 1)
    list.splice(pos - 1, 0, movedMatch)

    // Critical: Re-index everything to maintain 1..N uniqueness
    const normalized = list.map((m, i) => ({ ...m, match_order: i + 1 }))
    setMatches(normalized)
    setHasChanges(true)
  }

  // ---- Schedule preview (same engine as activation) ----
  const scheduleInput: ScheduleMatchInput[] = useMemo(
    () => matches.map(m => ({
      id: m.id,
      matchday: m.matchday,
      leg: m.leg,
      match_order: m.match_order,
      type: m.competition.type,
    })),
    [matches]
  )

  const anchorMs = anchorLocal ? new Date(anchorLocal).getTime() : previewNow

  const schedule = useMemo(
    () => computeSeasonSchedule(scheduleInput, { anchorMs, gapHours, overrides }),
    [scheduleInput, anchorMs, gapHours, overrides]
  )

  const matchById = useMemo(() => {
    const map: Record<string, MatchWithDetails> = {}
    matches.forEach(m => { map[m.id] = m })
    return map
  }, [matches])

  const tbdCount = useMemo(() => matches.filter(m => !m.home_club_id || !m.away_club_id).length, [matches])

  const setOverride = (slotKey: string, local: string) => {
    if (!isEditable) return
    setOverrides(prev => ({ ...prev, [slotKey]: localInputToISO(local) }))
    setHasChanges(true)
  }
  const clearOverride = (slotKey: string) => {
    if (!isEditable) return
    setOverrides(prev => {
      const next = { ...prev }
      delete next[slotKey]
      return next
    })
    setHasChanges(true)
  }

  const saveAll = async () => {
    if (!isEditable) return
    setIsSaving(true)
    try {
      // 1. Persist match order
      for (const match of matches) {
        await supabase.from('matches').update({ match_order: match.match_order }).eq('id', match.id)
      }
      // 2. Persist schedule config on the season
      await (supabase.from('seasons') as any)
        .update({
          deadline_anchor: anchorLocal ? localInputToISO(anchorLocal) : null,
          deadline_gap_hours: gapHours,
          deadline_overrides: overrides,
          updated_at: new Date().toISOString(),
        })
        .eq('id', seasonId)
      // 3. Materialize deadlines on matches so the preview matches stored data.
      //    For the relative model we anchor at "now" here; activation re-anchors.
      const { perMatch } = computeSeasonSchedule(scheduleInput, {
        anchorMs: anchorLocal ? new Date(anchorLocal).getTime() : Date.now(),
        gapHours,
        overrides,
      })
      for (const [id, deadline] of Object.entries(perMatch)) {
        await supabase.from('matches').update({ deadline }).eq('id', id)
      }
      toast.success('Calendario sincronizado')
      setHasChanges(false)
    } catch (error) {
      toast.error('Error al guardar el calendario')
    } finally {
      setIsSaving(false)
    }
  }

  const filteredMatches = filterCompetition === 'all' ? matches : matches.filter(m => m.competition_id === filterCompetition)

  // Slots filtered by competition for the calendar view
  const filteredSlots = useMemo(() => {
    if (filterCompetition === 'all') return schedule.slots
    return schedule.slots
      .map(s => ({ ...s, matchIds: s.matchIds.filter(id => matchById[id]?.competition_id === filterCompetition) }))
      .filter(s => s.matchIds.length > 0)
  }, [schedule.slots, filterCompetition, matchById])

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
              onClick={saveAll}
              disabled={isSaving}
              className="h-11 px-5 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-xl flex items-center gap-2.5 font-black uppercase tracking-widest text-[10px] shadow-[0_0_20px_rgba(255,49,49,0.3)] transition-all active:scale-95"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </button>
          )}
        </div>

        {/* View tabs */}
        <div className="px-6 pb-3 flex gap-2">
          <button
            onClick={() => setViewMode('order')}
            className={`flex-1 h-9 rounded-xl text-[9px] font-black uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition-all border ${
              viewMode === 'order' ? 'bg-[#FF3131] text-white border-[#FF3131]' : 'bg-[#141414] text-[#6A6C6E] border-white/[0.04] hover:text-white'
            }`}
          >
            <LayoutList size={13} /> Orden
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`flex-1 h-9 rounded-xl text-[9px] font-black uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition-all border ${
              viewMode === 'calendar' ? 'bg-[#FF3131] text-white border-[#FF3131]' : 'bg-[#141414] text-[#6A6C6E] border-white/[0.04] hover:text-white'
            }`}
          >
            <Calendar size={13} /> Calendario
          </button>
        </div>

        {/* Competition filters */}
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
        ) : viewMode === 'order' ? (
          /* ===================== ORDER VIEW ===================== */
          <div className="space-y-4">
            {filteredMatches.map((match, index) => {
              const isTBD = !match.home_club_id || !match.away_club_id
              return (
                <div
                  key={match.id}
                  className={`group relative flex items-center gap-4 animate-fade-in-up ${isTBD ? 'opacity-40 grayscale' : ''}`}
                  style={{ animationDelay: `${index * 20}ms` }}
                >
                  {/* Sequence Number & Quick Move */}
                  <div className="relative z-10 w-12 flex-shrink-0 text-center flex flex-col items-center gap-1">
                    {isEditable ? (
                      <input
                        type="number"
                        className="w-10 h-7 bg-black border border-[#202020] rounded-lg text-[10px] font-black text-[#FF3131] text-center focus:border-[#FF3131] outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={match.match_order}
                        onChange={(e) => moveToPosition(match.id, parseInt(e.target.value) || match.match_order)}
                      />
                    ) : (
                      <p className="text-[10px] font-black text-[#2D2D2D] group-hover:text-[#FF3131] transition-colors">{match.match_order}</p>
                    )}
                    <span className="text-[6px] text-[#2D2D2D] font-black uppercase">ORDEN</span>
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
        ) : (
          /* ===================== CALENDAR VIEW ===================== */
          <div className="space-y-5">
            {/* Schedule config */}
            <div className="bg-[#141414]/50 backdrop-blur-xl rounded-[24px] border border-white/[0.04] p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-[#FF3131]" />
                <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">PARÁMETROS DE PLAZOS</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest">Ancla (inicio)</label>
                  <input
                    type="datetime-local"
                    disabled={!isEditable}
                    value={anchorLocal}
                    onChange={(e) => { setAnchorLocal(e.target.value); setHasChanges(true) }}
                    className="mt-1.5 w-full h-10 bg-black border border-[#202020] rounded-xl px-3 text-[11px] font-bold text-white focus:border-[#FF3131] outline-none disabled:opacity-40 [color-scheme:dark]"
                  />
                  <p className="text-[7px] text-[#2D2D2D] font-bold uppercase tracking-widest mt-1">
                    {anchorLocal ? 'Fecha fija (se respeta al activar)' : 'Vacío = relativo a la activación'}
                  </p>
                </div>
                <div>
                  <label className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest">Separación (horas)</label>
                  <input
                    type="number"
                    min={1}
                    disabled={!isEditable}
                    value={gapHours}
                    onChange={(e) => { setGapHours(Math.max(1, parseInt(e.target.value) || DEFAULT_GAP_HOURS)); setHasChanges(true) }}
                    className="mt-1.5 w-full h-10 bg-black border border-[#202020] rounded-xl px-3 text-[11px] font-bold text-white focus:border-[#FF3131] outline-none disabled:opacity-40"
                  />
                  <p className="text-[7px] text-[#2D2D2D] font-bold uppercase tracking-widest mt-1">Entre jornadas consecutivas</p>
                </div>
              </div>
              {anchorLocal === '' && (
                <p className="text-[8px] text-amber-500/80 font-bold uppercase tracking-widest">⚠ Previsualizado desde ahora; al activar se recalcula desde ese momento.</p>
              )}
              {tbdCount > 0 && (
                <p className="text-[8px] text-[#6A6C6E] font-bold uppercase tracking-widest flex items-center gap-1.5">
                  <AlertTriangle size={11} className="text-amber-500" /> {tbdCount} encuentro(s) por definir (TBD) en el calendario.
                </p>
              )}
            </div>

            {/* Slots by day */}
            <div className="space-y-3">
              {filteredSlots.map((slot) => {
                const slotMatches = slot.matchIds.map(id => matchById[id]).filter(Boolean)
                const comps = Array.from(new Set(slotMatches.map(m => m!.competition.name)))
                const isParallel = comps.length > 1
                return (
                  <div key={slot.slotKey} className="bg-[#141414]/40 backdrop-blur-xl rounded-[24px] border border-white/[0.04] overflow-hidden">
                    {/* Slot header */}
                    <div className="px-5 py-3 flex items-center justify-between border-b border-white/[0.04] bg-[#0A0A0A]/40">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-black border border-[#202020] flex items-center justify-center text-[10px] font-black text-[#FF3131] shrink-0 tabular-nums">
                          {slot.dayIndex}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-black text-white uppercase tracking-tight">
                              {format(new Date(slot.deadline), "EEE d MMM · HH:mm", { locale: es })}
                            </span>
                            {slot.overridden && <span className="text-[7px] font-black text-[#FF3131] bg-[#FF3131]/10 px-1.5 py-0.5 rounded uppercase tracking-widest">Fijado</span>}
                            {isParallel && <span className="text-[7px] font-black text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded uppercase tracking-widest">Paralelo</span>}
                          </div>
                          <p className="text-[7px] text-[#6A6C6E] font-bold uppercase tracking-widest truncate mt-0.5">
                            {slot.category === 'league' ? 'Liga' : 'Copa'} · J{slot.matchday}{slot.leg > 1 ? ` · Vuelta` : ''} · {slotMatches.length} partido(s)
                          </p>
                        </div>
                      </div>
                      {isEditable && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => setEditingSlot(editingSlot === slot.slotKey ? null : slot.slotKey)}
                            className="w-7 h-7 rounded-lg bg-black border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white hover:border-[#FF3131]/40 transition-all"
                          >
                            <Pencil size={12} />
                          </button>
                          {slot.overridden && (
                            <button
                              onClick={() => clearOverride(slot.slotKey)}
                              className="w-7 h-7 rounded-lg bg-black border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white hover:border-[#FF3131]/40 transition-all"
                              title="Volver a relativo"
                            >
                              <RotateCcw size={12} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Inline override editor */}
                    {isEditable && editingSlot === slot.slotKey && (
                      <div className="px-5 py-3 bg-black/30 border-b border-white/[0.04] flex items-center gap-3">
                        <input
                          type="datetime-local"
                          value={isoToLocalInput(slot.deadline)}
                          onChange={(e) => e.target.value && setOverride(slot.slotKey, e.target.value)}
                          className="flex-1 h-9 bg-black border border-[#202020] rounded-xl px-3 text-[11px] font-bold text-white focus:border-[#FF3131] outline-none [color-scheme:dark]"
                        />
                        <button
                          onClick={() => setEditingSlot(null)}
                          className="h-9 px-3 rounded-xl bg-[#FF3131] text-white text-[9px] font-black uppercase tracking-widest"
                        >
                          Ok
                        </button>
                      </div>
                    )}

                    {/* Matches in slot (= simultaneous) */}
                    <div className="p-3 space-y-2">
                      {slotMatches.map((m) => {
                        const isTBD = !m!.home_club_id || !m!.away_club_id
                        return (
                          <div key={m!.id} className={`bg-[#0A0A0A]/40 border border-white/[0.02] rounded-2xl px-4 py-3 flex items-center justify-between ${isTBD ? 'opacity-40 grayscale' : ''}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2.5 text-[11px] font-black text-white uppercase">
                                <span className="truncate">{m!.home_club?.name || 'TBD'}</span>
                                <span className="text-[#2D2D2D]">VS</span>
                                <span className="truncate">{m!.away_club?.name || 'TBD'}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[#FF3131]">{getCompetitionIcon(m!.competition.type)}</span>
                                <span className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-widest truncate">{m!.competition.name} · {m!.round_name}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
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
