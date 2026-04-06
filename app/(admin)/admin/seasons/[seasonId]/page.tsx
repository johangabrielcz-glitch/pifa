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
  { value: 'cup', label: 'Copa', description: 'Eliminacion directa', icon: <Trophy className="w-5 h-5" /> },
  { value: 'groups_knockout', label: 'Grupos + K.O.', description: 'Fase de grupos + eliminatorias', icon: <Swords className="w-5 h-5" /> },
]

const TYPE_COLORS: Record<CompetitionType, { gradient: string; icon: string }> = {
  league: { gradient: 'from-blue-500/20 to-blue-600/10', icon: 'text-blue-400' },
  cup: { gradient: 'from-pifa-gold/20 to-yellow-600/10', icon: 'text-pifa-gold' },
  groups_knockout: { gradient: 'from-purple-500/20 to-purple-600/10', icon: 'text-purple-400' },
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

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    type: 'league' as CompetitionType,
    rounds: 2,
    points_win: 3,
    points_draw: 1,
    points_loss: 0,
    legs: 2,
    extra_time: true,
    penalties: true,
    groups_count: 4,
    teams_per_group: 4,
    teams_advance_per_group: 2,
    knockout_legs: 2,
  })

  const canEdit = season?.status === 'draft'

  const loadData = async () => {
    setIsLoading(true)

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

    const { data: compsData } = await supabase
      .from('competitions')
      .select('*, competition_clubs(id), matches(id)')
      .eq('season_id', seasonId)
      .order('created_at', { ascending: true })

    if (compsData) {
      const compsWithCount = compsData.map(c => ({
        ...c,
        clubs_count: c.competition_clubs?.length || 0,
        matches_count: c.matches?.length || 0,
        competition_clubs: undefined,
        matches: undefined,
      })) as CompetitionWithCount[]
      setCompetitions(compsWithCount)
    }

    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [seasonId])

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'league',
      rounds: 2,
      points_win: 3,
      points_draw: 1,
      points_loss: 0,
      legs: 2,
      extra_time: true,
      penalties: true,
      groups_count: 4,
      teams_per_group: 4,
      teams_advance_per_group: 2,
      knockout_legs: 2,
    })
  }

  const buildConfig = (): CompetitionConfig => {
    switch (formData.type) {
      case 'league':
        return {
          rounds: formData.rounds,
          points_win: formData.points_win,
          points_draw: formData.points_draw,
          points_loss: formData.points_loss,
        } as LeagueConfig
      case 'cup':
        return {
          legs: formData.legs,
          extra_time: formData.extra_time,
          penalties: formData.penalties,
        } as CupConfig
      case 'groups_knockout':
        return {
          groups_count: formData.groups_count,
          teams_per_group: formData.teams_per_group,
          teams_advance_per_group: formData.teams_advance_per_group,
          knockout_legs: formData.knockout_legs,
        } as GroupsKnockoutConfig
      default:
        return {}
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast.error('El nombre es requerido')
      return
    }

    setIsSaving(true)

    try {
      const config = buildConfig()

      const { error } = await supabase
        .from('competitions')
        .insert({
          season_id: seasonId,
          name: formData.name.trim(),
          type: formData.type,
          config,
          status: 'draft',
        })

      if (error) throw error

      toast.success('Competicion creada')
      setIsFormOpen(false)
      resetForm()
      loadData()
    } catch (error) {
      toast.error('Error al crear competicion')
    } finally {
      setIsSaving(false)
    }
  }

  const getStatusInfo = () => {
    if (season?.status === 'active') {
      return { icon: <Zap className="w-4 h-4" />, text: 'Activa', color: 'text-emerald-400', bg: 'bg-emerald-400/10' }
    } else if (season?.status === 'finished') {
      return { icon: <Lock className="w-4 h-4" />, text: 'Finalizada', color: 'text-muted-foreground', bg: 'bg-muted/20' }
    }
    return { icon: <Clock className="w-4 h-4" />, text: 'Borrador', color: 'text-amber-400', bg: 'bg-amber-400/10' }
  }

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const statusInfo = getStatusInfo()
  const totalMatches = competitions.reduce((sum, c) => sum + c.matches_count, 0)
  const totalClubs = new Set(competitions.flatMap(c => c.clubs_count)).size

  return (
    <div className="min-h-dvh safe-area-top">
      {/* Header */}
      <header className="sticky top-[57px] z-30 bg-background/95 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <Link href="/admin/seasons" className="p-2 -ml-2 rounded-xl touch-active">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Link>
            <div>
              <h1 className="font-bold text-foreground truncate max-w-[160px]">{season?.name}</h1>
              <div className="flex items-center gap-1.5">
                <span className={`flex items-center gap-1 text-xs ${statusInfo.color}`}>
                  {statusInfo.icon}
                  {statusInfo.text}
                </span>
              </div>
            </div>
          </div>
          {canEdit && (
            <Button onClick={() => setIsFormOpen(true)} size="sm" className="gap-1.5 rounded-xl">
              <Plus className="w-4 h-4" />
              Competicion
            </Button>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="px-4 py-4 pb-24 space-y-5">
        
        {/* Season Summary Card */}
        <div className="bg-gradient-to-br from-card via-card to-primary/5 rounded-2xl border border-border overflow-hidden">
          <div className="p-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-pifa-red flex items-center justify-center">
                <Trophy className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-lg text-foreground">{season?.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {competitions.length} competiciones configuradas
                </p>
              </div>
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="bg-muted/30 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{competitions.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Competiciones</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{totalMatches}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Partidos</p>
              </div>
              <Link 
                href={`/admin/seasons/${seasonId}/calendar`}
                className="bg-primary/10 rounded-xl p-3 text-center touch-active hover:bg-primary/20 transition-colors"
              >
                <Calendar className="w-6 h-6 text-primary mx-auto" />
                <p className="text-[10px] text-primary uppercase tracking-wider mt-1">Calendario</p>
              </Link>
            </div>
          </div>
          
          {/* Status Banner */}
          {!canEdit && (
            <div className={`flex items-center gap-2 px-4 py-2.5 ${statusInfo.bg} border-t border-border`}>
              <Lock className="w-4 h-4 text-amber-400" />
              <p className="text-xs text-amber-400">
                La temporada esta {season?.status === 'active' ? 'activa' : 'finalizada'}. No se pueden modificar las competiciones.
              </p>
            </div>
          )}
        </div>

        {/* Competitions List */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
            Competiciones
          </h2>

          {competitions.length === 0 ? (
            <div className="text-center py-10 bg-card rounded-2xl border border-border">
              <Trophy className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">No hay competiciones</p>
              {canEdit && (
                <p className="text-xs text-muted-foreground/70 mt-1">Crea una competicion para empezar</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {competitions.map((comp) => {
                const typeConfig = TYPE_COLORS[comp.type]
                const typeInfo = COMPETITION_TYPES.find(t => t.value === comp.type)
                
                return (
                  <Link
                    key={comp.id}
                    href={`/admin/seasons/${seasonId}/competitions/${comp.id}`}
                    className="flex items-center gap-4 bg-card rounded-2xl p-4 border border-border touch-active hover:border-primary/30 transition-colors"
                  >
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${typeConfig.gradient} flex items-center justify-center`}>
                      <div className={typeConfig.icon}>{typeInfo?.icon}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{comp.name}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-xs ${typeConfig.icon}`}>{typeInfo?.label}</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="w-3 h-3" />
                          {comp.clubs_count}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Swords className="w-3 h-3" />
                          {comp.matches_count}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* Create Competition Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) { setIsFormOpen(false); resetForm() } }}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl bg-card max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-foreground">Nueva Competicion</DialogTitle>
            <DialogDescription className="sr-only">
              Formulario para crear una nueva competicion
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-5 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Nombre *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Liga PIFA Division 1"
                className="h-12 rounded-xl bg-muted/50 border-border"
              />
            </div>

            {/* Format Selection */}
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Formato</Label>
              <div className="grid gap-2">
                {COMPETITION_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: type.value })}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      formData.type === type.value 
                        ? 'border-primary bg-primary/10' 
                        : 'border-border bg-muted/30 hover:border-primary/30'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      formData.type === type.value ? 'bg-primary/20 text-primary' : 'bg-muted/50 text-muted-foreground'
                    }`}>
                      {type.icon}
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-medium text-sm text-foreground">{type.label}</p>
                      <p className="text-xs text-muted-foreground">{type.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Configuration based on type */}
            <div className="bg-muted/20 rounded-xl p-4 space-y-4">
              <h4 className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Configuracion {COMPETITION_TYPES.find(t => t.value === formData.type)?.label}
              </h4>
              
              {formData.type === 'league' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Vueltas</Label>
                    <Select
                      value={String(formData.rounds)}
                      onValueChange={(value) => setFormData({ ...formData, rounds: parseInt(value) })}
                    >
                      <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 vuelta (solo ida)</SelectItem>
                        <SelectItem value="2">2 vueltas (ida y vuelta)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Pts Victoria</Label>
                      <Input
                        type="number"
                        value={formData.points_win}
                        onChange={(e) => setFormData({ ...formData, points_win: parseInt(e.target.value) || 0 })}
                        className="h-10 rounded-lg bg-background border-border text-center"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Pts Empate</Label>
                      <Input
                        type="number"
                        value={formData.points_draw}
                        onChange={(e) => setFormData({ ...formData, points_draw: parseInt(e.target.value) || 0 })}
                        className="h-10 rounded-lg bg-background border-border text-center"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Pts Derrota</Label>
                      <Input
                        type="number"
                        value={formData.points_loss}
                        onChange={(e) => setFormData({ ...formData, points_loss: parseInt(e.target.value) || 0 })}
                        className="h-10 rounded-lg bg-background border-border text-center"
                      />
                    </div>
                  </div>
                </>
              )}

              {formData.type === 'cup' && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Partidos por ronda</Label>
                  <Select
                    value={String(formData.legs)}
                    onValueChange={(value) => setFormData({ ...formData, legs: parseInt(value) })}
                  >
                    <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 partido (eliminacion directa)</SelectItem>
                      <SelectItem value="2">2 partidos (ida y vuelta)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {formData.type === 'groups_knockout' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Num. Grupos</Label>
                      <Input
                        type="number"
                        value={formData.groups_count}
                        onChange={(e) => setFormData({ ...formData, groups_count: parseInt(e.target.value) || 1 })}
                        className="h-10 rounded-lg bg-background border-border text-center"
                        min={1}
                        max={8}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Equipos/Grupo</Label>
                      <Input
                        type="number"
                        value={formData.teams_per_group}
                        onChange={(e) => setFormData({ ...formData, teams_per_group: parseInt(e.target.value) || 2 })}
                        className="h-10 rounded-lg bg-background border-border text-center"
                        min={2}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Clasifican/Grupo</Label>
                      <Input
                        type="number"
                        value={formData.teams_advance_per_group}
                        onChange={(e) => setFormData({ ...formData, teams_advance_per_group: parseInt(e.target.value) || 1 })}
                        className="h-10 rounded-lg bg-background border-border text-center"
                        min={1}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Partidos K.O.</Label>
                      <Select
                        value={String(formData.knockout_legs)}
                        onValueChange={(value) => setFormData({ ...formData, knockout_legs: parseInt(value) })}
                      >
                        <SelectTrigger className="h-10 rounded-lg bg-background border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 partido</SelectItem>
                          <SelectItem value="2">Ida y vuelta</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}
            </div>
          </form>
          
          <DialogFooter className="gap-2 sm:gap-2 border-t border-border pt-4">
            <DialogClose asChild>
              <Button type="button" variant="ghost" className="rounded-xl">
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={handleSubmit} disabled={isSaving} className="rounded-xl">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Crear Competicion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
