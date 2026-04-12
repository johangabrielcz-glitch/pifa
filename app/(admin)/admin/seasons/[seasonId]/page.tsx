'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Trophy, Loader2, ChevronRight, Swords, LayoutList, Calendar, Lock, Zap, Clock, ChevronLeft, Shield, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import type { Season, Competition, CompetitionType, CompetitionConfig, LeagueConfig, CupConfig, GroupsKnockoutConfig } from '@/lib/types'

const COMPETITION_TYPES: { value: CompetitionType; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'league', label: 'Liga', description: 'Sistema de todos contra todos por puntos.', icon: <LayoutList className="w-5 h-5" /> },
  { value: 'cup', label: 'Copa', description: 'Torneo de eliminación directa.', icon: <Trophy className="w-5 h-5" /> },
  { value: 'groups_knockout', label: 'Grupos + K.O.', description: 'Fase de grupos seguida de llaves finales.', icon: <Swords className="w-5 h-5" /> },
]

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
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deletingComp, setDeletingComp] = useState<Competition | null>(null)
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
    if (seasonError || !seasonData) { toast.error('Archivo no encontrado'); router.push('/admin/seasons'); return }
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
        matches: undefined 
      })) as CompetitionWithCount[]
      setCompetitions(compsWithCount)
    }
    setIsLoading(false)
  }

  useEffect(() => { loadData() }, [seasonId])

  const resetForm = () => { 
    setFormData({ 
      name: '', type: 'league', rounds: 2, points_win: 3, points_draw: 1, points_loss: 0, 
      legs: 2, extra_time: true, penalties: true, groups_count: 4, teams_per_group: 4, 
      teams_advance_per_group: 2, knockout_legs: 2 
    }) 
  }

  const buildConfig = (): CompetitionConfig => {
    switch (formData.type) {
      case 'league': return { rounds: formData.rounds, points_win: formData.points_win, points_draw: formData.points_draw, points_loss: formData.points_loss } as LeagueConfig
      case 'cup': return { legs: formData.legs, extra_time: formData.extra_time, penalties: formData.penalties } as CupConfig
      case 'groups_knockout': return { groups_count: formData.groups_count, teams_per_group: formData.teams_per_group, qualify_per_group: formData.teams_advance_per_group, knockout_legs: formData.knockout_legs } as GroupsKnockoutConfig
      default: return {}
    }
  }

  const handleSubmit = async () => {
    if (!formData.name.trim()) { toast.error('Identificador de competencia requerido'); return }
    setIsSaving(true)
    try {
      const config = buildConfig()
      const { error } = await supabase.from('competitions').insert({ 
        season_id: seasonId, 
        name: formData.name.trim(), 
        type: formData.type, 
        config, 
        status: 'draft' 
      })
      if (error) throw error
      toast.success('Nueva competencia instalada en el ciclo')
      setIsFormOpen(false); resetForm(); loadData()
    } catch (error) { 
      toast.error('Error en la base de datos central') 
    } finally { 
      setIsSaving(false) 
    }
  }

  const handleDeleteComp = async () => {
    if (!deletingComp) return
    try {
      const { error } = await supabase.from('competitions').delete().eq('id', deletingComp.id)
      if (error) throw error
      toast.success('Competencia purgada')
      loadData()
    } catch { toast.error('Fallo en la purga') }
    finally { setIsDeleteOpen(false); setDeletingComp(null) }
  }

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A]">
      <Loader2 className="w-8 h-8 animate-spin text-[#FF3131]" />
    </div>
  )

  const totalMatches = competitions.reduce((sum, c) => sum + c.matches_count, 0)

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0A0A0A]/90 backdrop-blur-2xl border-b border-white/[0.04]">
        <div className="flex items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => router.push('/admin/seasons')} 
              className="w-9 h-9 rounded-xl bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white transition-all active:scale-95"
            >
              <ChevronLeft className="w-4.5 h-4.5" />
            </button>
            <div>
              <h1 className="text-base font-black text-white uppercase tracking-tight">DETALLE DE <span className="text-[#FF3131]">CICLO</span></h1>
              <p className="text-[7px] text-[#2D2D2D] font-black uppercase tracking-[0.2em] font-black">{season?.name}</p>
            </div>
          </div>
          {canEdit && (
            <button 
              onClick={() => setIsFormOpen(true)}
              className="h-9 px-4 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-lg flex items-center gap-2 font-black uppercase tracking-widest text-[8px] shadow-[0_0_15px_rgba(255,49,49,0.2)] transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              Nueva Competencia
            </button>
          )}
        </div>
      </header>

      <div className="px-6 py-6 space-y-6 pb-32">
        {/* Season Overview Card */}
        <div className="relative bg-[#141414]/50 rounded-[20px] border border-white/[0.04] overflow-hidden shadow-2xl animate-fade-in-up">
           <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-[#FF3131]/5 to-transparent rounded-full blur-[60px] -mr-16 -mt-16" />
           
           <div className="relative p-4">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-[#FF3131] flex items-center justify-center shadow-lg">
                  <Calendar className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-black text-white uppercase tracking-tighter">{season?.name}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-black uppercase tracking-widest text-[7px] ${
                      season?.status === 'active' ? 'bg-[#FF3131]/10 text-[#FF3131] border-[#FF3131]/20' : 'bg-white/5 text-[#2D2D2D] border-white/10'
                    }`}>
                      <div className={`w-1 h-1 rounded-full ${season?.status === 'active' ? 'bg-[#FF3131] animate-pulse' : 'bg-current'}`} />
                      {season?.status === 'active' ? 'SISTEMA ACTIVO' : 'STANDBY'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-[#0A0A0A]/30 border border-white/[0.02] rounded-xl p-3 text-center">
                  <p className="text-base font-black text-white leading-none">{competitions.length}</p>
                  <p className="text-[7px] text-[#2D2D2D] font-black uppercase tracking-widest mt-1">Competencias</p>
                </div>
                <div className="bg-[#0A0A0A]/30 border border-white/[0.02] rounded-xl p-3 text-center">
                  <p className="text-base font-black text-white leading-none">{totalMatches}</p>
                  <p className="text-[7px] text-[#2D2D2D] font-black uppercase tracking-widest mt-1">Match Logs</p>
                </div>
                <Link href={`/admin/seasons/${seasonId}/calendar`} className="bg-[#FF3131]/5 hover:bg-[#FF3131]/10 border border-[#FF3131]/10 rounded-xl p-3 flex flex-col items-center justify-center transition-all group">
                   <Calendar className="w-5 h-5 text-[#FF3131] mb-0.5 group-hover:scale-110 transition-transform" />
                   <p className="text-[7px] text-[#FF3131] font-black uppercase tracking-widest">Calendario</p>
                </Link>
              </div>

              {!canEdit && (
                <div className="mt-6 flex items-center gap-2.5 p-3 bg-[#FF3131]/5 rounded-xl border border-[#FF3131]/10">
                  <Lock className="w-3.5 h-3.5 text-[#FF3131]" />
                  <p className="text-[8px] text-[#2D2D2D] font-black uppercase tracking-widest">Registros bloqueados por ciclo activo.</p>
                </div>
              )}
           </div>
        </div>

        {/* Competitions Section */}
        <div>
           <h3 className="text-[8px] text-[#2D2D2D] font-black uppercase tracking-[0.3em] mb-3 ml-2">Terminales de Competencia</h3>
           
           {competitions.length === 0 ? (
             <div className="text-center py-16 bg-[#141414]/30 rounded-[28px] border border-dashed border-white/[0.04] animate-fade-in-up">
                <Trophy className="w-10 h-10 text-[#2D2D2D] mx-auto mb-3" />
                <p className="text-[#2D2D2D] font-black uppercase tracking-[0.2em] text-[8px]">Sin unidades de competencia instaladas</p>
             </div>
           ) : (
             <div className="space-y-3">
                {competitions.map((comp, i) => (
                  <div 
                    key={comp.id}
                    onClick={() => router.push(`/admin/seasons/${seasonId}/competitions/${comp.id}`)}
                    className="group relative bg-[#141414]/50 rounded-[20px] p-4 border border-white/[0.04] transition-all duration-300 hover:border-[#FF3131]/20 animate-fade-in-up cursor-pointer"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <div className="relative flex items-center justify-between">
                       <div className="flex items-center gap-4 min-w-0">
                          <div className="w-11 h-11 rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#FF3131] shadow-xl transition-transform group-hover:scale-105">
                             {comp.type === 'league' ? <LayoutList className="w-5.5 h-5.5" /> : 
                              comp.type === 'cup' ? <Trophy className="w-5.5 h-5.5" /> : <Swords className="w-5.5 h-5.5" />}
                          </div>
                          <div className="min-w-0">
                             <h4 className="text-sm font-black text-white uppercase tracking-tight truncate group-hover:text-[#FF3131] transition-colors">{comp.name}</h4>
                             <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[7.5px] font-black text-[#2D2D2D] uppercase tracking-widest bg-white/[0.02] px-1.5 py-0.5 rounded border border-white/5">
                                   {comp.type.replace('_', ' ')}
                                </span>
                                <p className="text-[7.5px] text-[#2D2D2D] font-black uppercase tracking-widest">{comp.clubs_count} Unidades</p>
                             </div>
                          </div>
                       </div>
                       
                       <div className="flex items-center gap-1.5">
                          <button 
                            onClick={(e) => { e.stopPropagation(); router.push(`/admin/seasons/${seasonId}/competitions/${comp.id}`) }}
                            className="w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#2D2D2D] hover:text-white transition-all shadow-xl"
                          >
                             <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                          {canEdit && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); setDeletingComp(comp); setIsDeleteOpen(true) }}
                              className="w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#2D2D2D] hover:text-red-500 transition-all shadow-xl"
                            >
                               <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                       </div>
                    </div>
                  </div>
                ))}
             </div>
           )}
        </div>
      </div>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsFormOpen(open) }}>
        <DialogContent className="max-w-md w-full rounded-[24px] bg-[#141414]/95 backdrop-blur-2xl border-white/[0.08] p-0 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
            <DialogHeader className="mb-6">
              <div className="w-11 h-11 rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center shadow-xl mb-4 mx-auto">
                <Plus className="w-5 h-5 text-[#FF3131]" />
              </div>
              <DialogTitle className="text-base font-black text-white uppercase tracking-tighter text-center">NUEVA <span className="text-[#FF3131]">COMPETENCIA</span></DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
               <div className="space-y-2.5">
                  <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">Identificador del Torneo</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="LIGA PROFESIONAL..." className="h-10.5 bg-[#0A0A0A] border-[#202020] rounded-xl text-white placeholder:text-[#2D2D2D] text-xs font-black uppercase tracking-widest focus:border-[#FF3131]/40 px-5" />
               </div>

               <div className="grid grid-cols-1 gap-3">
                  <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">Arquitectura de Competencia</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {COMPETITION_TYPES.map(type => (
                      <button 
                        key={type.value}
                        onClick={() => setFormData({ ...formData, type: type.value })}
                        className={`p-3 rounded-xl border transition-all flex flex-col items-center justify-center gap-2 ${
                          formData.type === type.value ? 'bg-[#FF3131]/10 border-[#FF3131] text-white' : 'bg-[#0A0A0A] border-[#202020] text-[#6A6C6E] hover:border-white/10'
                        }`}
                      >
                         <div className={formData.type === type.value ? 'text-[#FF3131]' : ''}>{type.icon}</div>
                         <span className="text-[8px] font-black uppercase tracking-widest">{type.label}</span>
                      </button>
                    ))}
                  </div>
               </div>

               <div className="p-5 bg-[#0A0A0A] rounded-[24px] border border-white/[0.04] space-y-4">
                  <h4 className="text-[9px] text-[#FF3131] font-black uppercase tracking-widest border-b border-white/[0.04] pb-2">Configuración de Protocolo</h4>
                  
                  {formData.type === 'league' && (
                    <div className="space-y-4">
                       <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                             <Label className="text-[9px] text-[#6A6C6E] uppercase">Vueltas</Label>
                             <Input type="number" value={formData.rounds} onChange={(e) => setFormData({...formData, rounds: parseInt(e.target.value) || 1})} className="h-10 bg-[#141414] border-[#202020] rounded-xl text-center text-white" />
                          </div>
                          <div className="space-y-1.5">
                             <Label className="text-[9px] text-[#6A6C6E] uppercase">Pts Victoria</Label>
                             <Input type="number" value={formData.points_win} onChange={(e) => setFormData({...formData, points_win: parseInt(e.target.value) || 0})} className="h-10 bg-[#141414] border-[#202020] rounded-xl text-center text-white" />
                          </div>
                       </div>
                    </div>
                  )}

                  {formData.type === 'cup' && (
                    <div className="space-y-4">
                       <div className="space-y-1.5">
                          <Label className="text-[9px] text-[#6A6C6E] uppercase">Partidos por Llave</Label>
                          <Select value={String(formData.legs)} onValueChange={(v) => setFormData({...formData, legs: parseInt(v)})}>
                             <SelectTrigger className="h-10 bg-[#141414] border-[#202020] rounded-xl text-white"><SelectValue /></SelectTrigger>
                             <SelectContent className="bg-[#141414] border-white/10 text-white rounded-xl">
                                <SelectItem value="1">Partido Único</SelectItem>
                                <SelectItem value="2">Ida y Vuelta</SelectItem>
                             </SelectContent>
                          </Select>
                       </div>
                    </div>
                  )}

                  {formData.type === 'groups_knockout' && (
                    <div className="space-y-4">
                       <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                             <Label className="text-[9px] text-[#6A6C6E] uppercase">Num Grupos</Label>
                             <Input type="number" value={formData.groups_count} onChange={(e) => setFormData({...formData, groups_count: parseInt(e.target.value) || 1})} className="h-10 bg-[#141414] border-[#202020] rounded-xl text-center text-white" />
                          </div>
                          <div className="space-y-1.5">
                             <Label className="text-[9px] text-[#6A6C6E] uppercase">Equipos/Grupo</Label>
                             <Input type="number" value={formData.teams_per_group} onChange={(e) => setFormData({...formData, teams_per_group: parseInt(e.target.value) || 1})} className="h-10 bg-[#141414] border-[#202020] rounded-xl text-center text-white" />
                          </div>
                       </div>
                       <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                             <Label className="text-[9px] text-[#6A6C6E] uppercase">Avanzan/Grupo</Label>
                             <Input type="number" value={formData.teams_advance_per_group} onChange={(e) => setFormData({...formData, teams_advance_per_group: parseInt(e.target.value) || 1})} className="h-10 bg-[#141414] border-[#202020] rounded-xl text-center text-white" />
                          </div>
                          <div className="space-y-1.5">
                             <Label className="text-[9px] text-[#6A6C6E] uppercase">Partidos K.O.</Label>
                             <Select value={String(formData.knockout_legs)} onValueChange={(v) => setFormData({...formData, knockout_legs: parseInt(v)})}>
                                <SelectTrigger className="h-10 bg-[#141414] border-[#202020] rounded-xl text-white text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-[#141414] border-white/10 text-white rounded-xl">
                                   <SelectItem value="1">Partido Unico</SelectItem>
                                   <SelectItem value="2">Ida y Vuelta</SelectItem>
                                </SelectContent>
                             </Select>
                          </div>
                       </div>
                    </div>
                  )}
               </div>
            </div>
          </div>

          <div className="flex gap-3 p-6 bg-[#0A0A0A]/50 border-t border-white/[0.04]">
            <DialogClose asChild><button className="flex-1 h-10 border border-[#202020] text-[#2D2D2D] hover:text-white rounded-xl font-black uppercase tracking-widest text-[8px] transition-all">Abortar</button></DialogClose>
            <button onClick={handleSubmit} disabled={isSaving} className="flex-1 h-10 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-xl font-black uppercase tracking-widest text-[8px] shadow-[0_0_15px_rgba(255,49,49,0.2)] transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Instalar Unidad'}
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
            <AlertDialogTitle className="text-lg font-black text-white uppercase tracking-tighter text-center">PURGAR <span className="text-red-500">UNIDAD</span></AlertDialogTitle>
            <AlertDialogDescription className="text-center text-[7px] text-[#2D2D2D] font-black uppercase tracking-widest mt-2 px-4 leading-relaxed">
              ¿CONFIRMAS LA ELIMINACIÓN DE <span className="text-white font-black">{deletingComp?.name}</span>? TODOS LOS PARTIDOS SERÁN BORRADOS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2">
            <AlertDialogCancel className="flex-1 h-10 bg-[#0A0A0A] border border-[#202020] text-[#2D2D2D] hover:text-white rounded-xl font-black uppercase tracking-widest text-[8px] m-0">No</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteComp} className="flex-1 h-10 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black uppercase tracking-widest text-[8px] shadow-[0_0_15px_rgba(220,38,38,0.2)] m-0">Confirmar</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
