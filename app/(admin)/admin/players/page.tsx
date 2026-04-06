'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, User, Search, X, Shield, ChevronLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import type { Player, Club, PlayerInsert, PlayerUpdate } from '@/lib/types'

const POSITIONS = [
  { value: 'GK', label: 'Portero' },
  { value: 'CB', label: 'Central' },
  { value: 'LB', label: 'Lateral Izq.' },
  { value: 'RB', label: 'Lateral Der.' },
  { value: 'CDM', label: 'Mediocentro Def.' },
  { value: 'CM', label: 'Mediocentro' },
  { value: 'CAM', label: 'Mediapunta' },
  { value: 'LM', label: 'Medio Izq.' },
  { value: 'RM', label: 'Medio Der.' },
  { value: 'LW', label: 'Extremo Izq.' },
  { value: 'RW', label: 'Extremo Der.' },
  { value: 'ST', label: 'Delantero' },
  { value: 'CF', label: 'Falso 9' },
]

const positionColors: Record<string, { bg: string; text: string; bar: string }> = {
  GK: { bg: 'bg-amber-500/15', text: 'text-amber-400', bar: 'bg-amber-400' },
  CB: { bg: 'bg-blue-500/15', text: 'text-blue-400', bar: 'bg-blue-400' },
  LB: { bg: 'bg-blue-500/15', text: 'text-blue-400', bar: 'bg-blue-400' },
  RB: { bg: 'bg-blue-500/15', text: 'text-blue-400', bar: 'bg-blue-400' },
  CDM: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', bar: 'bg-emerald-400' },
  CM: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', bar: 'bg-emerald-400' },
  CAM: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', bar: 'bg-emerald-400' },
  LM: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', bar: 'bg-emerald-400' },
  RM: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', bar: 'bg-emerald-400' },
  LW: { bg: 'bg-rose-500/15', text: 'text-rose-400', bar: 'bg-rose-400' },
  RW: { bg: 'bg-rose-500/15', text: 'text-rose-400', bar: 'bg-rose-400' },
  ST: { bg: 'bg-rose-500/15', text: 'text-rose-400', bar: 'bg-rose-400' },
  CF: { bg: 'bg-rose-500/15', text: 'text-rose-400', bar: 'bg-rose-400' },
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
    age: '',
    nationality: '',
    photo_url: '',
    club_id: '',
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
      age: '',
      nationality: '',
      photo_url: '',
      club_id: '',
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
      age: player.age?.toString() || '',
      nationality: player.nationality || '',
      photo_url: player.photo_url || '',
      club_id: player.club_id,
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.position || !formData.club_id) {
      toast.error('Nombre, posición y club son requeridos')
      return
    }

    setIsSaving(true)

    try {
      if (editingPlayer) {
        const updateData: PlayerUpdate = {
          name: formData.name.trim(),
          position: formData.position,
          number: formData.number ? parseInt(formData.number) : null,
          age: formData.age ? parseInt(formData.age) : null,
          nationality: formData.nationality.trim() || null,
          photo_url: formData.photo_url.trim() || null,
          club_id: formData.club_id,
        }

        const { error } = await supabase
          .from('players')
          .update(updateData)
          .eq('id', editingPlayer.id)

        if (error) throw error
        toast.success('Jugador actualizado')
      } else {
        const insertData: PlayerInsert = {
          name: formData.name.trim(),
          position: formData.position,
          number: formData.number ? parseInt(formData.number) : null,
          age: formData.age ? parseInt(formData.age) : null,
          nationality: formData.nationality.trim() || null,
          photo_url: formData.photo_url.trim() || null,
          club_id: formData.club_id,
        }

        const { error } = await supabase.from('players').insert(insertData)
        if (error) throw error
        toast.success('Jugador creado')
      }

      setIsFormOpen(false)
      resetForm()
      loadData()
    } catch (error) {
      toast.error('Error al guardar el jugador')
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
      
      toast.success('Jugador eliminado')
      setIsDeleteOpen(false)
      setDeletingPlayer(null)
      loadData()
    } catch {
      toast.error('Error al eliminar el jugador')
    }
  }

  const filteredPlayers = players.filter(player => {
    const matchesSearch = player.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesClub = filterClub === 'all' || player.club_id === filterClub
    return matchesSearch && matchesClub
  })

  return (
    <div className="min-h-dvh bg-background safe-area-top">
      {/* Header */}
      <header className="sticky top-[57px] z-30 bg-background/80 backdrop-blur-2xl border-b border-white/[0.06]">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="p-2 -ml-2 text-muted-foreground hover:text-foreground rounded-xl transition-colors active:scale-95">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold">Jugadores</h1>
              <p className="text-[10px] text-muted-foreground">{players.length} registrados</p>
            </div>
          </div>
          <Button size="sm" onClick={openCreateForm} disabled={clubs.length === 0} className="bg-primary hover:bg-primary/90 rounded-xl gap-1.5 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" />
            Nuevo
          </Button>
        </div>
        
        {/* Search & Filter */}
        <div className="px-5 pb-3 space-y-2.5">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar jugadores..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 h-11 bg-card/60 border-white/[0.06] rounded-xl focus:bg-card focus:border-primary/30 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Club filter pills */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
            <button
              onClick={() => setFilterClub('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                filterClub === 'all' 
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' 
                  : 'bg-card/60 text-muted-foreground border border-white/[0.06] hover:bg-card/80'
              }`}
            >
              Todos ({players.length})
            </button>
            {clubs.map(club => {
              const count = players.filter(p => p.club_id === club.id).length
              return (
                <button
                  key={club.id}
                  onClick={() => setFilterClub(club.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                    filterClub === club.id
                      ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' 
                      : 'bg-card/60 text-muted-foreground border border-white/[0.06] hover:bg-card/80'
                  }`}
                >
                  {club.name} ({count})
                </button>
              )
            })}
          </div>
        </div>
      </header>

      {/* Players List */}
      <div className="px-5 py-4 space-y-2 pb-24">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : clubs.length === 0 ? (
          <div className="text-center py-16 animate-fade-in-up">
            <div className="w-16 h-16 rounded-2xl bg-card/60 border border-white/[0.06] mx-auto mb-4 flex items-center justify-center">
              <Shield className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-muted-foreground font-medium">Primero debes crear un club</p>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="text-center py-16 animate-fade-in-up">
            <div className="w-16 h-16 rounded-2xl bg-card/60 border border-white/[0.06] mx-auto mb-4 flex items-center justify-center">
              <User className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-muted-foreground font-medium">
              {searchQuery || filterClub !== 'all' ? 'No se encontraron jugadores' : 'No hay jugadores registrados'}
            </p>
          </div>
        ) : (
          filteredPlayers.map((player, i) => {
            const posColor = positionColors[player.position] || { bg: 'bg-muted/20', text: 'text-muted-foreground', bar: 'bg-muted' }
            return (
              <div
                key={player.id}
                className="relative bg-card/60 backdrop-blur-sm rounded-2xl p-4 border border-white/[0.06] overflow-hidden transition-all duration-300 hover:bg-card/80 animate-fade-in-up"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                {/* Position color bar */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${posColor.bar} rounded-l-2xl`} />
                
                <div className="flex items-center justify-between pl-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-11 h-11 rounded-xl ${posColor.bg} flex items-center justify-center shrink-0`}>
                      <span className={`text-base font-bold ${posColor.text}`}>
                        {player.number || '-'}
                      </span>
                    </div>
                    
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{player.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${posColor.bg} ${posColor.text}`}>
                          {player.position}
                        </span>
                        {player.club && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                            {player.club.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => openEditForm(player)} className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground rounded-xl">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setDeletingPlayer(player); setIsDeleteOpen(true) }} className="h-9 w-9 p-0 text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-xl">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                {(player.age || player.nationality) && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground pl-2">
                    {player.age && <span>{player.age} años</span>}
                    {player.age && player.nationality && <span className="opacity-40">•</span>}
                    {player.nationality && <span>{player.nationality}</span>}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => {
        if (!open) resetForm()
        setIsFormOpen(open)
      }}>
        <DialogContent className="max-w-md mx-4 rounded-2xl bg-card/95 backdrop-blur-xl border-white/[0.08] max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingPlayer ? 'Editar Jugador' : 'Nuevo Jugador'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {editingPlayer ? 'Formulario para editar los datos del jugador' : 'Formulario para crear un nuevo jugador'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Club</Label>
              <Select value={formData.club_id || "__none__"} onValueChange={(value) => setFormData({ ...formData, club_id: value === "__none__" ? "" : value })}>
                <SelectTrigger className="h-12 bg-background/50 border-white/[0.08] rounded-xl"><SelectValue placeholder="Seleccionar club" /></SelectTrigger>
                <SelectContent className="bg-card/95 backdrop-blur-xl border-white/[0.08]">
                  <SelectItem value="__none__" className="text-muted-foreground">Seleccionar club...</SelectItem>
                  {clubs.map((club) => (<SelectItem key={club.id} value={club.id}>{club.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Nombre del Jugador</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Lionel Messi" className="h-12 bg-background/50 border-white/[0.08] rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Posición</Label>
                <Select value={formData.position || "__none__"} onValueChange={(value) => setFormData({ ...formData, position: value === "__none__" ? "" : value })}>
                  <SelectTrigger className="h-12 bg-background/50 border-white/[0.08] rounded-xl"><SelectValue placeholder="Posición" /></SelectTrigger>
                  <SelectContent className="bg-card/95 backdrop-blur-xl border-white/[0.08]">
                    <SelectItem value="__none__" className="text-muted-foreground">Seleccionar...</SelectItem>
                    {POSITIONS.map((pos) => (<SelectItem key={pos.value} value={pos.value}>{pos.value}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Dorsal</Label>
                <Input type="number" value={formData.number} onChange={(e) => setFormData({ ...formData, number: e.target.value })} placeholder="10" min="1" max="99" className="h-12 bg-background/50 border-white/[0.08] rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Edad</Label>
                <Input type="number" value={formData.age} onChange={(e) => setFormData({ ...formData, age: e.target.value })} placeholder="25" min="15" max="50" className="h-12 bg-background/50 border-white/[0.08] rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Nacionalidad</Label>
                <Input value={formData.nationality} onChange={(e) => setFormData({ ...formData, nationality: e.target.value })} placeholder="Argentina" className="h-12 bg-background/50 border-white/[0.08] rounded-xl" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">URL de Foto (opcional)</Label>
              <Input value={formData.photo_url} onChange={(e) => setFormData({ ...formData, photo_url: e.target.value })} placeholder="https://ejemplo.com/foto.png" className="h-12 bg-background/50 border-white/[0.08] rounded-xl" />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <DialogClose asChild><Button variant="outline" className="flex-1 h-12 border-white/[0.08] rounded-xl">Cancelar</Button></DialogClose>
            <Button onClick={handleSave} disabled={isSaving} className="flex-1 h-12 bg-primary rounded-xl shadow-lg shadow-primary/20">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="max-w-sm mx-4 rounded-2xl bg-card/95 backdrop-blur-xl border-white/[0.08]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Eliminar Jugador</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar a <strong className="text-foreground">{deletingPlayer?.name}</strong>? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="flex-1 h-12 border-white/[0.08] rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="flex-1 h-12 bg-destructive text-destructive-foreground rounded-xl">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
