'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Calendar, Trophy, Loader2, ChevronRight, Play, CheckCircle, Pencil, Trash2, Clock, Zap, Archive, ChevronLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { calculateMatchDeadlines } from '@/lib/match-engine'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import type { Season, SeasonStatus } from '@/lib/types'

export default function SeasonsPage() {
  const router = useRouter()
  const [seasons, setSeasons] = useState<(Season & { competitions_count: number })[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [editingSeason, setEditingSeason] = useState<Season | null>(null)
  const [deletingSeason, setDeletingSeason] = useState<Season | null>(null)
  const [formData, setFormData] = useState({ name: '', status: 'draft' as SeasonStatus })
  const [isSaving, setIsSaving] = useState(false)

  const loadSeasons = async () => {
    setIsLoading(true)
    const { data, error } = await supabase.from('seasons').select('*, competitions(id)').order('created_at', { ascending: false })
    if (!error && data) {
      const seasonsWithCount = data.map(s => ({ 
        ...s, 
        competitions_count: s.competitions?.length || 0, 
        competitions: undefined 
      })) as (Season & { competitions_count: number })[]
      setSeasons(seasonsWithCount)
    }
    setIsLoading(false)
  }

  useEffect(() => { loadSeasons() }, [])

  const resetForm = () => { setFormData({ name: '', status: 'draft' }); setEditingSeason(null) }
  const openCreateForm = () => { resetForm(); setIsFormOpen(true) }
  const openEditForm = (season: Season) => { 
    setEditingSeason(season); 
    setFormData({ name: season.name, status: season.status }); 
    setIsFormOpen(true) 
  }

  const handleSave = async () => {
    if (!formData.name.trim()) { toast.error('El código de ciclo es requerido'); return }
    setIsSaving(true)
    try {
      const dataToSave = { 
        name: formData.name.trim(), 
        status: formData.status,
        updated_at: new Date().toISOString() 
      }
      
      if (editingSeason) {
        const { error } = await supabase.from('seasons').update(dataToSave).eq('id', editingSeason.id)
        if (error) throw error
        toast.success('Ciclo de temporada actualizado')
      } else {
        const { error } = await supabase.from('seasons').insert({ name: formData.name.trim(), status: 'draft' })
        if (error) throw error
        toast.success('Nuevo ciclo de temporada instalado')
      }
      setIsFormOpen(false); resetForm(); loadSeasons()
    } catch (error) { 
      toast.error('Error en la sincronización de archivos') 
    } finally { 
      setIsSaving(false) 
    }
  }

  const handleDelete = async () => {
    if (!deletingSeason) return
    try {
      const { error } = await supabase.from('seasons').delete().eq('id', deletingSeason.id)
      if (error) throw error
      toast.success('Ciclo purgado correctamente'); loadSeasons()
    } catch (error) { 
      toast.error('Fallo en la purga del ciclo') 
    } finally { 
      setIsDeleteOpen(false); setDeletingSeason(null) 
    }
  }

  const handleActivate = async (season: Season) => {
    try {
      const { error: seasonError } = await supabase
        .from('seasons')
        .update({ status: 'active', activated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', season.id)
      if (seasonError) throw seasonError
      
      const { error: compsError } = await supabase
        .from('competitions')
        .update({ status: 'in_progress', updated_at: new Date().toISOString() })
        .eq('season_id', season.id)
        .eq('status', 'draft')
      if (compsError) throw compsError
      
      await calculateMatchDeadlines(season.id)
      toast.success('PROTOCOLO DE ACTIVACIÁN COMPLETADO — DEADLINES ASIGNADOS'); 
      loadSeasons()
    } catch (error) { 
      toast.error('Error en la activación del protocolo') 
    }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0A0A0A]/80 backdrop-blur-2xl border-b border-white/[0.04]">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.back()} 
              className="w-10 h-10 rounded-xl bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white hover:border-[#FF3131]/40 transition-all active:scale-95"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-black text-white uppercase tracking-tight">CONTROL DE <span className="text-[#FF3131]">CICLOS</span></h1>
              <p className="text-[10px] text-[#6A6C6E] font-black uppercase tracking-[0.2em]">{seasons.length} TEMPORADAS REGISTRADAS</p>
            </div>
          </div>
          <button 
            onClick={openCreateForm} 
            className="h-11 px-5 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-xl flex items-center gap-2.5 font-black uppercase tracking-widest text-[10px] shadow-[0_0_20px_rgba(255,49,49,0.3)] transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Nuevo Ciclo
          </button>
        </div>
      </header>

      <div className="px-6 py-8 space-y-8 pb-32">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF3131]" />
          </div>
        ) : seasons.length === 0 ? (
          <div className="text-center py-20 bg-[#141414]/30 rounded-[32px] border border-dashed border-white/[0.06] animate-fade-in-up">
            <Calendar className="w-16 h-16 text-[#2D2D2D] mx-auto mb-6" />
            <p className="text-[#6A6C6E] font-black uppercase tracking-[0.2em] text-xs px-10">
              SISTEMA SIN CICLOS DE TEMPORADA CONFIGURADOS
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {seasons.map((season, i) => (
              <div
                key={season.id}
                className={`group relative bg-[#141414]/50 backdrop-blur-xl rounded-[28px] border transition-all duration-300 overflow-hidden animate-fade-in-up shadow-xl ${
                  season.status === 'active' 
                    ? 'border-[#FF3131]/30 bg-gradient-to-br from-[#FF3131]/5 to-transparent' 
                    : 'border-white/[0.04] hover:border-white/10'
                }`}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-5">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-2xl transition-transform group-hover:scale-110 ${
                        season.status === 'active' 
                          ? 'bg-[#FF3131] border-white/20 text-white' 
                          : 'bg-[#0A0A0A] border-[#202020] text-[#6A6C6E]'
                      }`}>
                        <Trophy className="w-7 h-7" />
                      </div>
                      <div onClick={() => router.push(`/admin/seasons/${season.id}`)} className="cursor-pointer">
                        <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1 group-hover:text-[#FF3131] transition-colors">{season.name}</h3>
                        <div className="flex items-center gap-3">
                          <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full border font-black uppercase tracking-widest text-[8px] ${
                            season.status === 'active'
                              ? 'bg-[#FF3131]/10 text-[#FF3131] border-[#FF3131]/20'
                              : season.status === 'finished'
                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                : 'bg-white/5 text-[#6A6C6E] border-white/10'
                          }`}>
                            <div className={`w-1.2 h-1.2 rounded-full ${season.status === 'active' ? 'bg-[#FF3131] animate-pulse' : 'bg-current'}`} />
                            {season.status === 'active' ? 'SISTEMA ACTIVO' : season.status === 'finished' ? 'CICLO COMPLETADO' : 'STANDBY MODE'}
                          </div>
                          <p className="text-[10px] text-[#2D2D2D] font-black uppercase tracking-widest">
                            {season.competitions_count} COMPETENCIAS
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 relative z-10">
                      <button
                        onClick={() => openEditForm(season)}
                        className="w-10 h-10 rounded-full bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white hover:border-[#FF3131]/40 transition-all active:scale-90"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setDeletingSeason(season)
                          setIsDeleteOpen(true)
                        }}
                        className="w-10 h-10 rounded-full bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-red-500/60 hover:text-red-500 hover:border-red-500/40 hover:bg-red-500/10 transition-all active:scale-90"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-4 border-t border-white/[0.04]">
                    {season.status === 'draft' && (
                      <button 
                        onClick={() => handleActivate(season)}
                        className="flex-1 h-11 bg-[#FF3131]/10 hover:bg-[#FF3131] text-[#FF3131] hover:text-white border border-[#FF3131]/20 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all flex items-center justify-center gap-2 group/btn"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Ejecutar Protocolo de Inicio
                      </button>
                    )}
                    <button 
                      onClick={() => router.push(`/admin/seasons/${season.id}`)}
                      className="flex-1 h-11 bg-white/5 hover:bg-white/10 text-white border border-white/5 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all flex items-center justify-center gap-2"
                    >
                      <ChevronRight className="w-4 h-4" />
                      Panel de Control de Ciclo
                    </button>
                  </div>
                </div>
                
                {/* Background Glow for active season */}
                {season.status === 'active' && (
                  <div className="absolute -top-20 -right-20 w-48 h-48 bg-[#FF3131]/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-[#FF3131]/20 transition-all duration-700" />
                )}
              </div>
            ))}
          </div>
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
                <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">Código de Temporada (Nombre)</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="TEMPORADA 2024..." className="h-14 bg-[#0A0A0A] border-[#202020] rounded-[20px] text-white placeholder:text-[#2D2D2D] text-xs font-black uppercase tracking-widest focus:border-[#FF3131]/40 px-5" />
              </div>

              {editingSeason && (
                <div className="space-y-2.5">
                  <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">Estado Operativo (Status)</Label>
                  <Select value={formData.status} onValueChange={(v: SeasonStatus) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger className="h-14 bg-[#0A0A0A] border-[#202020] rounded-[20px] text-white text-xs font-black uppercase tracking-widest focus:border-[#FF3131]/40 px-5"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#141414] border-white/[0.08] rounded-xl">
                      <SelectItem value="draft" className="text-xs font-black uppercase tracking-widest text-[#6A6C6E]">STANDBY (DRAFT)</SelectItem>
                      <SelectItem value="active" className="text-xs font-black uppercase tracking-widest text-[#FF3131]">SISTEMA ACTIVO</SelectItem>
                      <SelectItem value="finished" className="text-xs font-black uppercase tracking-widest text-emerald-500">COMPLETADO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-4 p-8 bg-[#0A0A0A]/50 border-t border-white/[0.04]">
            <DialogClose asChild><button className="flex-1 h-14 border border-[#202020] text-[#6A6C6E] hover:text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] transition-all">Abortar</button></DialogClose>
            <button onClick={handleSave} disabled={isSaving} className="flex-1 h-14 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] shadow-[0_0_30px_rgba(255,49,49,0.3)] transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center">
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sincronizar Protocolo'}
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
            <AlertDialogDescription className="text-center text-xs text-[#6A6C6E] font-bold uppercase tracking-widest mt-2 px-4 leading-relaxed">
              ¿CONFIRMAS LA PURGA TOTAL DE <span className="text-white font-black">{deletingSeason?.name}</span>? ESTO ELIMINARÁ COMPETENCIAS Y PARTIDOS RELACIONADOS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
            <AlertDialogCancel className="flex-1 h-14 bg-[#0A0A0A] border border-[#202020] text-[#6A6C6E] hover:text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] m-0">No</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="flex-1 h-14 bg-red-600 hover:bg-red-700 text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] shadow-[0_0_30px_rgba(220,38,38,0.3)] m-0">Purgar</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
