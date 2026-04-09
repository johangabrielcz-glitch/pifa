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
          seasons.map((season, i) => (
            <div
              key={season.id}
              className="group relative bg-[#141414]/50 backdrop-blur-xl rounded-[28px] p-6 border border-white/[0.04] transition-all duration-300 hover:border-[#FF3131]/30 hover:bg-[#1A1A1A]/60 animate-fade-in-up shadow-xl overflow-hidden cursor-pointer"
              style={{ animationDelay: `${i * 50}ms` }}
              onClick={() => router.push(`/admin/seasons/${season.id}`)}
            >
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-5">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-2xl transition-transform group-hover:scale-110 ${
                    season.status === 'active' 
                      ? 'bg-[#FF3131]/20 border-[#FF3131]/30 text-[#FF3131]' 
                      : 'bg-[#0A0A0A] border-[#202020] text-[#6A6C6E]'
                  }`}>
                    <Calendar className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">{season.name}</h3>
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full border font-black uppercase tracking-widest text-[8px] ${
                        season.status === 'active'
                          ? 'bg-[#FF3131]/10 text-[#FF3131] border-[#FF3131]/20 shadow-[0_0_10px_rgba(255,49,49,0.1)]'
                          : 'bg-white/5 text-[#6A6C6E] border-white/10'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${season.status === 'active' ? 'bg-[#FF3131] animate-pulse' : 'bg-[#6A6C6E]'}`} />
                        {season.status === 'active' ? 'ACTIVA' : 'SISTEMA STANDBY'}
                      </div>
                      <p className="text-[10px] text-[#2D2D2D] font-black uppercase tracking-widest">
                        {season.competitions_count || 0} COMPETENCIAS
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      openEditForm(season)
                    }}
                    className="w-10 h-10 rounded-full bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white hover:border-[#FF3131]/40 transition-all active:scale-90"
                  >
                    <Pencil className="w-4.5 h-4.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeletingSeason(season)
                      setIsDeleteOpen(true)
                    }}
                    className="w-10 h-10 rounded-full bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-red-500/60 hover:text-red-500 hover:border-red-500/40 hover:bg-red-500/10 transition-all active:scale-90"
                  >
                    <Trash2 className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>
              
              {/* Background Glow for active season */}
              {season.status === 'active' && (
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#FF3131]/10 rounded-full blur-[80px] pointer-events-none" />
              )}
            </div>
          ))
        )}
      </div>

      {/* Modern Ruby Dialog - Season Form */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsFormOpen(open) }}>
        <DialogContent className="max-w-md mx-4 rounded-[32px] bg-[#141414]/95 backdrop-blur-2xl border-white/[0.08] p-0 overflow-hidden shadow-2xl">
          <div className="p-8">
            <DialogHeader className="mb-8">
              <div className="w-14 h-14 rounded-2xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center shadow-xl mb-6 mx-auto">
                <Calendar className="w-7 h-7 text-[#FF3131]" />
              </div>
              <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter text-center">
                {editingSeason ? 'MODIFICAR <span className="text-[#FF3131]">CICLO</span>' : 'INSTALAR <span className="text-[#FF3131]">CICLO</span>'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              <div className="space-y-2.5">
                <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">CÁDIGO DE TEMPORADA (NOMBRE)</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="TEMPORADA 2024..." className="h-14 bg-[#0A0A0A] border-[#202020] rounded-[20px] text-white placeholder:text-[#2D2D2D] text-xs font-black uppercase tracking-widest focus:border-[#FF3131]/40 px-5" />
              </div>

              <div className="space-y-2.5">
                <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">ESTADO DEL SISTEMA (STATUS)</Label>
                <Select value={formData.status} onValueChange={(v: 'pending' | 'active' | 'finished') => setFormData({ ...formData, status: v })}>
                  <SelectTrigger className="h-14 bg-[#0A0A0A] border-[#202020] rounded-[20px] text-white text-xs font-black uppercase tracking-widest px-5"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#141414] border-white/[0.08]">
                    <SelectItem value="pending" className="text-xs font-black uppercase tracking-widest text-[#6A6C6E]">PENDIENTE</SelectItem>
                    <SelectItem value="active" className="text-xs font-black uppercase tracking-widest text-[#FF3131]">ACTIVA</SelectItem>
                    <SelectItem value="finished" className="text-xs font-black uppercase tracking-widest text-emerald-500">FINALIZADA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex gap-4 p-8 bg-[#0A0A0A]/50 border-t border-white/[0.04]">
            <DialogClose asChild><button className="flex-1 h-14 border border-[#202020] text-[#6A6C6E] hover:text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] transition-all">Abortar</button></DialogClose>
            <button onClick={handleSave} disabled={isSaving} className="flex-1 h-14 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] shadow-[0_0_30px_rgba(255,49,49,0.3)] transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center">
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sincronizar'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modern Ruby AlertDialog - Delete Season */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="max-w-sm mx-4 rounded-[32px] bg-[#141414] border-white/[0.08] p-8 shadow-2xl">
          <AlertDialogHeader className="mb-6">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-8 h-8 text-red-500" />
            </div>
            <AlertDialogTitle className="text-xl font-black text-white uppercase tracking-tighter text-center">PURGAR <span className="text-red-500">CICLO</span></AlertDialogTitle>
            <AlertDialogDescription className="text-center text-xs text-[#6A6C6E] font-bold uppercase tracking-widest mt-2 px-4 shadow-sm leading-relaxed">
              ESTÁS POR ELIMINAR <span className="text-white font-black">{deletingSeason?.name}</span>. ESTA ACCIÓN PURGARA TODAS LAS COMPETICIONES Y PARTIDOS RELACIONADOS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
            <AlertDialogCancel className="flex-1 h-14 bg-[#0A0A0A] border border-[#202020] text-[#6A6C6E] hover:text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] m-0">No</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="flex-1 h-14 bg-red-600 hover:bg-red-700 text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] shadow-[0_0_30px_rgba(220,38,38,0.3)] m-0">Confirmar</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
