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
              <h1 className="text-base font-black text-white uppercase tracking-tight">CONTROL DE <span className="text-[#FF3131]">ACCESOS</span></h1>
              <p className="text-[7px] text-[#2D2D2D] font-black uppercase tracking-[0.3em] font-black">{users.length} IDENTIDADES EN RED</p>
            </div>
          </div>
          <button 
            onClick={openCreateForm} 
            className="h-9 px-4 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-lg flex items-center gap-2 font-black uppercase tracking-widest text-[8px] shadow-[0_0_15px_rgba(255,49,49,0.2)] transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo Perfil
          </button>
        </div>
        
        {/* Search */}
        <div className="px-6 pb-3.5">
          <div className="relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2D2D2D] group-focus-within:text-[#FF3131] transition-colors" />
            <input
              placeholder="SISTEMA DE IDENTIFICACIÓN NOMINAL..."
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
              className="group relative bg-[#141414]/50 rounded-[20px] p-4 border border-white/[0.04] transition-all duration-300 hover:border-[#FF3131]/20 hover:bg-[#1A1A1A]/60 animate-fade-in-up"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              {/* Background gradient detail */}
              <div className={`absolute -right-10 -top-10 w-24 h-24 rounded-full blur-3xl opacity-0 group-hover:opacity-10 transition-opacity ${user.role === 'admin' ? 'bg-[#FF3131]' : 'bg-blue-500'}`} />

              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="relative shrink-0">
                    <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center border border-[#202020] shadow-2xl transition-transform group-hover:scale-105 ${user.role === 'admin' ? 'bg-gradient-to-br from-[#FF3131] to-[#991B1B]' : 'bg-[#0A0A0A]'}`}>
                      {user.role === 'admin' ? (
                        <Shield className="w-5 h-5 text-white" />
                      ) : (
                        <UserCog className="w-5 h-5 text-[#FF3131]" />
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-white uppercase tracking-tight truncate mb-0.5">{user.full_name}</h3>
                    <div className="flex items-center gap-1.5">
                       <p className="text-[8px] text-[#6A6C6E] font-bold uppercase tracking-widest truncate">@{user.username}</p>
                       <span className="w-1 h-1 rounded-full bg-[#202020]" />
                       <p className="text-[7px] text-[#FF3131]/60 font-black uppercase tracking-widest">{user.role === 'admin' ? 'Root' : 'User'}</p>
                      </div>
                   </div>
                  </div>
                
                  <div className="flex items-center gap-1 shrink-0 relative z-10">
                    <button
                      onClick={() => openEditForm(user)}
                      className="w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#2D2D2D] hover:text-white transition-all"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setDeletingUser(user)
                        setIsDeleteOpen(true)
                      }}
                      className="w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#2D2D2D] hover:text-red-500 hover:bg-red-500/5 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              
                <div className="mt-4 flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border font-black uppercase tracking-widest text-[7px] ${
                  user.role === 'admin' 
                    ? 'bg-[#FF3131]/5 text-[#FF3131] border-[#FF3131]/10' 
                    : 'bg-blue-500/5 text-blue-400 border-blue-500/10'
                }`}>
                  <Fingerprint size={10} />
                  {user.role === 'admin' ? 'FEDERAL ROOT' : 'TERMINAL ACCESS'}
                </div>
                {user.club && (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.02] border border-white/[0.04] text-[#424242] font-black uppercase tracking-widest text-[7px]">
                    <Shield size={9} className="text-[#FF3131]" />
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
        <DialogContent className="max-w-md w-full rounded-[24px] bg-[#141414]/95 backdrop-blur-2xl border-white/[0.08] p-0 overflow-hidden shadow-2xl max-h-[85dvh] flex flex-col fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
            <DialogHeader className="mb-6">
              <div className="w-11 h-11 rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center shadow-xl mb-4 mx-auto">
                <Key className="w-5 h-5 text-[#FF3131]" />
              </div>
              <DialogTitle className="text-xl font-black text-white uppercase tracking-tighter text-center">
                {editingUser ? (
                  <>MODIFICAR <span className="text-[#FF3131]">PROFILE</span></>
                ) : (
                  <>INSTALAR <span className="text-[#FF3131]">PROFILE</span></>
                )}
              </DialogTitle>
              <DialogDescription className="text-center text-[7px] text-[#2D2D2D] font-black uppercase tracking-[0.3em] mt-1.5">
                Protocolo de Privilegios y Credenciales
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black ml-1">Terminal ID (Usuario)</Label>
                <Input value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="USER_IDENTIFIER..." className="h-10 bg-[#0A0A0A] border-[#202020] rounded-xl text-white placeholder:text-[#2D2D2D] text-xs font-bold uppercase tracking-widest focus:border-[#FF3131]/30 px-4" />
              </div>
              <div className="space-y-2">
                <Label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black ml-1">Access Token (Password)</Label>
                <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="••••••••" className="h-10 bg-[#0A0A0A] border-[#202020] rounded-xl text-white placeholder:text-[#2D2D2D] text-xs font-bold uppercase tracking-widest focus:border-[#FF3131]/30 px-4" />
              </div>
              <div className="space-y-2">
                <Label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black ml-1">Identidad Nominal (Nombre Completo)</Label>
                <Input value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} placeholder="NOMBRE DEL OPERADOR..." className="h-10 bg-[#0A0A0A] border-[#202020] rounded-xl text-white placeholder:text-[#2D2D2D] text-xs font-bold uppercase tracking-widest focus:border-[#FF3131]/30 px-4" />
              </div>
              
              <div className="space-y-2">
                <Label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black ml-1">Jerarquía de Regulación (Rol)</Label>
                <Select value={formData.role} onValueChange={(value: 'user' | 'admin') => setFormData({ ...formData, role: value })}>
                  <SelectTrigger className="h-10 bg-[#0A0A0A] border-[#202020] rounded-xl text-white text-xs font-bold uppercase tracking-widest focus:border-[#FF3131]/30 px-4"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#141414] border-white/[0.08] rounded-xl">
                    <SelectItem value="user" className="text-xs font-bold uppercase tracking-widest text-white">⚽ Director Técnico</SelectItem>
                    <SelectItem value="admin" className="text-xs font-bold uppercase tracking-widest text-[#FF3131]">⚙️ Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.role === 'user' && (
                <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-500">
                  <div className="space-y-2">
                    <Label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black ml-1">Asignación Operativa (Club)</Label>
                    <Select value={formData.club_id || 'none'} onValueChange={(value) => setFormData({ ...formData, club_id: value, create_club: false })}>
                      <SelectTrigger className="h-10 bg-[#0A0A0A] border-[#202020] rounded-xl text-white text-xs font-bold uppercase tracking-widest focus:border-[#FF3131]/30 px-4"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#141414] border-white/[0.08] rounded-xl">
                        <SelectItem value="none" className="text-xs font-bold uppercase tracking-widest text-white/40">Sin Asignación</SelectItem>
                        {clubs.map((club) => (<SelectItem key={club.id} value={club.id} className="text-xs font-bold uppercase tracking-widest text-white">{club.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="relative overflow-hidden bg-[#0A0A0A] p-4 rounded-xl border border-white/[0.04]">
                    <div className="flex items-center gap-3 relative z-10">
                      <div className="relative flex items-center justify-center">
                        <input 
                          type="checkbox" 
                          id="create_club_admin" 
                          checked={formData.create_club} 
                          onChange={(e) => setFormData({ ...formData, create_club: e.target.checked, club_id: e.target.checked ? 'none' : formData.club_id })} 
                          className="w-4 h-4 rounded border-[#202020] bg-black accent-[#FF3131] cursor-pointer" 
                        />
                      </div>
                      <Label htmlFor="create_club_admin" className="text-[8px] font-black uppercase tracking-widest text-white cursor-pointer select-none">Generar Nueva Entidad Automáticamente</Label>
                    </div>
                  </div>

                  {formData.create_club && (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                      <Label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black ml-1">Nombre para Nueva Entidad</Label>
                      <Input value={formData.new_club_name} onChange={(e) => setFormData({ ...formData, new_club_name: e.target.value })} placeholder="INGRESAR NOMBRE..." className="h-10 bg-[#0A0A0A] border-[#202020] rounded-xl text-white placeholder:text-[#2D2D2D] text-xs font-bold uppercase tracking-widest focus:border-[#FF3131]/30 px-4" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3 p-6 bg-[#0A0A0A]/50 border-t border-white/[0.04]">
            <DialogClose asChild><button className="flex-1 h-10 border border-[#202020] text-[#2D2D2D] hover:text-white rounded-xl font-black uppercase tracking-widest text-[8px] transition-all">Abortar</button></DialogClose>
            <button onClick={handleSave} disabled={isSaving} className="flex-1 h-10 bg-[#FF3131] hover:bg-[#D32F2F] text-white rounded-xl font-black uppercase tracking-widest text-[8px] shadow-[0_0_15px_rgba(255,49,49,0.2)] transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sincronizar Protocolo'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modern Ruby AlertDialog - Delete User */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="max-w-xs w-full rounded-[24px] bg-[#141414] border-white/[0.08] p-6 shadow-2xl fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <AlertDialogHeader className="mb-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <AlertDialogTitle className="text-lg font-black text-white uppercase tracking-tighter text-center">ELIMINAR <span className="text-red-500">TERMINAL</span></AlertDialogTitle>
            <AlertDialogDescription className="text-center text-[7px] text-[#2D2D2D] font-black uppercase tracking-widest mt-2 px-4 leading-relaxed">
              ¿CONFIRMAS LA ELIMINACIÓN PERMANENTE DEL ACCESO DE <span className="text-white font-black">{deletingUser?.full_name}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2">
            <AlertDialogCancel className="flex-1 h-10 bg-[#0A0A0A] border border-[#202020] text-[#2D2D2D] hover:text-white rounded-xl font-black uppercase tracking-widest text-[8px] m-0 transition-all">No</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="flex-1 h-10 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black uppercase tracking-widest text-[8px] shadow-[0_0_15px_rgba(220,38,38,0.2)] m-0 transition-all">Confirmar</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
