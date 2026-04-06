'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, Shield, Search, X, DollarSign, Users, ChevronLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import type { Club, ClubInsert, ClubUpdate, User } from '@/lib/types'

interface ClubWithStats extends Club {
  players_count: number
  dt?: User | null
}

export default function AdminClubsPage() {
  const router = useRouter()
  const [clubs, setClubs] = useState<ClubWithStats[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [editingClub, setEditingClub] = useState<Club | null>(null)
  const [deletingClub, setDeletingClub] = useState<Club | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    shield_url: '',
    budget: '',
  })

  const loadData = async () => {
    setIsLoading(true)
    
    const { data: clubsData } = await supabase
      .from('clubs')
      .select('*')
      .order('name')

    if (clubsData) {
      const clubsWithStats = await Promise.all(
        clubsData.map(async (club) => {
          const [playersRes, dtRes] = await Promise.all([
            supabase.from('players').select('id', { count: 'exact', head: true }).eq('club_id', club.id),
            supabase.from('users').select('*').eq('club_id', club.id).eq('role', 'user').single(),
          ])
          
          return {
            ...club,
            players_count: playersRes.count || 0,
            dt: dtRes.data || null,
          }
        })
      )
      setClubs(clubsWithStats)
    }
    
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const resetForm = () => {
    setFormData({
      name: '',
      shield_url: '',
      budget: '',
    })
    setEditingClub(null)
  }

  const openCreateForm = () => {
    resetForm()
    setIsFormOpen(true)
  }

  const openEditForm = (club: Club) => {
    setEditingClub(club)
    setFormData({
      name: club.name,
      shield_url: club.shield_url || '',
      budget: club.budget.toString(),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre del club es requerido')
      return
    }

    setIsSaving(true)

    try {
      const budget = parseFloat(formData.budget) || 0

      if (editingClub) {
        const updateData: ClubUpdate = {
          name: formData.name.trim(),
          shield_url: formData.shield_url.trim() || null,
          budget,
        }

        const { error } = await supabase
          .from('clubs')
          .update(updateData)
          .eq('id', editingClub.id)

        if (error) throw error
        toast.success('Club actualizado')
      } else {
        const insertData: ClubInsert = {
          name: formData.name.trim(),
          shield_url: formData.shield_url.trim() || null,
          budget,
        }

        const { error } = await supabase.from('clubs').insert(insertData)
        if (error) throw error
        toast.success('Club creado')
      }

      setIsFormOpen(false)
      resetForm()
      loadData()
    } catch (error) {
      toast.error('Error al guardar el club')
      console.error(error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingClub) return

    try {
      const { error } = await supabase.from('clubs').delete().eq('id', deletingClub.id)
      if (error) throw error
      
      toast.success('Club eliminado')
      setIsDeleteOpen(false)
      setDeletingClub(null)
      loadData()
    } catch {
      toast.error('Error al eliminar el club')
    }
  }

  const formatBudget = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`
    }
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`
    }
    return `$${amount}`
  }

  const filteredClubs = clubs.filter(club =>
    club.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
              <h1 className="text-lg font-bold">Clubes</h1>
              <p className="text-[10px] text-muted-foreground">{clubs.length} registrados</p>
            </div>
          </div>
          <Button size="sm" onClick={openCreateForm} className="bg-primary hover:bg-primary/90 rounded-xl gap-1.5 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" />
            Nuevo
          </Button>
        </div>
        
        {/* Search */}
        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar clubes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 h-11 bg-card/60 border-white/[0.06] rounded-xl focus:bg-card focus:border-primary/30 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Clubs List */}
      <div className="px-5 py-4 space-y-2.5 pb-24">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredClubs.length === 0 ? (
          <div className="text-center py-16 animate-fade-in-up">
            <div className="w-16 h-16 rounded-2xl bg-card/60 border border-white/[0.06] mx-auto mb-4 flex items-center justify-center">
              <Shield className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-muted-foreground font-medium">
              {searchQuery ? 'No se encontraron clubes' : 'No hay clubes registrados'}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {!searchQuery && 'Crea el primer club para empezar'}
            </p>
          </div>
        ) : (
          filteredClubs.map((club, i) => (
            <div
              key={club.id}
              className="bg-card/60 backdrop-blur-sm rounded-2xl p-4 border border-white/[0.06] transition-all duration-300 hover:bg-card/80 hover:border-white/[0.1] animate-fade-in-up"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {club.shield_url ? (
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted/30 flex items-center justify-center shrink-0 ring-1 ring-white/[0.06]">
                      <img
                        src={club.shield_url}
                        alt={club.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-pifa-red/10 flex items-center justify-center shrink-0">
                      <Shield className="w-6 h-6 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{club.name}</p>
                    {club.dt && (
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                        DT: {club.dt.full_name}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditForm(club)}
                    className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground rounded-xl"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDeletingClub(club)
                      setIsDeleteOpen(true)
                    }}
                    className="h-9 w-9 p-0 text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-xl"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <div className="mt-3 flex items-center gap-3">
                <div className="flex items-center gap-2 bg-amber-400/10 rounded-lg px-2.5 py-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-bold text-amber-400">{formatBudget(club.budget)}</span>
                </div>
                <div className="flex items-center gap-2 bg-white/[0.04] rounded-lg px-2.5 py-1.5">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">{club.players_count} jugadores</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => {
        if (!open) resetForm()
        setIsFormOpen(open)
      }}>
        <DialogContent className="max-w-md mx-4 rounded-2xl bg-card/95 backdrop-blur-xl border-white/[0.08]">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingClub ? 'Editar Club' : 'Nuevo Club'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {editingClub ? 'Formulario para editar los datos del club' : 'Formulario para crear un nuevo club'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Nombre del Club</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="FC Barcelona"
                className="h-12 bg-background/50 border-white/[0.08] rounded-xl focus:border-primary/40"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">URL del Escudo (opcional)</Label>
              <Input
                value={formData.shield_url}
                onChange={(e) => setFormData({ ...formData, shield_url: e.target.value })}
                placeholder="https://ejemplo.com/escudo.png"
                className="h-12 bg-background/50 border-white/[0.08] rounded-xl focus:border-primary/40"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Presupuesto (USD)</Label>
              <Input
                type="number"
                value={formData.budget}
                onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                placeholder="1000000"
                className="h-12 bg-background/50 border-white/[0.08] rounded-xl focus:border-primary/40"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <DialogClose asChild>
              <Button variant="outline" className="flex-1 h-12 border-white/[0.08] rounded-xl">Cancelar</Button>
            </DialogClose>
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
            <AlertDialogTitle className="text-foreground">Eliminar Club</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar <strong className="text-foreground">{deletingClub?.name}</strong>? Se eliminarán también sus jugadores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="flex-1 h-12 border-white/[0.08] rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="flex-1 h-12 bg-destructive text-destructive-foreground rounded-xl">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
