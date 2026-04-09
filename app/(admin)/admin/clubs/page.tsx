'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, Shield, Search, X, DollarSign, Users, ChevronLeft, Image as ImageIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import type { Club, ClubInsert, ClubUpdate, User } from '@/lib/types'
import { ImageUpload } from '@/components/pifa/image-upload'

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
            dt: dtRes.data || null
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
              <h1 className="text-base font-black text-white uppercase tracking-tight">GESTIÓN DE <span className="text-[#FF3131]">CLUBES</span></h1>
              <p className="text-[7px] text-[#2D2D2D] font-black uppercase tracking-[0.3em] font-black">{clubs.length} ENTIDADES REGISTRADAS</p>
            </div>
          </div>
          <button 
            onClick={openCreateForm} 
            className="h-9 px-4 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-lg flex items-center gap-2 font-black uppercase tracking-widest text-[8px] shadow-[0_0_15px_rgba(255,49,49,0.2)] transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo Club
          </button>
        </div>
        
        {/* Search */}
        <div className="px-6 pb-3.5">
          <div className="relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2D2D2D] group-focus-within:text-[#FF3131] transition-colors" />
            <input
              placeholder="SISTEMA DE FILTRADO NOMINAL..."
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
        </div>
      </header>

      {/* Clubs List */}
      <div className="px-6 py-6 space-y-4 pb-32">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF3131]" />
          </div>
        ) : filteredClubs.length === 0 ? (
          <div className="text-center py-20 bg-[#141414]/30 rounded-[32px] border border-dashed border-white/[0.06] animate-fade-in-up">
            <div className="w-20 h-20 rounded-3xl bg-[#0A0A0A] border border-[#202020] mx-auto mb-6 flex items-center justify-center">
              <Shield className="w-10 h-10 text-[#2D2D2D]" />
            </div>
            <p className="text-[#6A6C6E] font-black uppercase tracking-[0.2em] text-xs">
              {searchQuery ? 'SIN COINCIDENCIAS EN LA BASE DE DATOS' : 'BASE DE DATOS DE CLUBES VACÁA'}
            </p>
            <p className="text-[10px] text-[#2D2D2D] font-bold uppercase tracking-widest mt-2 px-10">
              {!searchQuery && 'INICIA EL REGISTRO DE NUEVAS ENTIDADES PARA COMENZAR LA TEMPORADA'}
            </p>
          </div>
        ) : (
          filteredClubs.map((club, i) =>             <div
              key={club.id}
              className="group relative bg-[#141414]/50 rounded-[20px] p-4 border border-white/[0.04] transition-all duration-300 hover:border-[#FF3131]/20 animate-fade-in-up"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="relative shrink-0">
                    <div className="absolute inset-0 bg-[#FF3131]/10 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                    {club.shield_url ? (
                      <div className="relative w-13 h-13 rounded-xl overflow-hidden bg-[#0A0A0A] border border-[#202020] flex items-center justify-center p-2 shadow-2xl transition-transform group-hover:scale-105">
                        <img
                          src={club.shield_url}
                          alt={club.name}
                          className="w-full h-full object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                        />
                      </div>
                    ) : (
                      <div className="relative w-13 h-13 rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center shadow-2xl transition-transform group-hover:scale-105">
                        <Shield className="w-6 h-6 text-[#FF3131]" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-white uppercase tracking-tight truncate mb-0.5">{club.name}</h3>
                    {club.dt ? (
                      <div className="flex items-center gap-1.5 bg-[#FF3131]/5 w-fit px-2 py-0.5 rounded-full border border-[#FF3131]/10">
                        <div className="w-1 h-1 rounded-full bg-[#FF3131] animate-pulse" />
                        <p className="text-[7.5px] font-black text-[#FF3131] uppercase tracking-[0.1em]">
                          DT: {club.dt.full_name}
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 bg-white/[0.02] w-fit px-2 py-0.5 rounded-full border border-white/[0.04]">
                        <div className="w-1 h-1 rounded-full bg-[#2D2D2D]" />
                        <p className="text-[7.5px] font-black text-[#2D2D2D] uppercase tracking-[0.1em]">
                          SIN ASIGNACIÓN
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-1 shrink-0 relative z-10">
                  <button
                    onClick={() => openEditForm(club)}
                    className="w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#2D2D2D] hover:text-white transition-all shadow-xl"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setDeletingClub(club)
                      setIsDeleteOpen(true)
                    }}
                    className="w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#2D2D2D] hover:text-red-500 hover:bg-red-500/5 transition-all shadow-xl"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              
              {/* Club Context Stats */}
              <div className="relative mt-4 pt-4 border-t border-white/[0.04] flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2.5 bg-[#0A0A0A]/30 border border-white/[0.02] rounded-xl px-3 py-2.5 group/stat">
                  <div className="w-7 h-7 rounded-lg bg-amber-400/5 flex items-center justify-center border border-amber-400/10">
                    <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[12px] font-black text-white tracking-widest leading-none">{formatBudget(club.budget)}</p>
                    <p className="text-[7px] text-[#2D2D2D] uppercase font-black tracking-widest mt-0.5">Tesorería</p>
                  </div>
                </div>
                <div className="flex-1 flex items-center gap-2.5 bg-[#0A0A0A]/30 border border-white/[0.02] rounded-xl px-3 py-2.5 group/stat">
                  <div className="w-7 h-7 rounded-lg bg-emerald-400/5 flex items-center justify-center border border-emerald-400/10">
                    <Users className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[12px] font-black text-white tracking-widest leading-none">{club.players_count}</p>
                    <p className="text-[7px] text-[#2D2D2D] uppercase font-black tracking-widest mt-0.5">Operativos</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
      </div>

      <Dialog open={isFormOpen} onOpenChange={(open) => {
        if (!open) resetForm()
        setIsFormOpen(open)
      }}>
        <DialogContent className="max-w-md w-full rounded-[24px] bg-[#141414]/95 backdrop-blur-2xl border-white/[0.08] p-0 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <DialogHeader className="mb-6">
              <div className="w-11 h-11 rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center shadow-xl mb-4 mx-auto">
                <Shield className="w-5 h-5 text-[#FF3131]" />
              </div>
              <DialogTitle className="text-xl font-black text-white uppercase tracking-tighter text-center">
                {editingClub ? (
                  <>MODIFICAR <span className="text-[#FF3131]">CLUB</span></>
                ) : (
                  <>REGISTRAR <span className="text-[#FF3131]">CLUB</span></>
                )}
              </DialogTitle>
              <DialogDescription className="text-[7px] text-[#2D2D2D] font-black uppercase tracking-[0.3em] text-center mt-1.5">
                Protocolo de Base de Datos Central - PIFA
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black ml-1">Nombre de la Entidad</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="INGRESAR NOMBRE DEL CLUB..."
                  className="h-10.5 bg-[#0A0A0A] border-[#202020] rounded-xl text-white placeholder:text-[#2D2D2D] text-xs font-bold uppercase tracking-widest focus:border-[#FF3131]/30 transition-all px-4"
                />
              </div>

              <ImageUpload
                label="Recurso Gráfico (Escudo)"
                value={formData.shield_url}
                onChange={(url) => setFormData({ ...formData, shield_url: url })}
                onRemove={() => setFormData({ ...formData, shield_url: '' })}
                folder="logos"
              />

              <div className="space-y-1.5">
                <Label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black ml-1">Capital Operativo (USD)</Label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-400 font-black text-[10px]">$</div>
                  <Input
                    type="number"
                    value={formData.budget}
                    onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                    placeholder="0.00"
                    className="h-10.5 bg-[#0A0A0A] border-[#202020] rounded-xl text-white placeholder:text-[#2D2D2D] text-xs font-bold uppercase tracking-widest focus:border-[#FF3131]/30 transition-all pl-9 pr-4"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 p-6 bg-[#0A0A0A]/50 border-t border-white/[0.04]">
            <DialogClose asChild>
              <button className="flex-1 h-10 border border-[#202020] text-[#2D2D2D] hover:text-white rounded-xl font-black uppercase tracking-widest text-[8px] transition-all">
                Abortar
              </button>
            </DialogClose>
            <button 
              onClick={handleSave} 
              disabled={isSaving} 
              className="flex-1 h-10 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-xl font-black uppercase tracking-widest text-[8px] shadow-[0_0_15px_rgba(255,49,49,0.2)] transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar Datos'}
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
              ¿ELIMINAR <span className="text-red-500">ENTIDAD</span>?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-[7px] text-[#2D2D2D] font-black uppercase tracking-widest leading-relaxed mt-2 px-4">
              ESTÁS POR ELIMINAR A <span className="text-white font-black">{deletingClub?.name}</span>. ESTA ACCIÓN PURGARÁ TODOS LOS DATOS RELACIONADOS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel className="flex-1 h-10 bg-[#0A0A0A] border border-[#202020] text-[#2D2D2D] hover:text-white rounded-xl font-black uppercase tracking-widest text-[8px] transition-all m-0">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              className="flex-1 h-10 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black uppercase tracking-widest text-[8px] shadow-[0_0_15px_rgba(220,38,38,0.2)] transition-all m-0"
            >
              ELIMINAR
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
