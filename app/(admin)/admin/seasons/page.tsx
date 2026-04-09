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
      <header className="sticky top-0 z-30 bg-[#0A0A0A]/90 backdrop-blur-2xl border-b border-white/[0.04]">
        <div className="flex items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => router.back()} 
              className="w-9 h-9 rounded-xl bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white transition-all active:scale-95"
            >
              <ChevronLeft className="w-4.5 h-4.5" />
            </button>
            <div>
              <h1 className="text-base font-black text-white uppercase tracking-tight">CONTROL DE <span className="text-[#FF3131]">CICLOS</span></h1>
              <p className="text-[7px] text-[#2D2D2D] font-black uppercase tracking-[0.3em] font-black">{seasons.length} TEMPORADAS REGISTRADAS</p>
            </div>
          </div>
          <button 
            onClick={openCreateForm} 
            className="h-9 px-4 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-lg flex items-center gap-2 font-black uppercase tracking-widest text-[8px] shadow-[0_0_15px_rgba(255,49,49,0.2)] transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo Ciclo
          </button>
        </div>
      </header>

      <div className="px-6 py-6 space-y-6 pb-32">
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
                className={`group relative bg-[#141414]/50 rounded-[20px] border transition-all duration-300 animate-fade-in-up ${
                  season.status === 'active' 
                    ? 'border-[#FF3131]/20 bg-gradient-to-br from-[#FF3131]/5 to-transparent' 
                    : 'border-white/[0.04] hover:border-[#2D2D2D]'
                }`}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center border shadow-xl transition-transform group-hover:scale-105 ${
                        season.status === 'active' 
                          ? 'bg-[#FF3131] border-white/20 text-white shadow-[#FF3131]/20' 
                          : 'bg-[#0A0A0A] border-[#202020] text-[#2D2D2D]'
                      }`}>
                        <Trophy className="w-5.5 h-5.5" />
                      </div>
                      <div onClick={() => router.push(`/admin/seasons/${season.id}`)} className="cursor-pointer min-w-0">
                        <h3 className="text-sm font-black text-white uppercase tracking-tight mb-0.5 group-hover:text-[#FF3131] transition-colors truncate">{season.name}</h3>
                        <div className="flex items-center gap-2">
                          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-black uppercase tracking-widest text-[7px] ${
                            season.status === 'active'
                              ? 'bg-[#FF3131]/10 text-[#FF3131] border-[#FF3131]/20'
                              : season.status === 'finished'
                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                : 'bg-white/5 text-[#2D2D2D] border-white/5'
                          }`}>
                            <div className={`w-1 h-1 rounded-full ${season.status === 'active' ? 'bg-[#FF3131] animate-pulse' : 'bg-current'}`} />
                            {season.status === 'active' ? 'ACTIVO' : season.status === 'finished' ? 'FINALIZADO' : 'DRAFT'}
                          </div>
                          <p className="text-[7.5px] text-[#2D2D2D] font-black uppercase tracking-widest">
                            {season.competitions_count} COMPETENCIAS
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1.5 relative z-10">
                      <button
                        onClick={() => openEditForm(season)}
                        className="w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#2D2D2D] hover:text-white transition-all"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setDeletingSeason(season)
                          setIsDeleteOpen(true)
                        }}
                        className="w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#2D2D2D] hover:text-red-500 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 pt-4 border-t border-white/[0.04]">
                    {season.status === 'draft' && (
                      <button 
                        onClick={() => handleActivate(season)}
                        className="flex-1 h-9.5 bg-[#FF3131]/5 hover:bg-[#FF3131] text-[#FF3131] hover:text-white border border-[#FF3131]/10 rounded-xl font-black uppercase tracking-widest text-[8px] transition-all flex items-center justify-center gap-2 group/btn"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        Ejecutar Protocolo
                      </button>
                    )}
                    <button 
                      onClick={() => router.push(`/admin/seasons/${season.id}`)}
                      className="flex-1 h-9.5 bg-white/[0.02] hover:bg-white/[0.05] text-[#2D2D2D] hover:text-white border border-white/[0.04] rounded-xl font-black uppercase tracking-widest text-[8px] transition-all flex items-center justify-center gap-2"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                      Control de Ciclo
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

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsFormOpen(open) }}>
        <DialogContent className="max-w-md w-full rounded-[24px] bg-[#141414]/95 backdrop-blur-2xl border-white/[0.08] p-0 overflow-hidden shadow-2xl fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="p-6">
            <DialogHeader className="mb-6">
              <div className="w-11 h-11 rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center shadow-xl mb-4 mx-auto">
                <Calendar className="w-5 h-5 text-[#FF3131]" />
              </div>
              <DialogTitle className="text-base font-black text-white uppercase tracking-tighter text-center">
                {editingSeason ? (
                  <>MODIFICAR <span className="text-[#FF3131]">CICLO</span></>
                ) : (
                  <>INSTALAR <span className="text-[#FF3131]">CICLO</span></>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black ml-1">Código de Temporada (Nombre)</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="TEMPORADA 2024..." className="h-9.5 bg-[#0A0A0A] border-[#202020] rounded-xl text-white placeholder:text-[#2D2D2D] text-xs font-bold uppercase tracking-widest focus:border-[#FF3131]/30 px-4" />
              </div>

              {editingSeason && (
                <div className="space-y-1.5">
                  <Label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black ml-1">Estado Operativo (Status)</Label>
                  <Select value={formData.status} onValueChange={(v: SeasonStatus) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger className="h-9.5 bg-[#0A0A0A] border-[#202020] rounded-xl text-white text-xs font-bold uppercase tracking-widest focus:border-[#FF3131]/30 px-4"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#141414] border-white/[0.08] rounded-xl">
                      <SelectItem value="draft" className="text-xs font-bold uppercase tracking-widest text-[#2D2D2D]">STANDBY (DRAFT)</SelectItem>
                      <SelectItem value="active" className="text-xs font-bold uppercase tracking-widest text-[#FF3131]">SISTEMA ACTIVO</SelectItem>
                      <SelectItem value="finished" className="text-xs font-bold uppercase tracking-widest text-emerald-500">COMPLETADO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 p-6 bg-[#0A0A0A]/50 border-t border-white/[0.04]">
            <DialogClose asChild><button className="flex-1 h-10 border border-[#202020] text-[#2D2D2D] hover:text-white rounded-xl font-black uppercase tracking-widest text-[8px] transition-all">Abortar</button></DialogClose>
            <button onClick={handleSave} disabled={isSaving} className="flex-1 h-10 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-xl font-black uppercase tracking-widest text-[8px] shadow-[0_0_15px_rgba(255,49,49,0.2)] transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sincronizar Datos'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="max-w-xs w-full rounded-[24px] bg-[#141414] border-white/[0.08] p-6 shadow-2xl fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <AlertDialogHeader className="mb-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <AlertDialogTitle className="text-lg font-black text-white uppercase tracking-tighter text-center">PURGAR <span className="text-red-500">CICLO</span></AlertDialogTitle>
            <AlertDialogDescription className="text-center text-[7px] text-[#2D2D2D] font-black uppercase tracking-widest mt-2 px-4 leading-relaxed">
              ¿CONFIRMAS LA PURGA TOTAL DE <span className="text-white font-black">{deletingSeason?.name}</span>? ESTO ELIMINARÁ COMPETENCIAS Y PARTIDOS RELACIONADOS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2">
            <AlertDialogCancel className="flex-1 h-10 bg-[#0A0A0A] border border-[#202020] text-[#2D2D2D] hover:text-white rounded-xl font-black uppercase tracking-widest text-[8px] m-0">No</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="flex-1 h-10 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black uppercase tracking-widest text-[8px] shadow-[0_0_15px_rgba(220,38,38,0.2)] m-0">Purgar</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
