'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Loader2,
  Shield,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Check,
  CheckCircle,
  Trophy,
  Swords,
  Users,
  Plus,
  Minus,
  PauseCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { Competition, Match, Club, Player, GoalEntry, AssistEntry, MatchAnnotation } from '@/lib/types'
import { TeamAnnotationEditor, type AnnotationEdit } from '@/components/pifa/team-annotation-editor'

const PAGE_SIZE = 8

interface MatchWithClubs extends Match {
  home_club?: Club
  away_club?: Club
  competition?: Competition
}

export default function AdminMatchesPage() {
  const router = useRouter()

  // Competition selection
  const [competitions, setCompetitions] = useState<(Competition & { season?: { name: string; status: string } })[]>([])
  const [selectedCompId, setSelectedCompId] = useState<string>('')
  const [loadingComps, setLoadingComps] = useState(true)

  // Match list
  const [matches, setMatches] = useState<MatchWithClubs[]>([])
  const [matchPage, setMatchPage] = useState(0)
  const [totalMatches, setTotalMatches] = useState(0)
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'finished' | 'scheduled' | 'postponed'>('finished')
  const [postponingId, setPostponingId] = useState<string | null>(null)

  // Edit / Finalize modal
  const [editingMatch, setEditingMatch] = useState<MatchWithClubs | null>(null)
  const [editMode, setEditMode] = useState<'edit' | 'finalize'>('edit')
  const [editHomeScore, setEditHomeScore] = useState(0)
  const [editAwayScore, setEditAwayScore] = useState(0)
  const [homeAnnotation, setHomeAnnotation] = useState<AnnotationEdit>({ goals: [], assists: [], mvp_player_id: null, starting_xi: [], substitutes_in: [] })
  const [awayAnnotation, setAwayAnnotation] = useState<AnnotationEdit>({ goals: [], assists: [], mvp_player_id: null, starting_xi: [], substitutes_in: [] })
  const [homePlayers, setHomePlayers] = useState<Player[]>([])
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(false)

  // K.O. club edit modal
  const [editingClubMatch, setEditingClubMatch] = useState<MatchWithClubs | null>(null)
  const [koHomeClubId, setKoHomeClubId] = useState<string>('')
  const [koAwayClubId, setKoAwayClubId] = useState<string>('')
  const [allClubs, setAllClubs] = useState<Club[]>([])
  const [savingClubs, setSavingClubs] = useState(false)

  // Load competitions
  useEffect(() => {
    fetchCompetitions()
  }, [])

  // Track whether the page change was user-initiated or from a comp/filter reset
  const isResetRef = useRef(false)

  // Load matches when comp or filter changes
  useEffect(() => {
    if (selectedCompId) {
      isResetRef.current = true
      setMatchPage(0)
      fetchMatches(0)
    } else {
      setMatches([])
      setTotalMatches(0)
    }
  }, [selectedCompId, statusFilter])

  // Paginate — only when user navigates pages, not on reset
  useEffect(() => {
    if (isResetRef.current) {
      isResetRef.current = false
      return
    }
    if (selectedCompId) fetchMatches(matchPage)
  }, [matchPage])

  async function fetchCompetitions() {
    setLoadingComps(true)
    const { data } = await supabase
      .from('competitions')
      .select('*, season:seasons(name, status)')
      .order('created_at', { ascending: false })

    if (data) {
      setCompetitions(data as any)
      // Auto-select first one with active season
      const active = (data as any[]).find(c => c.season?.status === 'active')
      if (active) setSelectedCompId(active.id)
    }
    setLoadingComps(false)
  }

  async function fetchMatches(page: number) {
    if (!selectedCompId) return
    setLoadingMatches(true)
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let query = supabase
      .from('matches')
      .select('*, home_club:clubs!matches_home_club_id_fkey(*), away_club:clubs!matches_away_club_id_fkey(*), competition:competitions(*)', { count: 'exact' })
      .eq('competition_id', selectedCompId)

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data, count } = await query
      .order('match_order', { ascending: true })
      .range(from, to)

    if (data) setMatches(data as any)
    setTotalMatches(count || 0)
    setLoadingMatches(false)
  }

  // Open finalize modal for a scheduled/postponed match
  async function openFinalizeModal(match: MatchWithClubs) {
    setEditMode('finalize')
    await loadMatchIntoModal(match)
  }

  // Open edit modal for a finished match
  async function openEditModal(match: MatchWithClubs) {
    setEditMode('edit')
    await loadMatchIntoModal(match)
  }

  async function loadMatchIntoModal(match: MatchWithClubs) {
    setEditingMatch(match)
    setEditHomeScore(match.home_score ?? 0)
    setEditAwayScore(match.away_score ?? 0)
    setLoadingEdit(true)

    // Load players for both clubs
    const [homeRes, awayRes, annRes] = await Promise.all([
      supabase.from('players').select('*').eq('club_id', match.home_club_id).order('name'),
      supabase.from('players').select('*').eq('club_id', match.away_club_id).order('name'),
      supabase.from('match_annotations').select('*').eq('match_id', match.id),
    ])

    setHomePlayers((homeRes.data || []) as Player[])
    setAwayPlayers((awayRes.data || []) as Player[])

    // Load existing annotations
    const annotations = (annRes.data || []) as MatchAnnotation[]
    const homeAnn = annotations.find(a => a.club_id === match.home_club_id)
    const awayAnn = annotations.find(a => a.club_id === match.away_club_id)

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

    setLoadingEdit(false)
  }

  // Save edit
  async function handleSaveEdit() {
    if (!editingMatch) return
    setIsSaving(true)
    try {
      // Validate: total goals in annotation must match score
      const homeGoalTotal = homeAnnotation.goals.reduce((s, g) => s + g.count, 0)
      const awayGoalTotal = awayAnnotation.goals.reduce((s, g) => s + g.count, 0)

      if (homeGoalTotal !== editHomeScore) {
        toast.error(`Los goles del local suman ${homeGoalTotal} pero el marcador dice ${editHomeScore}`)
        setIsSaving(false)
        return
      }
      if (awayGoalTotal !== editAwayScore) {
        toast.error(`Los goles del visitante suman ${awayGoalTotal} pero el marcador dice ${editAwayScore}`)
        setIsSaving(false)
        return
      }

      const endpoint = editMode === 'finalize'
        ? '/api/admin/finalize-match'
        : '/api/admin/edit-match'

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: editingMatch.id,
          homeScore: editHomeScore,
          awayScore: editAwayScore,
          homeAnnotation,
          awayAnnotation,
        }),
      })

      const data = await res.json()
      if (data.success) {
        toast.success(editMode === 'finalize'
          ? `Partido finalizado: ${editHomeScore}-${editAwayScore}`
          : `Resultado actualizado: ${data.oldResult} → ${data.newResult}`)
        setEditingMatch(null)
        fetchMatches(matchPage)
      } else {
        toast.error(data.error || 'Error al guardar')
      }
    } catch (err) {
      toast.error('Error de conexión')
    } finally {
      setIsSaving(false)
    }
  }

  // Open K.O. club edit
  async function openClubEditModal(match: MatchWithClubs) {
    setEditingClubMatch(match)
    setKoHomeClubId(match.home_club_id || '')
    setKoAwayClubId(match.away_club_id || '')

    if (allClubs.length === 0) {
      const { data } = await supabase.from('clubs').select('*').order('name')
      if (data) setAllClubs(data as Club[])
    }
  }

  async function handleSaveClubs() {
    if (!editingClubMatch) return
    setSavingClubs(true)
    try {
      const res = await fetch('/api/admin/edit-match-clubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: editingClubMatch.id,
          homeClubId: (!koHomeClubId || koHomeClubId === '__none__') ? null : koHomeClubId,
          awayClubId: (!koAwayClubId || koAwayClubId === '__none__') ? null : koAwayClubId,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Clubs actualizados')
        setEditingClubMatch(null)
        fetchMatches(matchPage)
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSavingClubs(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalMatches / PAGE_SIZE))
  const selectedComp = competitions.find(c => c.id === selectedCompId)

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0A0A0A]/80 backdrop-blur-2xl border-b border-white/[0.04]">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/admin')}
              className="w-10 h-10 rounded-xl bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white hover:border-[#FF3131]/40 transition-all active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-black text-white uppercase tracking-tight">
                Editor de <span className="text-[#FF3131]">Resultados</span>
              </h1>
              <p className="text-[8px] text-[#6A6C6E] font-black uppercase tracking-[0.3em] mt-0.5">
                Corrección manual de partidos
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="px-6 py-6 space-y-6 pb-32">
        {/* Competition Selector */}
        <section className="bg-[#141414]/30 backdrop-blur-xl rounded-[28px] border border-white/[0.04] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#FF3131]">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-black text-white uppercase tracking-widest">Competición</p>
              <p className="text-[8px] text-[#6A6C6E] font-black uppercase tracking-[0.2em]">
                Selecciona la competición a editar
              </p>
            </div>
          </div>

          {loadingComps ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 text-[#FF3131] animate-spin" />
            </div>
          ) : (
            <div className="grid gap-2 max-h-[240px] overflow-y-auto custom-scrollbar pr-1">
              {competitions.map(comp => (
                <button
                  key={comp.id}
                  onClick={() => setSelectedCompId(comp.id)}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${
                    selectedCompId === comp.id
                      ? 'border-[#FF3131]/40 bg-[#FF3131]/10'
                      : 'border-white/[0.04] bg-[#0A0A0A]/40 hover:bg-[#0A0A0A]/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Swords className={`w-4 h-4 shrink-0 ${selectedCompId === comp.id ? 'text-[#FF3131]' : 'text-[#2D2D2D]'}`} />
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-white uppercase tracking-tight truncate">{comp.name}</p>
                      <p className="text-[8px] text-[#6A6C6E] font-bold uppercase tracking-widest mt-0.5">
                        {comp.season?.name} · {comp.type}
                      </p>
                    </div>
                  </div>
                  {selectedCompId === comp.id && (
                    <div className="w-2 h-2 rounded-full bg-[#FF3131] shrink-0 shadow-[0_0_8px_rgba(255,49,49,0.5)]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Status Filter */}
        {selectedCompId && (
          <div className="flex gap-2 flex-wrap">
            {(['finished', 'scheduled', 'postponed', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => { setStatusFilter(f); setMatchPage(0) }}
                className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                  statusFilter === f
                    ? f === 'postponed' ? 'bg-amber-500 text-black shadow-[0_4px_15px_rgba(245,158,11,0.3)]' : 'bg-[#FF3131] text-white shadow-[0_4px_15px_rgba(255,49,49,0.3)]'
                    : 'bg-[#141414] text-[#6A6C6E] border border-white/[0.04] hover:text-white'
                }`}
              >
                {f === 'finished' ? 'Finalizados' : f === 'scheduled' ? 'Pendientes' : f === 'postponed' ? 'Aplazados' : 'Todos'}
              </button>
            ))}
          </div>
        )}

        {/* Match List */}
        {selectedCompId && (
          <section className="bg-[#141414]/30 backdrop-blur-xl rounded-[28px] border border-white/[0.04] overflow-hidden">
            {/* Pagination header */}
            <div className="px-5 py-4 flex items-center justify-between border-b border-white/[0.04] bg-[#0A0A0A]/30">
              <div className="flex items-center gap-3">
                <Swords className="w-4 h-4 text-[#FF3131]" />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">
                  {totalMatches} partido{totalMatches !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  disabled={matchPage === 0}
                  onClick={() => setMatchPage(p => p - 1)}
                  className="w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#202020] flex items-center justify-center disabled:opacity-20 hover:border-[#FF3131]/40 transition-all"
                >
                  <ChevronLeft className="w-4 h-4 text-white" />
                </button>
                <span className="text-[9px] font-black text-[#6A6C6E] uppercase tracking-widest tabular-nums">
                  {matchPage + 1} / {totalPages}
                </span>
                <button
                  disabled={(matchPage + 1) * PAGE_SIZE >= totalMatches}
                  onClick={() => setMatchPage(p => p + 1)}
                  className="w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#202020] flex items-center justify-center disabled:opacity-20 hover:border-[#FF3131]/40 transition-all"
                >
                  <ChevronRight className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Match rows */}
            <div className="p-4 space-y-2">
              {loadingMatches ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-8 h-8 text-[#FF3131] animate-spin" />
                </div>
              ) : matches.length === 0 ? (
                <div className="py-16 text-center">
                  <Swords className="w-10 h-10 text-[#2D2D2D] mx-auto mb-3" />
                  <p className="text-[9px] font-black text-[#6A6C6E] uppercase tracking-widest">
                    No hay partidos
                  </p>
                </div>
              ) : (
                matches.map(match => (
                  <div
                    key={match.id}
                    className="bg-[#0A0A0A]/50 rounded-xl px-3 py-2.5 border border-white/[0.03] hover:border-white/[0.08] transition-all group"
                  >
                    {/* Round name */}
                    <p className="text-[6.5px] text-[#6A6C6E] font-black uppercase tracking-[0.3em] mb-1.5 text-center">
                      {match.round_name || `Jornada ${match.matchday}`}
                      {match.group_name ? ` · Grupo ${match.group_name}` : ''}
                    </p>

                    {/* Match row */}
                    <div className="flex items-center justify-between gap-1.5">
                      {/* Home */}
                      <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                        <span className="text-[10px] font-black text-white uppercase tracking-tight truncate text-right">
                          {match.home_club?.name || 'TBD'}
                        </span>
                        <div className="w-6 h-6 rounded bg-black border border-[#202020] p-1 shrink-0 flex items-center justify-center">
                          {match.home_club?.shield_url ? (
                            <img src={match.home_club.shield_url} className="w-full h-full object-contain" alt="" />
                          ) : (
                            <Shield className="w-3 h-3 text-[#2D2D2D]" />
                          )}
                        </div>
                      </div>

                      {/* Score / Status */}
                      <div className="shrink-0 mx-1">
                        {match.status === 'finished' ? (
                          <div className="flex items-center gap-1 bg-[#141414] border border-white/[0.06] rounded-lg px-2.5 py-1">
                            <span className="text-sm font-black text-white tabular-nums">{match.home_score}</span>
                            <span className="text-[8px] text-[#2D2D2D] font-black">-</span>
                            <span className="text-sm font-black text-white tabular-nums">{match.away_score}</span>
                          </div>
                        ) : match.status === 'postponed' ? (
                          <span className="text-[7px] font-black text-amber-400 uppercase tracking-widest px-2 py-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
                            Aplazado
                          </span>
                        ) : (
                          <span className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-widest px-2 py-1.5 bg-[#141414] rounded-lg border border-white/[0.04]">
                            VS
                          </span>
                        )}
                      </div>

                      {/* Away */}
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <div className="w-6 h-6 rounded bg-black border border-[#202020] p-1 shrink-0 flex items-center justify-center">
                          {match.away_club?.shield_url ? (
                            <img src={match.away_club.shield_url} className="w-full h-full object-contain" alt="" />
                          ) : (
                            <Shield className="w-3 h-3 text-[#2D2D2D]" />
                          )}
                        </div>
                        <span className="text-[10px] font-black text-white uppercase tracking-tight truncate">
                          {match.away_club?.name || 'TBD'}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex justify-center gap-2 mt-2.5">
                      {match.status === 'finished' && (
                        <button
                          onClick={() => openEditModal(match)}
                          className="flex items-center gap-2 px-4 py-2 bg-[#FF3131]/10 hover:bg-[#FF3131]/20 border border-[#FF3131]/20 rounded-xl text-[8px] font-black text-[#FF3131] uppercase tracking-widest transition-all"
                        >
                          <Pencil className="w-3 h-3" />
                          Editar Resultado
                        </button>
                      )}
                      {match.status === 'scheduled' && (
                        <>
                          <button
                            onClick={() => openClubEditModal(match)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-xl text-[8px] font-black text-blue-400 uppercase tracking-widest transition-all"
                          >
                            <Users className="w-3 h-3" />
                            Editar Clubs
                          </button>
                          <button
                            disabled={!match.home_club_id || !match.away_club_id}
                            onClick={() => openFinalizeModal(match)}
                            className="flex items-center gap-2 px-4 py-2 bg-[#FF3131]/10 hover:bg-[#FF3131]/20 border border-[#FF3131]/20 rounded-xl text-[8px] font-black text-[#FF3131] uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <CheckCircle className="w-3 h-3" />
                            Finalizar Manualmente
                          </button>
                          <button
                            disabled={postponingId === match.id}
                            onClick={async () => {
                              setPostponingId(match.id)
                              try {
                                const res = await fetch('/api/admin/postpone-match', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ matchId: match.id }),
                                })
                                const data = await res.json()
                                if (data.success) {
                                  toast.success('Partido aplazado correctamente')
                                  fetchMatches(matchPage)
                                } else {
                                  toast.error(data.error || 'Error al aplazar')
                                }
                              } catch (e) {
                                toast.error('Error de conexión')
                              } finally {
                                setPostponingId(null)
                              }
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-xl text-[8px] font-black text-amber-400 uppercase tracking-widest transition-all disabled:opacity-50"
                          >
                            <PauseCircle className="w-3 h-3" />
                            {postponingId === match.id ? 'Aplazando...' : 'Aplazar'}
                          </button>
                        </>
                      )}
                      {match.status === 'postponed' && (
                        <button
                          disabled={!match.home_club_id || !match.away_club_id}
                          onClick={() => openFinalizeModal(match)}
                          className="flex items-center gap-2 px-4 py-2 bg-[#FF3131]/10 hover:bg-[#FF3131]/20 border border-[#FF3131]/20 rounded-xl text-[8px] font-black text-[#FF3131] uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <CheckCircle className="w-3 h-3" />
                          Finalizar Manualmente
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </div>

      {/* ======================================== */}
      {/* EDIT RESULT MODAL */}
      {/* ======================================== */}
      <Dialog open={!!editingMatch} onOpenChange={(open) => { if (!open) setEditingMatch(null) }}>
        <DialogContent className="max-w-lg w-full rounded-[28px] bg-[#0F0F0F] border-white/[0.08] p-0 overflow-hidden shadow-2xl max-h-[92vh] flex flex-col fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {/* Modal header */}
          <div className="px-6 pt-6 pb-4 border-b border-white/[0.04] bg-[#141414]/50">
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-white uppercase tracking-tighter text-center">
                {editMode === 'finalize' ? (
                  <>Finalizar <span className="text-[#FF3131]">Manualmente</span></>
                ) : (
                  <>Editar <span className="text-[#FF3131]">Resultado</span></>
                )}
              </DialogTitle>
            </DialogHeader>
            {editingMatch && (
              <div className="flex items-center justify-center gap-4 mt-3">
                <span className="text-[11px] font-black text-white uppercase tracking-tight">
                  {editingMatch.home_club?.name}
                </span>
                <span className="text-[9px] text-[#2D2D2D] font-black">VS</span>
                <span className="text-[11px] font-black text-white uppercase tracking-tight">
                  {editingMatch.away_club?.name}
                </span>
              </div>
            )}
            {editMode === 'finalize' && (
              <p className="mt-3 text-[8px] text-[#6A6C6E] font-bold uppercase tracking-widest text-center leading-relaxed">
                Registra el resultado como jugado. Actualiza tabla, estadísticas y avance K.O.
                <br />
                <span className="text-[#FF3131]">Sin moral, lesiones, fatiga ni noticias.</span>
              </p>
            )}
          </div>

          {loadingEdit ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 text-[#FF3131] animate-spin" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 custom-scrollbar">
              {/* Score inputs */}
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <p className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-widest mb-2">Local</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditHomeScore(Math.max(0, editHomeScore - 1))} className="w-9 h-9 rounded-lg bg-[#141414] border border-white/[0.06] flex items-center justify-center text-white hover:bg-white/10 transition-all"><Minus className="w-3.5 h-3.5" /></button>
                    <div className="w-14 h-14 rounded-xl bg-[#141414] border border-[#FF3131]/30 flex items-center justify-center">
                      <span className="text-2xl font-black text-white tabular-nums">{editHomeScore}</span>
                    </div>
                    <button onClick={() => setEditHomeScore(editHomeScore + 1)} className="w-9 h-9 rounded-lg bg-[#141414] border border-white/[0.06] flex items-center justify-center text-white hover:bg-white/10 transition-all"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <span className="text-lg font-black text-[#2D2D2D] mt-5">-</span>
                <div className="text-center">
                  <p className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-widest mb-2">Visitante</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditAwayScore(Math.max(0, editAwayScore - 1))} className="w-9 h-9 rounded-lg bg-[#141414] border border-white/[0.06] flex items-center justify-center text-white hover:bg-white/10 transition-all"><Minus className="w-3.5 h-3.5" /></button>
                    <div className="w-14 h-14 rounded-xl bg-[#141414] border border-[#FF3131]/30 flex items-center justify-center">
                      <span className="text-2xl font-black text-white tabular-nums">{editAwayScore}</span>
                    </div>
                    <button onClick={() => setEditAwayScore(editAwayScore + 1)} className="w-9 h-9 rounded-lg bg-[#141414] border border-white/[0.06] flex items-center justify-center text-white hover:bg-white/10 transition-all"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>

              {/* Team Annotations */}
              {editingMatch && (
                <>
                  <TeamAnnotationEditor
                    label={editingMatch.home_club?.name || 'Local'}
                    players={homePlayers}
                    annotation={homeAnnotation}
                    onChange={setHomeAnnotation}
                    accentColor="#FF3131"
                  />
                  <TeamAnnotationEditor
                    label={editingMatch.away_club?.name || 'Visitante'}
                    players={awayPlayers}
                    annotation={awayAnnotation}
                    onChange={setAwayAnnotation}
                    accentColor="#3B82F6"
                  />
                </>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/[0.04] bg-[#141414]/50 flex gap-3">
            <button
              onClick={() => setEditingMatch(null)}
              className="flex-1 h-12 border border-[#202020] text-[#6A6C6E] hover:text-white rounded-2xl font-black uppercase text-[9px] tracking-widest transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={isSaving}
              className="flex-1 h-12 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-2xl font-black uppercase text-[9px] tracking-widest shadow-[0_0_20px_rgba(255,49,49,0.3)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editMode === 'finalize' ? 'Finalizar Partido' : 'Guardar Cambios'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ======================================== */}
      {/* EDIT CLUBS MODAL (K.O.) */}
      {/* ======================================== */}
      <Dialog open={!!editingClubMatch} onOpenChange={(open) => { if (!open) setEditingClubMatch(null) }}>
        <DialogContent className="max-w-sm w-full rounded-[28px] bg-[#0F0F0F] border-white/[0.08] p-6 shadow-2xl fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-white uppercase tracking-tighter text-center">
              Editar <span className="text-blue-400">Clubs</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <p className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest mb-2">Club Local</p>
              <Select value={koHomeClubId} onValueChange={setKoHomeClubId}>
                <SelectTrigger className="bg-[#141414] border-white/[0.06] text-white text-xs font-bold rounded-xl h-11">
                  <SelectValue placeholder="Seleccionar club..." />
                </SelectTrigger>
                <SelectContent className="bg-[#141414] border-[#202020] rounded-xl max-h-[200px]">
                  <SelectItem value="__none__" className="text-zinc-500 text-xs font-bold">TBD (Sin asignar)</SelectItem>
                  {allClubs.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-white text-xs font-bold">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest mb-2">Club Visitante</p>
              <Select value={koAwayClubId} onValueChange={setKoAwayClubId}>
                <SelectTrigger className="bg-[#141414] border-white/[0.06] text-white text-xs font-bold rounded-xl h-11">
                  <SelectValue placeholder="Seleccionar club..." />
                </SelectTrigger>
                <SelectContent className="bg-[#141414] border-[#202020] rounded-xl max-h-[200px]">
                  <SelectItem value="__none__" className="text-zinc-500 text-xs font-bold">TBD (Sin asignar)</SelectItem>
                  {allClubs.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-white text-xs font-bold">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={() => setEditingClubMatch(null)} className="flex-1 h-12 border border-[#202020] text-[#6A6C6E] hover:text-white rounded-2xl font-black uppercase text-[9px] tracking-widest transition-all">
              Cancelar
            </button>
            <button
              onClick={handleSaveClubs}
              disabled={savingClubs}
              className="flex-1 h-12 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl font-black uppercase text-[9px] tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {savingClubs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Guardar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
