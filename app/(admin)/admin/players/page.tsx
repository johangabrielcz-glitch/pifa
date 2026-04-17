'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, User, Search, X, Shield, ChevronLeft, Users, Zap, TrendingUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import type { Player, Club, PlayerInsert, PlayerUpdate } from '@/lib/types'
import { ImageUpload } from '@/components/pifa/image-upload'

const POSITIONS = [
  'GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF'
]

const positionColors: Record<string, { bg: string; text: string; bar: string }> = {
  GK: { bg: 'bg-amber-500/10', text: 'text-amber-400', bar: 'bg-amber-400' },
  CB: { bg: 'bg-blue-500/10', text: 'text-blue-400', bar: 'bg-blue-400' },
  LB: { bg: 'bg-blue-500/10', text: 'text-blue-400', bar: 'bg-blue-400' },
  RB: { bg: 'bg-blue-500/10', text: 'text-blue-400', bar: 'bg-blue-400' },
  CDM: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', bar: 'bg-emerald-400' },
  CM: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', bar: 'bg-emerald-400' },
  CAM: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', bar: 'bg-emerald-400' },
  LM: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', bar: 'bg-emerald-400' },
  RM: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', bar: 'bg-emerald-400' },
  LW: { bg: 'bg-rose-500/10', text: 'text-rose-400', bar: 'bg-rose-400' },
  RW: { bg: 'bg-rose-500/10', text: 'text-rose-400', bar: 'bg-rose-400' },
  ST: { bg: 'bg-rose-500/10', text: 'text-rose-400', bar: 'bg-rose-400' },
  CF: { bg: 'bg-rose-500/10', text: 'text-rose-400', bar: 'bg-rose-400' },
}

interface PlayerWithClub extends Player {
  club?: Club | null
}

export default function AdminPlayersPage() {
  const router = useRouter()
  const [players, setPlayers] = useState<PlayerWithClub[]>([])
  const [clubs, setClubs] = useState<Club[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterClub, setFilterClub] = useState<string>('all')
  
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [deletingPlayer, setDeletingPlayer] = useState<Player | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    position: '',
    number: '',
    club_id: '' as string | null,
    photo_url: '',
    salary: '25000',
    contract_seasons_left: '3',
    squad_role: '' as string
  })

  const loadData = async () => {
    setIsLoading(true)
    
    const [playersRes, clubsRes] = await Promise.all([
      supabase.from('players').select('*, club:clubs(*)').order('club_id').order('position').order('number'),
      supabase.from('clubs').select('*').order('name'),
    ])

    if (playersRes.data) {
      setPlayers(playersRes.data.map(p => ({ ...p, club: p.club || null })))
    }
    if (clubsRes.data) {
      setClubs(clubsRes.data)
    }
    
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const resetForm = () => {
    setFormData({
      name: '',
      position: '',
      number: '',
      club_id: null,
      photo_url: '',
      salary: '25000',
      contract_seasons_left: '3',
      squad_role: ''
    })
    setEditingPlayer(null)
  }

  const openCreateForm = () => {
    resetForm()
    setIsFormOpen(true)
  }

  const openEditForm = (player: Player) => {
    setEditingPlayer(player)
    setFormData({
      name: player.name,
      position: player.position,
      number: player.number?.toString() || '',
      club_id: player.club_id,
      photo_url: player.photo_url || '',
      salary: (player.salary ?? 25000).toString(),
      contract_seasons_left: (player.contract_seasons_left ?? 3).toString(),
      squad_role: player.squad_role || ''
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.position) {
      toast.error('Nombre y posición son requeridos')
      return
    }

    setIsSaving(true)

    try {
      const dataToSave = {
        name: formData.name.trim(),
        position: formData.position,
        number: formData.number ? parseInt(formData.number) : null,
        club_id: formData.club_id === 'none' ? null : formData.club_id,
        photo_url: formData.photo_url.trim() || null,
        salary: formData.salary ? parseInt(formData.salary) : 25000,
        contract_seasons_left: formData.contract_seasons_left ? parseInt(formData.contract_seasons_left) : 3,
        squad_role: formData.squad_role || null
      }

      if (editingPlayer) {
        const { error } = await supabase
          .from('players')
          .update(dataToSave)
          .eq('id', editingPlayer.id)

        if (error) throw error
        toast.success('Atleta actualizado correctamente')
      } else {
        const { error } = await supabase.from('players').insert({
          ...dataToSave,
          morale: 100
        })
        if (error) throw error
        toast.success('Atleta registrado en el sistema')
      }

      setIsFormOpen(false)
      resetForm()
      loadData()
    } catch (error) {
      toast.error('Error en la sincronización de datos')
      console.error(error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingPlayer) return

    try {
      const { error } = await supabase.from('players').delete().eq('id', deletingPlayer.id)
      if (error) throw error
      
      toast.success('Atleta purgado del sistema')
      setIsDeleteOpen(false)
      setDeletingPlayer(null)
      loadData()
    } catch {
      toast.error('Error al purgar los datos')
    }
  }

  const filteredPlayers = players.filter(player => {
    const matchesSearch = player.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesClub = filterClub === 'all' || player.club_id === filterClub
    return matchesSearch && matchesClub
  })

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
              <h1 className="text-base font-black text-white uppercase tracking-tight">GESTIÓN DE <span className="text-[#FF3131]">ATLETAS</span></h1>
              <p className="text-[7px] text-[#2D2D2D] font-black uppercase tracking-[0.3em] font-black">{players.length} REGISTROS ACTIVOS</p>
            </div>
          </div>
          <button 
            onClick={openCreateForm} 
            className="h-9 px-4 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-lg flex items-center gap-2 font-black uppercase tracking-widest text-[8px] shadow-[0_0_15px_rgba(255,49,49,0.2)] transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo Registro
          </button>
        </div>
        
        {/* Search & Filter */}
        <div className="px-6 pb-3.5 space-y-3">
          <div className="relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2D2D2D] group-focus-within:text-[#FF3131] transition-colors" />
            <input
              placeholder="SISTEMA DE BÚSQUEDA DE ATLETAS..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9.5 pl-10 pr-4 bg-[#141414] border border-[#202020] rounded-lg text-white placeholder:text-[#2D2D2D] text-[10px] font-black uppercase tracking-widest focus:outline-none focus:border-[#FF3131]/30 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6A6C6E] hover:text-white p-1 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => setFilterClub('all')}
              className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${
                filterClub === 'all' 
                  ? 'bg-[#FF3131] text-white border-[#FF3131] shadow-[0_0_10px_rgba(255,49,49,0.2)]' 
                  : 'bg-[#141414] text-[#2D2D2D] border-white/[0.04] hover:border-[#2D2D2D] hover:text-white'
              }`}
            >
              Todos los Clubes
            </button>
            {clubs.map(club => (
              <button
                key={club.id}
                onClick={() => setFilterClub(club.id)}
                className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${
                  filterClub === club.id
                    ? 'bg-[#FF3131] text-white border-[#FF3131] shadow-[0_0_10px_rgba(255,49,49,0.2)]' 
                    : 'bg-[#141414] text-[#2D2D2D] border-white/[0.04] hover:border-[#2D2D2D] hover:text-white'
                }`}
              >
                {club.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Players List */}
      <div className="px-6 py-6 space-y-4 pb-32">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF3131]" />
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="text-center py-20 bg-[#141414]/30 rounded-[32px] border border-dashed border-white/[0.06] animate-fade-in-up">
            <div className="w-20 h-20 rounded-3xl bg-[#0A0A0A] border border-[#202020] mx-auto mb-6 flex items-center justify-center">
              <User className="w-10 h-10 text-[#2D2D2D]" />
            </div>
            <p className="text-[#6A6C6E] font-black uppercase tracking-[0.2em] text-xs px-10">
              NO SE ENCONTRARON COINCIDENCIAS EN LA RED CENTRAL
            </p>
          </div>
        ) : (
          filteredPlayers.map((player, i) => {
            const posColor = positionColors[player.position] || { bg: 'bg-muted/10', text: 'text-muted-foreground', bar: 'bg-muted' }
            return (
              <div
                key={player.id}
                className="group relative bg-[#141414]/50 rounded-[20px] p-4 border border-white/[0.04] transition-all duration-300 hover:border-[#FF3131]/20 animate-fade-in-up"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="relative shrink-0">
                      <div className={`w-11 h-11 rounded-xl ${posColor.bg} border border-white/[0.04] flex items-center justify-center shadow-2xl transition-transform group-hover:scale-105`}>
                        <span className={`text-base font-black ${posColor.text}`}>
                          {player.number || '—'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-black text-white uppercase tracking-tight truncate">{player.name}</h3>
                        <div className={`px-1.5 py-0.5 rounded-md ${posColor.bg} border border-white/[0.04]`}>
                          <p className={`text-[7px] font-black ${posColor.text} tracking-widest uppercase`}>{player.position}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {player.club ? (
                          <div className="flex items-center gap-1.5 bg-white/[0.02] px-2 py-0.5 rounded-md border border-white/[0.04]">
                            <Shield className="w-2.5 h-2.5 text-[#FF3131]" />
                            <p className="text-[7.5px] font-black text-[#424242] uppercase tracking-widest">{player.club.name}</p>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 bg-white/[0.02] px-2 py-0.5 rounded-md border border-white/[0.04] opacity-50">
                            <Shield className="w-2.5 h-2.5 text-[#2D2D2D]" />
                            <p className="text-[7.5px] font-black text-[#2D2D2D] uppercase tracking-widest">Agente Libre</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 shrink-0 relative z-10">
                    <button
                      onClick={() => openEditForm(player)}
                      className="w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#2D2D2D] hover:text-white transition-all shadow-xl"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setDeletingPlayer(player)
                        setIsDeleteOpen(true)
                      }}
                      className="w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#2D2D2D] hover:text-red-500 hover:bg-red-500/5 transition-all shadow-xl"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <Dialog open={isFormOpen} onOpenChange={(open) => {
        if (!open) resetForm()
        setIsFormOpen(open)
      }}>
        <DialogContent className="max-w-md w-full rounded-[24px] bg-[#141414]/95 backdrop-blur-2xl border-white/[0.08] p-0 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
            <DialogHeader className="mb-6">
              <div className="w-11 h-11 rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center shadow-xl mb-4 mx-auto">
                <Users className="w-5 h-5 text-[#FF3131]" />
              </div>
              <DialogTitle className="text-xl font-black text-white uppercase tracking-tighter text-center">
                {editingPlayer ? (
                  <>MODIFICAR <span className="text-[#FF3131]">ATLETA</span></>
                ) : (
                  <>REGISTRAR <span className="text-[#FF3131]">ATLETA</span></>
                )}
              </DialogTitle>
              <DialogDescription className="text-center text-[7px] text-[#2D2D2D] font-black uppercase tracking-[0.3em] mt-1.5">
                Protocolo de Plantillas Federativas - PIFA
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black ml-1">Identidad de Registro</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="NOMBRE DEL ATLETA..."
                  className="h-10.5 bg-[#0A0A0A] border-[#202020] rounded-xl text-white placeholder:text-[#2D2D2D] text-xs font-bold uppercase tracking-widest focus:border-[#FF3131]/30 transition-all px-4"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black ml-1">Protocolo de Posición</Label>
                <Select value={formData.position} onValueChange={(v) => setFormData({ ...formData, position: v })}>
                  <SelectTrigger className="h-10.5 bg-[#0A0A0A] border-[#202020] rounded-xl text-white text-xs font-bold uppercase tracking-widest focus:border-[#FF3131]/30 transition-all px-4">
                    <SelectValue placeholder="SEL." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#141414] border-white/[0.08] rounded-xl">
                    {POSITIONS.map(p => <SelectItem key={p} value={p} className="text-xs font-bold uppercase tracking-widest text-white">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <ImageUpload
                label="Recurso Visual (Foto)"
                value={formData.photo_url}
                onChange={(url) => setFormData({ ...formData, photo_url: url })}
                onRemove={() => setFormData({ ...formData, photo_url: '' })}
                folder="players"
              />

              <div className="space-y-1.5">
                <Label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black ml-1">Entidad Federativa (Club)</Label>
                <Select value={formData.club_id || 'none'} onValueChange={(v) => setFormData({ ...formData, club_id: v === 'none' ? null : v })}>
                  <SelectTrigger className="h-10.5 bg-[#0A0A0A] border-[#202020] rounded-xl text-white text-xs font-bold uppercase tracking-widest focus:border-[#FF3131]/30 transition-all px-4">
                    <SelectValue placeholder="SIN ASIGNAR" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#141414] border-white/[0.08] rounded-xl">
                    <SelectItem value="none" className="text-xs font-bold uppercase tracking-widest text-white/40">LIBRE / SIN ASIGNAR</SelectItem>
                    {clubs.map(c => <SelectItem key={c.id} value={c.id} className="text-xs font-bold uppercase tracking-widest text-white">{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black ml-1">Dorsal</Label>
                <Input value={formData.number} onChange={(e) => setFormData({ ...formData, number: e.target.value })} placeholder="00" className="h-10.5 bg-[#0A0A0A] border-[#202020] rounded-xl text-white text-center font-bold text-xs" />
              </div>

              {/* Contract Fields */}
              <div className="w-full h-px bg-gradient-to-r from-transparent via-white/[0.05] to-transparent my-2"></div>
              <p className="text-[8px] text-[#FF3131] font-black uppercase tracking-[0.2em] ml-1">📋 Protocolo de Contrato</p>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black ml-1">Salario ($)</Label>
                  <Input value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: e.target.value })} placeholder="25000" className="h-10.5 bg-[#0A0A0A] border-[#202020] rounded-xl text-white text-center font-bold text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black ml-1">Temporadas</Label>
                  <Input value={formData.contract_seasons_left} onChange={(e) => setFormData({ ...formData, contract_seasons_left: e.target.value })} placeholder="3" className="h-10.5 bg-[#0A0A0A] border-[#202020] rounded-xl text-white text-center font-bold text-xs" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black ml-1">Rol en Plantilla</Label>
                <Select value={formData.squad_role || 'none'} onValueChange={(v) => setFormData({ ...formData, squad_role: v === 'none' ? '' : v })}>
                  <SelectTrigger className="h-10.5 bg-[#0A0A0A] border-[#202020] rounded-xl text-white text-xs font-bold uppercase tracking-widest focus:border-[#FF3131]/30 transition-all px-4">
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#141414] border-white/[0.08] rounded-xl">
                    <SelectItem value="none" className="text-xs font-bold uppercase tracking-widest text-white/40">Sin asignar</SelectItem>
                    <SelectItem value="essential" className="text-xs font-bold uppercase tracking-widest text-amber-400">⭐ Esencial</SelectItem>
                    <SelectItem value="important" className="text-xs font-bold uppercase tracking-widest text-blue-400">🔵 Importante</SelectItem>
                    <SelectItem value="rotation" className="text-xs font-bold uppercase tracking-widest text-white/60">🔄 Rotación</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex gap-3 p-6 bg-[#0A0A0A]/50 border-t border-white/[0.04]">
            <DialogClose asChild>
              <button className="flex-1 h-10 border border-[#202020] text-[#2D2D2D] hover:text-white rounded-xl font-black uppercase tracking-widest text-[8px] transition-all text-center">
                Abortar
              </button>
            </DialogClose>
            <button 
              onClick={handleSave} 
              disabled={isSaving} 
              className="flex-1 h-10 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-xl font-black uppercase tracking-widest text-[8px] shadow-[0_0_15px_rgba(255,49,49,0.2)] transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center"
            >
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
            <AlertDialogTitle className="text-lg font-black text-white uppercase tracking-tighter text-center">
              ¿PURGAR <span className="text-red-500">ATLETA</span>?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-[7px] text-[#2D2D2D] font-black uppercase tracking-widest leading-relaxed mt-2 px-4 shadow-sm">
              ESTÁS POR ELIMINAR A <span className="text-white font-black">{deletingPlayer?.name}</span> DEL SISTEMA CENTRAL. ESTA ACCIÓN ES IRREVERSIBLE.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2">
            <AlertDialogCancel className="flex-1 h-10 bg-[#0A0A0A] border border-[#202020] text-[#2D2D2D] hover:text-white rounded-xl font-black uppercase tracking-widest text-[8px] transition-all m-0">
              Abortar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              className="flex-1 h-10 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black uppercase tracking-widest text-[8px] shadow-[0_0_15px_rgba(220,38,38,0.2)] transition-all m-0"
            >
              PURGAR
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
