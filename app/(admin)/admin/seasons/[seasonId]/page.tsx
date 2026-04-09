'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trophy, Loader2, ChevronRight, Users, Swords, LayoutList, Calendar, Lock, Zap, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import type { Season, Competition, CompetitionType, CompetitionConfig, LeagueConfig, CupConfig, GroupsKnockoutConfig } from '@/lib/types'

const COMPETITION_TYPES: { value: CompetitionType; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'league', label: 'Liga', description: 'Todos contra todos', icon: <LayoutList className="w-5 h-5" /> },
  { value: 'cup', label: 'Copa', description: 'Eliminación directa', icon: <Trophy className="w-5 h-5" /> },
  { value: 'groups_knockout', label: 'Grupos + K.O.', description: 'Fase de grupos + eliminatorias', icon: <Swords className="w-5 h-5" /> },
]

const TYPE_COLORS: Record<CompetitionType, { gradient: string; icon: string; glow: string }> = {
  league: { gradient: 'from-blue-500/20 to-blue-600/10', icon: 'text-blue-400', glow: 'shadow-blue-400/10' },
  cup: { gradient: 'from-amber-400/20 to-yellow-600/10', icon: 'text-amber-400', glow: 'shadow-amber-400/10' },
  groups_knockout: { gradient: 'from-purple-500/20 to-purple-600/10', icon: 'text-purple-400', glow: 'shadow-purple-400/10' },
}

interface CompetitionWithCount extends Competition {
  clubs_count: number
  matches_count: number
}

export default function SeasonDetailPage({ params }: { params: Promise<{ seasonId: string }> }) {
  const { seasonId } = use(params)
  const router = useRouter()
  const [season, setSeason] = useState<Season | null>(null)
  const [competitions, setCompetitions] = useState<CompetitionWithCount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [formData, setFormData] = useState({
    name: '', type: 'league' as CompetitionType,
    rounds: 2, points_win: 3, points_draw: 1, points_loss: 0,
    legs: 2, extra_time: true, penalties: true,
    groups_count: 4, teams_per_group: 4, teams_advance_per_group: 2, knockout_legs: 2,
  })

  const canEdit = season?.status === 'draft'

  const loadData = async () => {
    setIsLoading(true)
    const { data: seasonData, error: seasonError } = await supabase.from('seasons').select('*').eq('id', seasonId).single()
    if (seasonError || !seasonData) { toast.error('Temporada no encontrada'); router.push('/admin/seasons'); return }
    setSeason(seasonData)
    const { data: compsData } = await supabase.from('competitions').select('*, competition_clubs(id), matches(id)').eq('season_id', seasonId).order('created_at', { ascending: true })
    if (compsData) {
      const compsWithCount = compsData.map(c => ({ ...c, clubs_count: c.competition_clubs?.length || 0, matches_count: c.matches?.length || 0, competition_clubs: undefined, matches: undefined })) as CompetitionWithCount[]
      setCompetitions(compsWithCount)
    }
    setIsLoading(false)
  }

  useEffect(() => { loadData() }, [seasonId])

  const resetForm = () => { setFormData({ name: '', type: 'league', rounds: 2, points_win: 3, points_draw: 1, points_loss: 0, legs: 2, extra_time: true, penalties: true, groups_count: 4, teams_per_group: 4, teams_advance_per_group: 2, knockout_legs: 2 }) }

  const buildConfig = (): CompetitionConfig => {
    switch (formData.type) {
      case 'league': return { rounds: formData.rounds, points_win: formData.points_win, points_draw: formData.points_draw, points_loss: formData.points_loss } as LeagueConfig
      case 'cup': return { legs: formData.legs, extra_time: formData.extra_time, penalties: formData.penalties } as CupConfig
      case 'groups_knockout': return { groups_count: formData.groups_count, teams_per_group: formData.teams_per_group, teams_advance_per_group: formData.teams_advance_per_group, knockout_legs: formData.knockout_legs } as GroupsKnockoutConfig
      default: return {}
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) { toast.error('El nombre es requerido'); return }
    setIsSaving(true)
    try {
      const config = buildConfig()
      const { error } = await supabase.from('competitions').insert({ season_id: seasonId, name: formData.name.trim(), type: formData.type, config, status: 'draft' })
      if (error) throw error
      toast.success('Competición creada'); setIsFormOpen(false); resetForm(); loadData()
    } catch (error) { toast.error('Error al crear competición') } finally { setIsSaving(false) }
  }

  const getStatusInfo = () => {
    if (season?.status === 'active') return { icon: <Zap className="w-4 h-4" />, text: 'Activa', color: 'text-emerald-400', bg: 'bg-emerald-400/10' }
    if (season?.status === 'finished') return { icon: <Lock className="w-4 h-4" />, text: 'Finalizada', color: 'text-muted-foreground', bg: 'bg-muted/20' }
    return { icon: <Clock className="w-4 h-4" />, text: 'Borrador', color: 'text-amber-400', bg: 'bg-amber-400/10' }
  }

  if (isLoading) return (<div className="min-h-dvh flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>)

  const statusInfo = getStatusInfo()
  const totalMatches = competitions.reduce((sum, c) => sum + c.matches_count, 0)

  return (
    <div className="min-h-dvh safe-area-top">
      {/* Header */}
      <header className="sticky top-[57px] z-30 bg-background/80 backdrop-blur-2xl border-b border-white/[0.06]">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <Link href="/admin/seasons" className="p-2 -ml-2 rounded-xl active:scale-95 transition-transform"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></Link>
            <div>
              <h1 className="font-bold text-foreground truncate max-w-[180px]">{season?.name}</h1>
              <div className="flex items-center gap-1.5">
                <span className={`flex items-center gap-1 text-[10px] font-medium ${statusInfo.color}`}>{statusInfo.icon}{statusInfo.text}</span>
              </div>
            </div>
          </div>
          {canEdit && (
            <Button onClick={() => setIsFormOpen(true)} size="sm" className="gap-1.5 rounded-xl shadow-lg shadow-primary/20">
              <Plus className="w-4 h-4" />Competición
            </Button>
          )}
        </div>
      </header>

      <div className="px-4 py-4 pb-24 space-y-5">
        
        {/* Season Hero Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-card via-card to-primary/5 border border-white/[0.06] animate-fade-in-up">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-primary/8 to-transparent rounded-full blur-2xl" />
          <div className="relative p-5">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-pifa-red/30 rounded-xl blur-md" />
                <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-pifa-red flex items-center justify-center shadow-xl">
                  <Trophy className="w-7 h-7 text-white" />
                </div>
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-lg text-foreground">{season?.name}</h2>
                <p className="text-sm text-muted-foreground">{competitions.length} competiciones configuradas</p>
              </div>
            </div>
            
            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-3 mt-5">
              <div className="bg-white/[0.03] rounded-xl p-3 text-center border border-white/[0.04]">
                <p className="text-2xl font-bold text-foreground animate-count">{competitions.length}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-medium mt-0.5">Competiciones</p>
              </div>
              <div className="bg-white/[0.03] rounded-xl p-3 text-center border border-white/[0.04]">
                <p className="text-2xl font-bold text-foreground animate-count">{totalMatches}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-medium mt-0.5">Partidos</p>
              </div>
              <Link href={`/admin/seasons/${seasonId}/calendar`} className="bg-primary/8 rounded-xl p-3 text-center border border-primary/10 transition-all duration-200 hover:bg-primary/15 active:scale-95">
                <Calendar className="w-6 h-6 text-primary mx-auto" />
                <p className="text-[9px] text-primary uppercase tracking-widest font-bold mt-1">Calendario</p>
              </Link>
            </div>
          </div>
          
          {!canEdit && (
            <div className={`flex items-center gap-2 px-5 py-2.5 ${statusInfo.bg} border-t border-white/[0.04]`}>
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <p className="text-[11px] text-amber-400">
                La temporada está {season?.status === 'active' ? 'activa' : 'finalizada'}. No se pueden modificar las competiciones.
              </p>
            </div>
          )}
        </div>

        {/* Competitions */}
        <section>
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 px-1">
            Competiciones
          </h2>

          {competitions.length === 0 ? (
            <div className="text-center py-12 bg-card/40 rounded-2xl border border-white/[0.04] animate-fade-in-up">
              <Trophy className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium text-sm">No hay competiciones</p>
              {canEdit && <p className="text-xs text-muted-foreground/50 mt-1">Crea una competición para empezar</p>}
            </div>
          ) : (
            <div className="space-y-2.5">
              {competitions.map((comp, i) => {
                const typeConfig = TYPE_COLORS[comp.type]
                const typeInfo = COMPETITION_TYPES.find(t => t.value === comp.type)
                
                return (
                  <Link
                    key={comp.id}
                    href={`/admin/seasons/${seasonId}/competitions/${comp.id}`}
                    className={`group flex items-center gap-4 bg-card/60 backdrop-blur-sm rounded-2xl p-4 border border-white/[0.06] transition-all duration-300 hover:bg-card/80 hover:border-white/[0.1] active:scale-[0.98] animate-fade-in-up shadow-lg ${typeConfig.glow}`}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${typeConfig.gradient} flex items-center justify-center shrink-0 ring-1 ring-white/[0.06]`}>
                      <div className={typeConfig.icon}>{typeInfo?.icon}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-foreground truncate">{comp.name}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-[10px] font-bold ${typeConfig.icon}`}>{typeInfo?.label}</span>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      {/* Competitions Grid */}
      <div className="px-6 py-6 space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF3131]" />
          </div>
        ) : competitions.length === 0 ? (
          <div className="text-center py-20 bg-[#141414]/30 rounded-[32px] border border-dashed border-white/[0.06] animate-fade-in-up">
            <div className="w-20 h-20 rounded-3xl bg-[#0A0A0A] border border-[#202020] mx-auto mb-6 flex items-center justify-center">
              <Trophy className="w-10 h-10 text-[#2D2D2D]" />
            </div>
            <p className="text-[#6A6C6E] font-black uppercase tracking-[0.2em] text-xs">
              SIN COMPETENCIAS ACTIVAS EN ESTE CICLO
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {competitions.map((comp, i) => (
              <div
                key={comp.id}
                className="group relative bg-[#141414]/50 backdrop-blur-xl rounded-[28px] p-6 border border-white/[0.04] transition-all duration-300 hover:border-[#FF3131]/30 hover:bg-[#1A1A1A]/60 animate-fade-in-up shadow-xl overflow-hidden cursor-pointer"
                style={{ animationDelay: `${i * 50}ms` }}
                onClick={() => router.push(`/admin/seasons/${seasonId}/competitions/${comp.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#FF3131] shadow-2xl transition-transform group-hover:scale-110">
                      <Trophy className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">{comp.name}</h3>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                          {comp.type === 'league' ? 'LIGA' : 
                           comp.type === 'cup' ? 'COPA ELIMINACIÓN' : 
                           'GRUPOS + K.O'}
                        </span>
                        <p className="text-[9px] text-[#2D2D2D] font-black uppercase tracking-widest">
                          {comp.clubs_count || 0} EQUIPOS PARTICIPANTES
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openEditForm(comp)}
                      className="w-10 h-10 rounded-full bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white hover:border-[#FF3131]/40 transition-all active:scale-90"
                    >
                      <Pencil className="w-4.5 h-4.5" />
                    </button>
                    <button
                      onClick={() => {
                        setDeletingComp(comp)
                        setIsDeleteOpen(true)
                      }}
                      className="w-10 h-10 rounded-full bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-red-500/60 hover:text-red-500 hover:border-red-500/40 hover:bg-red-500/10 transition-all active:scale-90"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

                      <p className="text-xs text-muted-foreground">{type.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white/[0.02] rounded-xl p-4 space-y-4 border border-white/[0.04]">
              <h4 className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                Configuración {COMPETITION_TYPES.find(t => t.value === formData.type)?.label}
              </h4>
              
              {formData.type === 'league' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Vueltas</Label>
                    <Select value={String(formData.rounds)} onValueChange={(value) => setFormData({ ...formData, rounds: parseInt(value) })}>
                      <SelectTrigger className="h-11 rounded-xl bg-background/50 border-white/[0.08]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-card/95 backdrop-blur-xl border-white/[0.08]"><SelectItem value="1">1 vuelta (solo ida)</SelectItem><SelectItem value="2">2 vueltas (ida y vuelta)</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5"><Label className="text-[10px] text-muted-foreground">Pts Victoria</Label><Input type="number" value={formData.points_win} onChange={(e) => setFormData({ ...formData, points_win: parseInt(e.target.value) || 0 })} className="h-10 rounded-lg bg-background/50 border-white/[0.08] text-center" /></div>
                    <div className="space-y-1.5"><Label className="text-[10px] text-muted-foreground">Pts Empate</Label><Input type="number" value={formData.points_draw} onChange={(e) => setFormData({ ...formData, points_draw: parseInt(e.target.value) || 0 })} className="h-10 rounded-lg bg-background/50 border-white/[0.08] text-center" /></div>
                    <div className="space-y-1.5"><Label className="text-[10px] text-muted-foreground">Pts Derrota</Label><Input type="number" value={formData.points_loss} onChange={(e) => setFormData({ ...formData, points_loss: parseInt(e.target.value) || 0 })} className="h-10 rounded-lg bg-background/50 border-white/[0.08] text-center" /></div>
                  </div>
                </>
              )}

              {formData.type === 'cup' && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Partidos por ronda</Label>
                  <Select value={String(formData.legs)} onValueChange={(value) => setFormData({ ...formData, legs: parseInt(value) })}>
                    <SelectTrigger className="h-11 rounded-xl bg-background/50 border-white/[0.08]"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card/95 backdrop-blur-xl border-white/[0.08]"><SelectItem value="1">1 partido (eliminación directa)</SelectItem><SelectItem value="2">2 partidos (ida y vuelta)</SelectItem></SelectContent>
                  </Select>
                </div>
              )}

              {formData.type === 'groups_knockout' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label className="text-[10px] text-muted-foreground">Núm. Grupos</Label><Input type="number" value={formData.groups_count} onChange={(e) => setFormData({ ...formData, groups_count: parseInt(e.target.value) || 1 })} className="h-10 rounded-lg bg-background/50 border-white/[0.08] text-center" min={1} max={8} /></div>
                    <div className="space-y-1.5"><Label className="text-[10px] text-muted-foreground">Equipos/Grupo</Label><Input type="number" value={formData.teams_per_group} onChange={(e) => setFormData({ ...formData, teams_per_group: parseInt(e.target.value) || 2 })} className="h-10 rounded-lg bg-background/50 border-white/[0.08] text-center" min={2} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label className="text-[10px] text-muted-foreground">Clasifican/Grupo</Label><Input type="number" value={formData.teams_advance_per_group} onChange={(e) => setFormData({ ...formData, teams_advance_per_group: parseInt(e.target.value) || 1 })} className="h-10 rounded-lg bg-background/50 border-white/[0.08] text-center" min={1} /></div>
                    <div className="space-y-1.5"><Label className="text-[10px] text-muted-foreground">Partidos K.O.</Label>
                      <Select value={String(formData.knockout_legs)} onValueChange={(value) => setFormData({ ...formData, knockout_legs: parseInt(value) })}>
                        <SelectTrigger className="h-10 rounded-lg bg-background/50 border-white/[0.08]"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-card/95 backdrop-blur-xl border-white/[0.08]"><SelectItem value="1">1 partido</SelectItem><SelectItem value="2">Ida y vuelta</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}
            </div>
          </form>
          
          <DialogFooter className="gap-2 sm:gap-2 border-t border-white/[0.06] pt-4">
            <DialogClose asChild><Button type="button" variant="ghost" className="rounded-xl">Cancelar</Button></DialogClose>
            <Button onClick={handleSubmit} disabled={isSaving} className="rounded-xl shadow-lg shadow-primary/20">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Crear Competición
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
