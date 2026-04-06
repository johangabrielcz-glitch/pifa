'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Calendar, Trophy, Loader2, ChevronRight, Play, CheckCircle, Edit2, Trash2, MoreVertical, Clock, Zap, Archive } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { calculateMatchDeadlines } from '@/lib/match-engine'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import type { Season, SeasonStatus } from '@/lib/types'

const STATUS_CONFIG: Record<SeasonStatus, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  draft: { label: 'Borrador', icon: <Clock className="w-4 h-4" />, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30' },
  active: { label: 'Activa', icon: <Zap className="w-4 h-4" />, color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30' },
  finished: { label: 'Finalizada', icon: <Archive className="w-4 h-4" />, color: 'text-muted-foreground', bg: 'bg-muted/20', border: 'border-muted/30' },
}

export default function SeasonsPage() {
  const router = useRouter()
  const [seasons, setSeasons] = useState<(Season & { competitions_count: number })[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [editingSeason, setEditingSeason] = useState<Season | null>(null)
  const [deletingSeason, setDeletingSeason] = useState<Season | null>(null)
  const [formData, setFormData] = useState({ name: '' })
  const [isSaving, setIsSaving] = useState(false)

  const loadSeasons = async () => {
    setIsLoading(true)
    const { data, error } = await supabase.from('seasons').select('*, competitions(id)').order('created_at', { ascending: false })
    if (!error && data) {
      const seasonsWithCount = data.map(s => ({ ...s, competitions_count: s.competitions?.length || 0, competitions: undefined })) as (Season & { competitions_count: number })[]
      setSeasons(seasonsWithCount)
    }
    setIsLoading(false)
  }

  useEffect(() => { loadSeasons() }, [])

  const resetForm = () => { setFormData({ name: '' }); setEditingSeason(null) }
  const openCreateForm = () => { resetForm(); setIsFormOpen(true) }
  const openEditForm = (season: Season) => { setEditingSeason(season); setFormData({ name: season.name }); setIsFormOpen(true) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) { toast.error('El nombre es requerido'); return }
    setIsSaving(true)
    try {
      if (editingSeason) {
        const { error } = await supabase.from('seasons').update({ name: formData.name.trim(), updated_at: new Date().toISOString() }).eq('id', editingSeason.id)
        if (error) throw error
        toast.success('Temporada actualizada')
      } else {
        const { error } = await supabase.from('seasons').insert({ name: formData.name.trim(), status: 'draft' })
        if (error) throw error
        toast.success('Temporada creada')
      }
      setIsFormOpen(false); resetForm(); loadSeasons()
    } catch (error) { toast.error('Error al guardar temporada') } finally { setIsSaving(false) }
  }

  const handleDelete = async () => {
    if (!deletingSeason) return
    try {
      const { error } = await supabase.from('seasons').delete().eq('id', deletingSeason.id)
      if (error) throw error
      toast.success('Temporada eliminada'); loadSeasons()
    } catch (error) { toast.error('Error al eliminar temporada') } finally { setIsDeleteOpen(false); setDeletingSeason(null) }
  }

  const handleActivate = async (season: Season) => {
    try {
      const { error: seasonError } = await supabase.from('seasons').update({ status: 'active', activated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', season.id)
      if (seasonError) throw seasonError
      const { error: compsError } = await supabase.from('competitions').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('season_id', season.id).eq('status', 'draft')
      if (compsError) throw compsError
      await calculateMatchDeadlines(season.id)
      toast.success('Temporada activada — Deadlines de partidos asignados'); loadSeasons()
    } catch (error) { toast.error('Error al activar temporada') }
  }

  const handleFinish = async (season: Season) => {
    try {
      const { error } = await supabase.from('seasons').update({ status: 'finished', updated_at: new Date().toISOString() }).eq('id', season.id)
      if (error) throw error
      toast.success('Temporada finalizada'); loadSeasons()
    } catch (error) { toast.error('Error al finalizar temporada') }
  }

  const activeSeason = seasons.find(s => s.status === 'active')
  const draftSeasons = seasons.filter(s => s.status === 'draft')
  const finishedSeasons = seasons.filter(s => s.status === 'finished')

  const renderSeasonCard = (season: Season & { competitions_count: number }, isActive = false) => {
    const statusConfig = STATUS_CONFIG[season.status]
    return (
      <div key={season.id} className={`bg-card/60 backdrop-blur-sm rounded-2xl border overflow-hidden transition-all duration-300 hover:bg-card/80 ${isActive ? 'border-emerald-400/30 ring-1 ring-emerald-400/10 shadow-[0_0_20px_rgba(16,185,129,0.05)]' : 'border-white/[0.06]'}`}>
        <div className="flex items-center gap-4 p-4 cursor-pointer active:scale-[0.98] transition-transform" onClick={() => router.push(`/admin/seasons/${season.id}`)}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-400/20' : 'bg-gradient-to-br from-primary/20 to-pifa-red/10'}`}>
            <Trophy className={`w-6 h-6 ${isActive ? 'text-white' : 'text-primary'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-foreground truncate">{season.name}</h3>
              {isActive && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full animate-pulse">LIVE</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{season.competitions_count} competiciones</p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground/40 flex-shrink-0" />
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.02] border-t border-white/[0.04]">
          <div className="flex items-center gap-2">
            {season.status === 'draft' && (
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleActivate(season) }} className="h-8 text-xs gap-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 rounded-lg">
                <Play className="w-3.5 h-3.5" />Activar
              </Button>
            )}
            {season.status === 'active' && (
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleFinish(season) }} className="h-8 text-xs gap-1.5 rounded-lg">
                <CheckCircle className="w-3.5 h-3.5" />Finalizar
              </Button>
            )}
            {season.status === 'finished' && (
              <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${statusConfig.color} ${statusConfig.bg}`}>
                {statusConfig.icon}{statusConfig.label}
              </span>
            )}
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg"><MoreVertical className="w-4 h-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card/95 backdrop-blur-xl border-white/[0.08]">
              <DropdownMenuItem onClick={() => openEditForm(season)} className="gap-2"><Edit2 className="w-4 h-4" />Editar nombre</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setDeletingSeason(season); setIsDeleteOpen(true) }} className="text-destructive focus:text-destructive gap-2"><Trash2 className="w-4 h-4" />Eliminar</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh safe-area-top">
      <header className="sticky top-[57px] z-30 bg-background/80 backdrop-blur-2xl border-b border-white/[0.06]">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="p-2 -ml-2 rounded-xl active:scale-95 transition-transform"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></Link>
            <div>
              <h1 className="font-bold text-foreground">Temporadas</h1>
              <p className="text-[10px] text-muted-foreground">{seasons.length} temporadas</p>
            </div>
          </div>
          <Button onClick={openCreateForm} size="sm" className="gap-1.5 rounded-xl shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" />Nueva
          </Button>
        </div>
      </header>

      <div className="px-4 py-4 pb-24 space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : seasons.length === 0 ? (
          <div className="text-center py-12 animate-fade-in-up">
            <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No hay temporadas creadas</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Crea una temporada para empezar</p>
          </div>
        ) : (
          <>
            {activeSeason && (
              <section className="animate-fade-in-up">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <h2 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Temporada Activa</h2>
                </div>
                {renderSeasonCard(activeSeason, true)}
              </section>
            )}
            {draftSeasons.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <h2 className="text-xs font-bold text-amber-400 uppercase tracking-widest">En Preparación ({draftSeasons.length})</h2>
                </div>
                <div className="space-y-2.5">
                  {draftSeasons.map((season, i) => (
                    <div key={season.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
                      {renderSeasonCard(season)}
                    </div>
                  ))}
                </div>
              </section>
            )}
            {finishedSeasons.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Archive className="w-3.5 h-3.5 text-muted-foreground/60" />
                  <h2 className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest">Finalizadas ({finishedSeasons.length})</h2>
                </div>
                <div className="space-y-2.5">
                  {finishedSeasons.map((season, i) => (
                    <div key={season.id} className="animate-fade-in-up opacity-70" style={{ animationDelay: `${i * 60}ms` }}>
                      {renderSeasonCard(season)}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) { setIsFormOpen(false); resetForm() } }}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl bg-card/95 backdrop-blur-xl border-white/[0.08]">
          <DialogHeader>
            <DialogTitle className="text-foreground">{editingSeason ? 'Editar Temporada' : 'Nueva Temporada'}</DialogTitle>
            <DialogDescription className="sr-only">{editingSeason ? 'Formulario para editar la temporada' : 'Formulario para crear una nueva temporada'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nombre *</label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Temporada 2024-2025" className="mt-1.5 h-12 rounded-xl bg-background/50 border-white/[0.08]" />
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <DialogClose asChild><Button type="button" variant="ghost" className="rounded-xl">Cancelar</Button></DialogClose>
              <Button type="submit" disabled={isSaving} className="rounded-xl shadow-lg shadow-primary/20">
                {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{editingSeason ? 'Guardar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="max-w-sm mx-4 rounded-2xl bg-card/95 backdrop-blur-xl border-white/[0.08]">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar temporada</AlertDialogTitle>
            <AlertDialogDescription>Se eliminarán todas las competiciones y partidos de esta temporada. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
