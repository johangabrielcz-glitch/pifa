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
    overall: 0,
    club_id: '' as string | null,
    photo_url: '',
    goals: 0,
    assists: 0,
    yellow_cards: 0,
    red_cards: 0
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
      overall: 0,
      club_id: null,
      photo_url: '',
      goals: 0,
      assists: 0,
      yellow_cards: 0,
      red_cards: 0
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
      overall: player.overall || 0,
      club_id: player.club_id,
      photo_url: player.photo_url || '',
      goals: player.goals || 0,
      assists: player.assists || 0,
      yellow_cards: player.yellow_cards || 0,
      red_cards: player.red_cards || 0
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
        overall: formData.overall,
        club_id: formData.club_id === 'none' ? null : formData.club_id,
        photo_url: formData.photo_url.trim() || null,
        goals: formData.goals,
        assists: formData.assists,
        yellow_cards: formData.yellow_cards,
        red_cards: formData.red_cards
      }

      if (editingPlayer) {
        const { error } = await supabase
          .from('players')
          .update(dataToSave)
          .eq('id', editingPlayer.id)

        if (error) throw error
        toast.success('Atleta actualizado correctamente')
      } else {
        const { error } = await supabase.from('players').insert(dataToSave)
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
              <h1 className="text-xl font-black text-white uppercase tracking-tight">GESTIÓN DE <span className="text-[#FF3131]">ATLETAS</span></h1>
              <p className="text-[10px] text-[#6A6C6E] font-black uppercase tracking-[0.2em]">{players.length} REGISTROS ACTIVOS</p>
            </div>
          </div>
          <button 
            onClick={openCreateForm} 
            className="h-11 px-5 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-xl flex items-center gap-2.5 font-black uppercase tracking-widest text-[10px] shadow-[0_0_20px_rgba(255,49,49,0.3)] transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Nuevo Registro
          </button>
        </div>
        
        {/* Search & Filter */}
        <div className="px-6 pb-4 space-y-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#2D2D2D] group-focus-within:text-[#FF3131] transition-colors" />
            <input
              placeholder="SISTEMA DE BÚSQUEDA DE ATLETAS..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-12 pl-12 pr-4 bg-[#141414] border border-[#202020] rounded-xl text-white placeholder:text-[#2D2D2D] text-[11px] font-black uppercase tracking-widest focus:outline-none focus:border-[#FF3131]/40 transition-all"
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

          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => setFilterClub('all')}
              className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap border ${
                filterClub === 'all' 
                  ? 'bg-[#FF3131] text-white border-[#FF3131] shadow-[0_0_15px_rgba(255,49,49,0.2)]' 
                  : 'bg-[#141414] text-[#6A6C6E] border-white/[0.04] hover:border-white/10 hover:text-white'
              }`}
            >
              Todos los Clubes
            </button>
            {clubs.map(club => (
              <button
                key={club.id}
                onClick={() => setFilterClub(club.id)}
                className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap border ${
                  filterClub === club.id
                    ? 'bg-[#FF3131] text-white border-[#FF3131] shadow-[0_0_15_rgba(255,49,49,0.2)]' 
                    : 'bg-[#141414] text-[#6A6C6E] border-white/[0.04] hover:border-white/10 hover:text-white'
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
                className="group relative bg-[#141414]/50 backdrop-blur-xl rounded-[28px] p-5 border border-white/[0.04] transition-all duration-300 hover:border-[#FF3131]/30 hover:bg-[#1A1A1A]/60 animate-fade-in-up shadow-xl overflow-hidden"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                {/* Background glow detail */}
                <div className={`absolute top-0 right-0 w-32 h-32 opacity-0 group-hover:opacity-10 transition-opacity rounded-full blur-3xl ${posColor.bg.replace('10', '50')}`} />
                
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-5 min-w-0">
                    <div className="relative shrink-0">
                      <div className="absolute inset-0 bg-[#FF3131]/20 rounded-2[x] blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className={`w-14 h-14 rounded-[18px] ${posColor.bg} border border-white/[0.04] flex items-center justify-center shadow-2xl transition-transform group-hover:scale-105`}>
                        <span className={`text-lg font-black ${posColor.text}`}>
                          {player.number || '—'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-black text-white uppercase tracking-tight truncate">{player.name}</h3>
                        <div className={`px-2 py-0.5 rounded-md ${posColor.bg} border border-white/[0.04]`}>
                          <p className={`text-[8px] font-black ${posColor.text} tracking-widest uppercase`}>{player.position}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {player.club ? (
                          <div className="flex items-center gap-2 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
                            <Shield className="w-3 h-3 text-[#FF3131]" />
                            <p className="text-[9px] font-black text-[#6A6C6E] uppercase tracking-widest">{player.club.name}</p>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5 opacity-50">
                            <Shield className="w-3 h-3 text-[#2D2D2D]" />
                            <p className="text-[9px] font-black text-[#2D2D2D] uppercase tracking-widest">Agente Libre</p>
                          </div>
                        )}
                        <div className="flex items-center gap-2 bg-[#FF3131]/10 px-2.5 py-1 rounded-lg border border-[#FF3131]/20">
                          <TrendingUp className="w-3 h-3 text-[#FF3131]" />
                          <p className="text-[9px] font-black text-[#FF3131] uppercase tracking-widest">{player.overall} OVR</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2 shrink-0 relative z-10">
                    <button
                      onClick={() => openEditForm(player)}
                      className="w-10 h-10 rounded-full bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white hover:border-[#FF3131]/40 transition-all active:scale-90"
                    >
                      <Pencil className="w-4.5 h-4.5" />
                    </button>
                    <button
                      onClick={() => {
                        setDeletingPlayer(player)
                        setIsDeleteOpen(true)
                      }}
                      className="w-10 h-10 rounded-full bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-red-500/60 hover:text-red-500 hover:border-red-500/40 hover:bg-red-500/10 transition-all active:scale-90"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                  </div>
                </div>
                
                {/* Stats Bar */}
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="bg-[#0A0A0A] border border-white/[0.02] rounded-[18px] p-3 text-center group/stat hover:border-[#FF3131]/20 transition-colors">
                    <p className="text-sm font-black text-white leading-none tabular-nums mb-1 group-hover:text-[#FF3131] transition-colors">{player.goals}</p>
                    <p className="text-[8px] text-[#2D2D2D] font-black uppercase tracking-[0.2em]">Goles</p>
                  </div>
                  <div className="bg-[#0A0A0A] border border-white/[0.02] rounded-[18px] p-3 text-center group/stat hover:border-[#FF3131]/20 transition-colors">
                    <p className="text-sm font-black text-white leading-none tabular-nums mb-1 group-hover:text-[#FF3131] transition-colors">{player.assists}</p>
                    <p className="text-[8px] text-[#2D2D2D] font-black uppercase tracking-[0.2em]">Asists</p>
                  </div>
                  <div className="bg-[#0A0A0A] border border-white/[0.02] rounded-[18px] p-3 text-center group/stat hover:border-[#FF3131]/20 transition-colors">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <span className="text-sm font-black text-amber-500/80">{player.yellow_cards}</span>
                      <span className="text-[10px] text-[#2D2D2D]">/</span>
                      <span className="text-sm font-black text-red-500/80">{player.red_cards}</span>
                    </div>
                    <p className="text-[8px] text-[#2D2D2D] font-black uppercase tracking-[0.2em]">Tarjetas</p>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modern Ruby Dialog - Create/Edit Player */}
      <Dialog open={isFormOpen} onOpenChange={(open) => {
        if (!open) resetForm()
        setIsFormOpen(open)
      }}>
        <DialogContent className="max-w-md mx-4 rounded-[32px] bg-[#141414]/95 backdrop-blur-2xl border-white/[0.08] p-0 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
          <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
            <DialogHeader className="mb-8">
              <div className="w-14 h-14 rounded-2xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center shadow-xl mb-6 mx-auto">
                <Users className="w-7 h-7 text-[#FF3131]" />
              </div>
              <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter text-center">
                {editingPlayer ? 'MODIFICAR <span className="text-[#FF3131]">ATLETA</span>' : 'REGISTRAR <span className="text-[#FF3131]">ATLETA</span>'}
              </DialogTitle>
              <DialogDescription className="text-center text-[9px] text-[#6A6C6E] font-black uppercase tracking-[0.3em] mt-2">
                Actualización de Plantillas Federativas
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              <div className="space-y-2.5">
                <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">Identidad de Registro</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="NOMBRE DEL ATLETA..."
                  className="h-14 bg-[#0A0A0A] border-[#202020] rounded-[20px] text-white placeholder:text-[#2D2D2D] text-xs font-black uppercase tracking-widest focus:border-[#FF3131]/40 px-5"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2.5">
                  <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">Protocolo de Posición</Label>
                  <Select value={formData.position} onValueChange={(v) => setFormData({ ...formData, position: v })}>
                    <SelectTrigger className="h-14 bg-[#0A0A0A] border-[#202020] rounded-[20px] text-white text-xs font-black uppercase tracking-widest focus:border-[#FF3131]/40 px-5">
                      <SelectValue placeholder="SEL." />
                    </SelectTrigger>
                    <SelectContent className="bg-[#141414] border-white/[0.08] rounded-2xl">
                      {POSITIONS.map(p => <SelectItem key={p} value={p} className="text-xs font-black uppercase tracking-widest text-white">{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2.5">
                  <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">Valoración (OVR)</Label>
                  <Input
                    type="number"
                    value={formData.overall}
                    onChange={(e) => setFormData({ ...formData, overall: parseInt(e.target.value) || 0 })}
                    className="h-14 bg-[#0A0A0A] border-[#202020] rounded-[20px] text-white text-center font-black focus:border-[#FF3131]/40"
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">Entidad Federativa (Club)</Label>
                <Select value={formData.club_id || 'none'} onValueChange={(v) => setFormData({ ...formData, club_id: v === 'none' ? null : v })}>
                  <SelectTrigger className="h-14 bg-[#0A0A0A] border-[#202020] rounded-[20px] text-white text-xs font-black uppercase tracking-widest focus:border-[#FF3131]/40 px-5">
                    <SelectValue placeholder="SIN ASIGNAR" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#141414] border-white/[0.08] rounded-2xl">
                    <SelectItem value="none" className="text-xs font-black uppercase tracking-widest text-white/40">LIBRE / SIN ASIGNAR</SelectItem>
                    {clubs.map(c => <SelectItem key={c.id} value={c.id} className="text-xs font-black uppercase tracking-widest text-white">{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2.5">
                  <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">Dorsal</Label>
                  <Input value={formData.number} onChange={(e) => setFormData({ ...formData, number: e.target.value })} placeholder="00" className="h-14 bg-[#0A0A0A] border-[#202020] rounded-[20px] text-white text-center font-black" />
                </div>
                <div className="space-y-2.5">
                  <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">Goles</Label>
                  <Input type="number" value={formData.goals} onChange={(e) => setFormData({ ...formData, goals: parseInt(e.target.value) || 0 })} className="h-14 bg-[#0A0A0A] border-[#202020] rounded-[20px] text-white text-center font-black" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4 p-8 bg-[#0A0A0A]/50 border-t border-white/[0.04]">
            <DialogClose asChild>
              <button className="flex-1 h-14 border border-[#202020] text-[#6A6C6E] hover:text-white hover:bg-white/[0.02] rounded-[20px] font-black uppercase tracking-widest text-[10px] transition-all">
                Abortar
              </button>
            </DialogClose>
            <button 
              onClick={handleSave} 
              disabled={isSaving} 
              className="flex-1 h-14 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] shadow-[0_0_30px_rgba(255,49,49,0.3)] transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sincronizar Datos'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="max-w-sm mx-4 rounded-[32px] bg-[#141414] border-white/[0.08] p-8 shadow-2xl">
          <AlertDialogHeader className="mb-6">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-8 h-8 text-red-500" />
            </div>
            <AlertDialogTitle className="text-xl font-black text-white uppercase tracking-tighter text-center">
              ¿PURGAR <span className="text-red-500">ATLETA</span>?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-xs text-[#6A6C6E] font-bold uppercase tracking-widest leading-relaxed mt-2 px-4 shadow-sm">
              ESTÁS POR ELIMINAR A <span className="text-white font-black">{deletingPlayer?.name}</span> DEL SISTEMA CENTRAL. ESTA ACCIÓN ES IRREVERSIBLE.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
            <AlertDialogCancel className="flex-1 h-14 bg-[#0A0A0A] border border-[#202020] text-[#6A6C6E] hover:text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] transition-all m-0">
              Abortar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              className="flex-1 h-14 bg-red-600 hover:bg-red-700 text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] shadow-[0_0_30px_rgba(220,38,38,0.3)] transition-all m-0"
            >
              PURGAR
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
