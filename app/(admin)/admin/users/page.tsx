'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, UserCog, Shield, Search, X, ChevronLeft, Key, Fingerprint, Activity } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import type { User, Club, UserInsert, UserUpdate } from '@/lib/types'

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<(User & { club?: Club | null })[]>([])
  const [clubs, setClubs] = useState<Club[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [deletingUser, setDeletingUser] = useState<User | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'user' as 'user' | 'admin',
    club_id: 'none',
    create_club: false,
    new_club_name: '',
  })

  const loadData = async () => {
    setIsLoading(true)
    const [usersRes, clubsRes] = await Promise.all([
      supabase.from('users').select('*, club:clubs(*)').order('created_at', { ascending: false }),
      supabase.from('clubs').select('*').order('name'),
    ])
    if (usersRes.data) setUsers(usersRes.data.map(u => ({ ...u, club: u.club || null })))
    if (clubsRes.data) setClubs(clubsRes.data)
    setIsLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const resetForm = () => {
    setFormData({ username: '', password: '', full_name: '', role: 'user', club_id: 'none', create_club: false, new_club_name: '' })
    setEditingUser(null)
  }

  const openCreateForm = () => { resetForm(); setIsFormOpen(true) }

  const openEditForm = (user: User) => {
    setEditingUser(user)
    setFormData({ 
      username: user.username, 
      password: '', 
      full_name: user.full_name, 
      role: user.role, 
      club_id: user.club_id ?? 'none', 
      create_club: false, 
      new_club_name: '' 
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.username.trim() || !formData.full_name.trim()) { 
      toast.error('Identificador y nombre son obligatorios')
      return 
    }
    if (!editingUser && !formData.password.trim()) { 
      toast.error('Se requiere un token de acceso para nuevos registros')
      return 
    }

    setIsSaving(true)
    try {
      let clubId = (formData.club_id && formData.club_id !== 'none') ? formData.club_id : null
      
      if (formData.create_club && formData.new_club_name.trim()) {
        const { data: newClub, error: clubError } = await supabase
          .from('clubs')
          .insert({ name: formData.new_club_name.trim(), budget: 0 })
          .select()
          .single()
        if (clubError) throw clubError
        clubId = newClub.id
      }

      if (editingUser) {
        const updateData: UserUpdate = { 
          username: formData.username.trim(), 
          full_name: formData.full_name.trim(), 
          role: formData.role, 
          club_id: clubId 
        }
        if (formData.password.trim()) updateData.password = formData.password.trim()
        
        const { error } = await supabase.from('users').update(updateData).eq('id', editingUser.id)
        if (error) throw error
        toast.success('Perfil de acceso actualizado')
      } else {
        const insertData: UserInsert = { 
          username: formData.username.trim(), 
          password: formData.password.trim(), 
          full_name: formData.full_name.trim(), 
          role: formData.role, 
          club_id: clubId 
        }
        const { error } = await supabase.from('users').insert(insertData)
        if (error) { 
          if (error.code === '23505') { 
            toast.error('El identificador ya se encuentra en uso'); 
            setIsSaving(false); 
            return 
          }; 
          throw error 
        }
        toast.success('Nuevo perfil de acceso generado')
      }
      setIsFormOpen(false); resetForm(); loadData()
    } catch (error) { 
      toast.error('Error en la base de datos central')
      console.error(error) 
    } finally { 
      setIsSaving(false) 
    }
  }

  const handleDelete = async () => {
    if (!deletingUser) return
    try {
      const { error } = await supabase.from('users').delete().eq('id', deletingUser.id)
      if (error) throw error
      toast.success('Perfil purgado del sistema')
      setIsDeleteOpen(false); setDeletingUser(null); loadData()
    } catch { 
      toast.error('Fallo en la purga de datos') 
    }
  }

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
              <h1 className="text-xl font-black text-white uppercase tracking-tight">CONTROL DE <span className="text-[#FF3131]">ACCESOS</span></h1>
              <p className="text-[10px] text-[#6A6C6E] font-black uppercase tracking-[0.2em]">{users.length} IDENTIDADES EN RED</p>
            </div>
          </div>
          <button 
            onClick={openCreateForm} 
            className="h-11 px-5 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-xl flex items-center gap-2.5 font-black uppercase tracking-widest text-[10px] shadow-[0_0_20px_rgba(255,49,49,0.3)] transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Nueva Identidad
          </button>
        </div>
        
        {/* Search */}
        <div className="px-6 pb-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#2D2D2D] group-focus-within:text-[#FF3131] transition-colors" />
            <input
              placeholder="SISTEMA DE IDENTIFICACIÁO NOMINAL..."
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
        </div>
      </header>

      {/* Users List */}
      <div className="px-6 py-6 space-y-4 pb-32">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF3131]" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-20 bg-[#141414]/30 rounded-[32px] border border-dashed border-white/[0.06] animate-fade-in-up">
            <div className="w-20 h-20 rounded-3xl bg-[#0A0A0A] border border-[#202020] mx-auto mb-6 flex items-center justify-center">
              <Fingerprint className="w-10 h-10 text-[#2D2D2D]" />
            </div>
            <p className="text-[#6A6C6E] font-black uppercase tracking-[0.2em] text-xs px-10">
              NO HAY REGISTROS QUE COINCIDAN CON LOS PARÁMETROS
            </p>
          </div>
        ) : (
          filteredUsers.map((user, i) => (
            <div
              key={user.id}
              className="group relative bg-[#141414]/50 backdrop-blur-xl rounded-[28px] p-5 border border-white/[0.04] transition-all duration-300 hover:border-[#FF3131]/30 hover:bg-[#1A1A1A]/60 animate-fade-in-up shadow-xl overflow-hidden"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {/* Background gradient detail */}
              <div className={`absolute -right-10 -top-10 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity ${user.role === 'admin' ? 'bg-[#FF3131]' : 'bg-blue-500'}`} />

              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-5 min-w-0">
                  <div className="relative shrink-0">
                    <div className={`absolute inset-0 rounded-[18px] blur-lg opacity-0 group-hover:opacity-100 transition-opacity ${user.role === 'admin' ? 'bg-[#FF3131]/30' : 'bg-blue-500/20'}`} />
                    <div className={`relative w-14 h-14 rounded-[18px] flex items-center justify-center border border-[#202020] shadow-2xl transition-transform group-hover:scale-105 ${user.role === 'admin' ? 'bg-gradient-to-br from-[#FF3131] to-[#991B1B]' : 'bg-[#0A0A0A]'}`}>
                      {user.role === 'admin' ? (
                        <Shield className="w-7 h-7 text-white" />
                      ) : (
                        <UserCog className="w-7 h-7 text-[#FF3131]" />
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-black text-white uppercase tracking-tight truncate mb-1">{user.full_name}</h3>
                    <div className="flex items-center gap-2">
                       <p className="text-[10px] text-[#6A6C6E] font-bold uppercase tracking-widest truncate">@{user.username}</p>
                       <span className="w-1 h-1 rounded-full bg-[#2D2D2D]" />
                       <p className="text-[9px] text-[#FF3131]/60 font-black uppercase tracking-widest">ID: {user.id.slice(0, 8)}</p>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2 shrink-0 relative z-10">
                  <button
                    onClick={() => openEditForm(user)}
                    className="w-10 h-10 rounded-full bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white hover:border-[#FF3131]/40 transition-all active:scale-90"
                  >
                    <Pencil className="w-4.5 h-4.5" />
                  </button>
                  <button
                    onClick={() => {
                      setDeletingUser(user)
                      setIsDeleteOpen(true)
                    }}
                    className="w-10 h-10 rounded-full bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-red-500/60 hover:text-red-500 hover:border-red-500/40 hover:bg-red-500/10 transition-all active:scale-90"
                  >
                    <Trash2 className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>
              
              <div className="mt-5 flex items-center gap-3">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-black uppercase tracking-[0.15em] text-[9px] ${
                  user.role === 'admin' 
                    ? 'bg-[#FF3131]/10 text-[#FF3131] border-[#FF3131]/20' 
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                }`}>
                  <Fingerprint size={12} />
                  {user.role === 'admin' ? 'Infra-Root' : 'Terminal User'}
                </div>
                {user.club && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[#6A6C6E] font-black uppercase tracking-[0.1em] text-[8px]">
                    <Shield size={10} className="text-[#FF3131]" />
                    {user.club.name}
                  </div>
                )}
                <div className="ml-auto">
                   <Activity size={14} className="text-[#2D2D2D]" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modern Ruby Dialog - Create/Edit User */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsFormOpen(open) }}>
        <DialogContent className="max-w-md w-full rounded-[32px] bg-[#141414]/95 backdrop-blur-2xl border-white/[0.08] p-0 overflow-hidden shadow-2xl max-h-[85dvh] flex flex-col fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
            <DialogHeader className="mb-8">
              <div className="w-14 h-14 rounded-2xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center shadow-xl mb-6 mx-auto">
                <Key className="w-7 h-7 text-[#FF3131]" />
              </div>
              <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter text-center">
                {editingUser ? (
                  <>MODIFICAR <span className="text-[#FF3131]">PROFILE</span></>
                ) : (
                  <>INSTALAR <span className="text-[#FF3131]">PROFILE</span></>
                )}
              </DialogTitle>
              <DialogDescription className="text-center text-[9px] text-[#6A6C6E] font-black uppercase tracking-[0.3em] mt-2">
                Asignación de Privilegios y Credenciales
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              <div className="space-y-2.5">
                <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">Terminal ID (Usuario)</Label>
                <Input value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="USER_IDENTIFIER..." className="h-14 bg-[#0A0A0A] border-[#202020] rounded-[20px] text-white placeholder:text-[#2D2D2D] text-xs font-black uppercase tracking-widest focus:border-[#FF3131]/40 px-5" />
              </div>
              <div className="space-y-2.5">
                <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">Access Token (Password)</Label>
                <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="••••••••" className="h-14 bg-[#0A0A0A] border-[#202020] rounded-[20px] text-white placeholder:text-[#2D2D2D] text-xs font-black uppercase tracking-widest focus:border-[#FF3131]/40 px-5" />
              </div>
              <div className="space-y-2.5">
                <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">Identidad Nominal (Nombre Completo)</Label>
                <Input value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} placeholder="NOMBRE DEL OPERADOR..." className="h-14 bg-[#0A0A0A] border-[#202020] rounded-[20px] text-white placeholder:text-[#2D2D2D] text-xs font-black uppercase tracking-widest focus:border-[#FF3131]/40 px-5" />
              </div>
              
              <div className="space-y-2.5">
                <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">Jerarquía de Regulación (Rol)</Label>
                <Select value={formData.role} onValueChange={(value: 'user' | 'admin') => setFormData({ ...formData, role: value })}>
                  <SelectTrigger className="h-14 bg-[#0A0A0A] border-[#202020] rounded-[20px] text-white text-xs font-black uppercase tracking-widest focus:border-[#FF3131]/40 px-5"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#141414] border-white/[0.08] rounded-xl">
                    <SelectItem value="user" className="text-xs font-black uppercase tracking-widest text-white">⚽ Director Técnico</SelectItem>
                    <SelectItem value="admin" className="text-xs font-black uppercase tracking-widest text-[#FF3131]">⚙️ Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.role === 'user' && (
                <div className="space-y-6 pt-2 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="space-y-2.5">
                    <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">Asignación Operativa (Club)</Label>
                    <Select value={formData.club_id || 'none'} onValueChange={(value) => setFormData({ ...formData, club_id: value, create_club: false })}>
                      <SelectTrigger className="h-14 bg-[#0A0A0A] border-[#202020] rounded-[20px] text-white text-xs font-black uppercase tracking-widest focus:border-[#FF3131]/40 px-5"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#141414] border-white/[0.08] rounded-xl">
                        <SelectItem value="none" className="text-xs font-black uppercase tracking-widest text-white/40">Sin Asignación</SelectItem>
                        {clubs.map((club) => (<SelectItem key={club.id} value={club.id} className="text-xs font-black uppercase tracking-widest text-white">{club.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="relative overflow-hidden bg-[#0A0A0A] p-5 rounded-[20px] border border-white/[0.04] transition-all">
                    <div className="flex items-center gap-4 relative z-10">
                      <div className="relative flex items-center justify-center">
                        <input 
                          type="checkbox" 
                          id="create_club_admin" 
                          checked={formData.create_club} 
                          onChange={(e) => setFormData({ ...formData, create_club: e.target.checked, club_id: e.target.checked ? 'none' : formData.club_id })} 
                          className="w-6 h-6 rounded-lg border-[#202020] bg-black accent-[#FF3131] cursor-pointer appearance-none checked:bg-[#FF3131] border-2 transition-all" 
                        />
                        {formData.create_club && <Plus className="w-4 h-4 text-white absolute pointer-events-none" />}
                      </div>
                      <Label htmlFor="create_club_admin" className="text-[10px] font-black uppercase tracking-widest text-white cursor-pointer select-none">Generar Nueva Entidad Automáticamente</Label>
                    </div>
                  </div>

                  {formData.create_club && (
                    <div className="space-y-2.5 animate-in slide-in-from-top-2 duration-300">
                      <Label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">Nombre para Nueva Entidad</Label>
                      <Input value={formData.new_club_name} onChange={(e) => setFormData({ ...formData, new_club_name: e.target.value })} placeholder="INGRESAR NOMBRE..." className="h-14 bg-[#0A0A0A] border-[#202020] rounded-[20px] text-white placeholder:text-[#2D2D2D] text-xs font-black uppercase tracking-widest focus:border-[#FF3131]/40 px-5" />
                    </div>
                  )}
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

      {/* Modern Ruby AlertDialog - Delete User */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="max-w-sm w-full rounded-[32px] bg-[#141414] border-white/[0.08] p-8 shadow-2xl fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <AlertDialogHeader className="mb-6">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-8 h-8 text-red-500" />
            </div>
            <AlertDialogTitle className="text-xl font-black text-white uppercase tracking-tighter text-center">ELIMINAR <span className="text-red-500">TERMINAL</span></AlertDialogTitle>
            <AlertDialogDescription className="text-center text-xs text-[#6A6C6E] font-bold uppercase tracking-widest mt-2 px-4 leading-relaxed">
              ¿CONFIRMAS LA ELIMINACIÓN PERMANENTE DEL ACCESO DE <span className="text-white font-black">{deletingUser?.full_name}</span>?
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
