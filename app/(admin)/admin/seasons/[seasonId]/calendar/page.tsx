'use client'

import { useEffect, useState, use, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Calendar, ChevronUp, ChevronDown, Save, Lock, ChevronLeft, Swords, LayoutList, Trophy, Clock, Pencil, RotateCcw, AlertTriangle, GripVertical, Shuffle, ArrowDownUp, Undo2, Wand2 } from 'lucide-react'
import { Reorder, useDragControls } from 'framer-motion'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { supabase } from '@/lib/supabase'
import { computeSeasonSchedule, DEFAULT_GAP_HOURS, type ScheduleMatchInput } from '@/lib/match-engine'
import { toast } from 'sonner'
import type { Season, Competition, Match, Club } from '@/lib/types'

interface MatchWithDetails extends Match {
  home_club: Club | null
  away_club: Club | null
  competition: Competition
}

// A "block" = group of matches the deadline engine treats as a single slot.
// Reordering at this granularity is far less tedious than match-by-match and
// matches the unit (category, matchday, leg) that computeSeasonSchedule uses.
interface Block {
  blockKey: string // `${competition_id}-${matchday}-${leg}`
  competition: Competition
  matchday: number
  leg: number
  roundLabel: string // e.g. "Jornada 5" or "Cuartos - Ida"
  matches: MatchWithDetails[]
  tbdCount: number
}

function buildBlocks(matches: MatchWithDetails[]): Block[] {
  const map = new Map<string, Block>()
  for (const m of matches) {
    const md = m.matchday || 1
    const leg = m.leg || 1
    const key = `${m.competition_id}-${md}-${leg}`
    let block = map.get(key)
    if (!block) {
      block = {
        blockKey: key,
        competition: m.competition,
        matchday: md,
        leg,
        roundLabel: m.round_name || `Jornada ${md}`,
        matches: [],
        tbdCount: 0,
      }
      map.set(key, block)
    }
    block.matches.push(m)
    if (!m.home_club_id || !m.away_club_id) block.tbdCount++
  }
  // Initial order: by match_order of the first match in each block.
  return Array.from(map.values()).sort((a, b) => a.matches[0].match_order - b.matches[0].match_order)
}

function blocksToMatchOrder(blocks: Block[]): Record<string, number> {
  const out: Record<string, number> = {}
  let n = 1
  for (const b of blocks) for (const m of b.matches) out[m.id] = n++
  return out
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

  // Block-level reordering (Orden tab)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [history, setHistory] = useState<Block[][]>([])
  const [jumpEditing, setJumpEditing] = useState<string | null>(null)

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

  // Rebuild blocks when matches change from a fresh load.
  // (Drag/preset/swap mutations update blocks directly and propagate to matches below.)
  useEffect(() => {
    setBlocks(buildBlocks(matches))
    setHistory([])
  }, [matches.length, matches.map(m => m.id).join('|')])

  // When the user reorders blocks, derive the new match_order and update matches
  // so the Calendar tab and schedule preview reflect changes in real time.
  const applyBlockOrder = (next: Block[], pushHistory = true) => {
    if (!isEditable) return
    if (pushHistory) setHistory(h => [...h.slice(-19), blocks])
    setBlocks(next)
    const orderMap = blocksToMatchOrder(next)
    setMatches(prev => prev.map(m => ({ ...m, match_order: orderMap[m.id] ?? m.match_order })))
    setHasChanges(true)
  }

  const undo = () => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    setBlocks(prev)
    const orderMap = blocksToMatchOrder(prev)
    setMatches(ms => ms.map(m => ({ ...m, match_order: orderMap[m.id] ?? m.match_order })))
    setHasChanges(true)
  }

  const swapBlock = (index: number, dir: 'up' | 'down') => {
    const newIndex = dir === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= blocks.length) return
    const next = [...blocks]
    ;[next[index], next[newIndex]] = [next[newIndex], next[index]]
    applyBlockOrder(next)
  }

  const moveBlockToPosition = (blockKey: string, requestedPos: number) => {
    const pos = Math.max(1, Math.min(requestedPos, blocks.length))
    const idx = blocks.findIndex(b => b.blockKey === blockKey)
    if (idx === -1) return
    const next = [...blocks]
    const [moved] = next.splice(idx, 1)
    next.splice(pos - 1, 0, moved)
    applyBlockOrder(next)
  }

  // Preset: interleave competitions (round-robin between competition queues
  // sorted by matchday asc, leg asc). Covers the "league weekend / cup midweek" pattern.
  const presetInterleave = () => {
    const byComp = new Map<string, Block[]>()
    for (const b of blocks) {
      const arr = byComp.get(b.competition.id) || []
      arr.push(b)
      byComp.set(b.competition.id, arr)
    }
    for (const arr of byComp.values()) {
      arr.sort((a, b) => a.matchday - b.matchday || a.leg - b.leg)
    }
    const queues = Array.from(byComp.values())
    const result: Block[] = []
    let added = true
    while (added) {
      added = false
      for (const q of queues) {
        const next = q.shift()
        if (next) { result.push(next); added = true }
      }
    }
    applyBlockOrder(result)
    toast.success('Bloques intercalados entre competencias')
  }

  // Preset: all of one competition before the next (by competition.created_at).
  const presetSequential = () => {
    const compOrder = new Map(competitions.map((c, i) => [c.id, i]))
    const next = [...blocks].sort((a, b) => {
      const co = (compOrder.get(a.competition.id) ?? 0) - (compOrder.get(b.competition.id) ?? 0)
      if (co !== 0) return co
      if (a.matchday !== b.matchday) return a.matchday - b.matchday
      return a.leg - b.leg
    })
    applyBlockOrder(next)
    toast.success('Bloques ordenados por competencia')
  }


  // ---- Schedule preview (same engine as activation) ----
  const scheduleInput: ScheduleMatchInput[] = useMemo(
    () => matches.map(m => ({
      id: m.id,
      competitionId: m.competition_id,
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

  // Per-block deadline preview: look up the slot a block belongs to by its first
  // match. computeSeasonSchedule may collapse multiple blocks into one slot when
  // they share (category, matchday, leg) — that's the simultaneity rule shown
  // in the Calendar tab; here we just expose the date so each block card knows.
  const slotByMatchId = useMemo(() => {
    const map: Record<string, typeof schedule.slots[number]> = {}
    for (const s of schedule.slots) for (const id of s.matchIds) map[id] = s
    return map
  }, [schedule])

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
          <div className="flex items-center gap-2">
            {isEditable && viewMode === 'order' && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="h-11 w-11 bg-[#141414] border border-white/[0.06] text-white rounded-xl flex items-center justify-center transition-all active:scale-95" title="Auto-orden">
                    <Wand2 className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 bg-[#141414] border-white/[0.08] rounded-2xl p-2 shadow-2xl">
                  <button onClick={presetInterleave} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all text-left">
                    <Shuffle className="w-4 h-4 text-[#FF3131] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-white uppercase tracking-tight">Intercalar</p>
                      <p className="text-[8px] text-[#6A6C6E] font-bold uppercase tracking-wider truncate">Alternar entre competencias</p>
                    </div>
                  </button>
                  <button onClick={presetSequential} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all text-left">
                    <ArrowDownUp className="w-4 h-4 text-[#FF3131] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-white uppercase tracking-tight">Secuencial</p>
                      <p className="text-[8px] text-[#6A6C6E] font-bold uppercase tracking-wider truncate">Una competencia completa, luego la siguiente</p>
                    </div>
                  </button>
                </PopoverContent>
              </Popover>
            )}
            {isEditable && history.length > 0 && (
              <button
                onClick={undo}
                className="h-11 w-11 bg-[#141414] border border-white/[0.06] text-white rounded-xl flex items-center justify-center transition-all active:scale-95"
                title="Deshacer"
              >
                <Undo2 className="w-4 h-4" />
              </button>
            )}
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
          /* ===================== ORDER VIEW (BLOCKS) ===================== */
          <Reorder.Group
            axis="y"
            values={blocks}
            onReorder={(next) => applyBlockOrder(next)}
            className="space-y-3 list-none"
          >
            {blocks.map((block, index) => {
              const slot = slotByMatchId[block.matches[0].id]
              const deadlineLabel = slot ? format(new Date(slot.deadline), "EEE d MMM · HH:mm", { locale: es }) : null
              return (
                <BlockRow
                  key={block.blockKey}
                  block={block}
                  index={index}
                  total={blocks.length}
                  isEditable={!!isEditable}
                  dayIndex={slot?.dayIndex}
                  deadlineLabel={deadlineLabel}
                  jumpEditing={jumpEditing === block.blockKey}
                  onJumpEdit={(open) => setJumpEditing(open ? block.blockKey : null)}
                  onJumpCommit={(n) => { moveBlockToPosition(block.blockKey, n); setJumpEditing(null) }}
                  onUp={() => swapBlock(index, 'up')}
                  onDown={() => swapBlock(index, 'down')}
                  getCompetitionIcon={getCompetitionIcon}
                />
              )
            })}
          </Reorder.Group>
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
              {isEditable && (
                <button
                  onClick={saveAll}
                  disabled={isSaving}
                  className="w-full h-11 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-xl flex items-center justify-center gap-2.5 font-black uppercase tracking-widest text-[10px] shadow-[0_0_20px_rgba(255,49,49,0.3)] transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Recalcular y guardar fechas
                </button>
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

interface BlockRowProps {
  block: Block
  index: number
  total: number
  isEditable: boolean
  dayIndex?: number
  deadlineLabel: string | null
  jumpEditing: boolean
  onJumpEdit: (open: boolean) => void
  onJumpCommit: (n: number) => void
  onUp: () => void
  onDown: () => void
  getCompetitionIcon: (type: string) => React.ReactNode
}

function BlockRow({ block, index, total, isEditable, dayIndex, deadlineLabel, jumpEditing, onJumpEdit, onJumpCommit, onUp, onDown, getCompetitionIcon }: BlockRowProps) {
  const controls = useDragControls()
  const jumpInputRef = useRef<HTMLInputElement | null>(null)
  const isCup = block.competition.type !== 'league'

  return (
    <Reorder.Item
      value={block}
      dragListener={false}
      dragControls={controls}
      className="bg-[#141414]/60 backdrop-blur-xl rounded-[20px] border border-white/[0.04] flex items-stretch overflow-hidden touch-pan-y select-none"
      whileDrag={{ scale: 1.02, boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}
    >
      {/* LEFT: drag handle + position number */}
      <div className="flex items-center gap-1 pl-1.5">
        {isEditable && (
          <button
            onPointerDown={(e) => controls.start(e)}
            className="w-9 h-12 flex items-center justify-center text-[#6A6C6E] hover:text-white touch-none cursor-grab active:cursor-grabbing"
            style={{ touchAction: 'none' }}
            aria-label="Arrastrar bloque"
          >
            <GripVertical className="w-5 h-5" />
          </button>
        )}
        <div className="w-11 flex flex-col items-center justify-center gap-0.5">
          {isEditable && jumpEditing ? (
            <input
              ref={jumpInputRef}
              type="number"
              inputMode="numeric"
              defaultValue={index + 1}
              autoFocus
              onBlur={() => onJumpEdit(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const n = parseInt((e.target as HTMLInputElement).value)
                  if (!isNaN(n)) onJumpCommit(n)
                  else onJumpEdit(false)
                } else if (e.key === 'Escape') onJumpEdit(false)
              }}
              className="w-10 h-7 bg-black border border-[#FF3131] rounded-lg text-[11px] font-black text-[#FF3131] text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          ) : (
            <button
              onClick={() => isEditable && onJumpEdit(true)}
              disabled={!isEditable}
              className="w-10 h-7 bg-black/40 border border-white/[0.04] rounded-lg text-[11px] font-black text-[#FF3131] tabular-nums disabled:cursor-default"
              title="Saltar a posición"
            >
              {index + 1}
            </button>
          )}
          <span className="text-[6px] text-[#2D2D2D] font-black uppercase tracking-widest">Pos</span>
        </div>
      </div>

      {/* CENTER: block label */}
      <div className="flex-1 min-w-0 py-3 px-3 flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[#FF3131]">{getCompetitionIcon(block.competition.type)}</span>
          <span className="text-[10px] font-black text-white uppercase tracking-tight truncate">{block.competition.name}</span>
          <span className="text-[7px] font-black text-white/40 bg-white/5 px-1.5 py-0.5 rounded uppercase tracking-widest">
            {isCup ? 'Copa' : 'Liga'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-black text-white uppercase tracking-tight truncate">{block.roundLabel}</span>
          <span className="text-[8px] text-[#6A6C6E] font-bold uppercase tracking-widest">
            {block.matches.length} {block.matches.length === 1 ? 'partido' : 'partidos'}
          </span>
          {block.tbdCount > 0 && (
            <span className="text-[8px] text-amber-500/80 font-bold uppercase tracking-widest flex items-center gap-1">
              <AlertTriangle size={9} /> {block.tbdCount} TBD
            </span>
          )}
        </div>
        {deadlineLabel && (
          <p className="text-[8px] text-[#FF3131]/80 font-black uppercase tracking-widest mt-1">
            Día {dayIndex} · {deadlineLabel}
          </p>
        )}
      </div>

      {/* RIGHT: up/down buttons */}
      {isEditable && (
        <div className="flex flex-col items-center justify-center gap-1.5 pr-2">
          <button
            onClick={onUp}
            disabled={index === 0}
            className="w-9 h-9 rounded-lg bg-black border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white hover:border-[#FF3131]/40 transition-all disabled:opacity-10 active:scale-95"
            aria-label="Subir"
          >
            <ChevronUp size={16} />
          </button>
          <button
            onClick={onDown}
            disabled={index === total - 1}
            className="w-9 h-9 rounded-lg bg-black border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white hover:border-[#FF3131]/40 transition-all disabled:opacity-10 active:scale-95"
            aria-label="Bajar"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      )}
    </Reorder.Item>
  )
}
