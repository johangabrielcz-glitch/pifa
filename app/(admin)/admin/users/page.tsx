'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, UserCog, Shield, Search, X, ChevronLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
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
    setFormData({ username: user.username, password: '', full_name: user.full_name, role: user.role, club_id: user.club_id ?? 'none', create_club: false, new_club_name: '' })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.username.trim() || !formData.full_name.trim()) { toast.error('Usuario y nombre completo son requeridos'); return }
    if (!editingUser && !formData.password.trim()) { toast.error('La contraseña es requerida para nuevos usuarios'); return }
    setIsSaving(true)
    try {
      let clubId = (formData.club_id && formData.club_id !== 'none') ? formData.club_id : null
      if (formData.create_club && formData.new_club_name.trim()) {
        const { data: newClub, error: clubError } = await supabase.from('clubs').insert({ name: formData.new_club_name.trim(), budget: 0 }).select().single()
        if (clubError) throw clubError
        clubId = newClub.id
      }
      if (editingUser) {
        const updateData: UserUpdate = { username: formData.username.trim(), full_name: formData.full_name.trim(), role: formData.role, club_id: clubId }
        if (formData.password.trim()) updateData.password = formData.password.trim()
        const { error } = await supabase.from('users').update(updateData).eq('id', editingUser.id)
        if (error) throw error
        toast.success('Usuario actualizado')
      } else {
        const insertData: UserInsert = { username: formData.username.trim(), password: formData.password.trim(), full_name: formData.full_name.trim(), role: formData.role, club_id: clubId }
        const { error } = await supabase.from('users').insert(insertData)
        if (error) { if (error.code === '23505') { toast.error('El nombre de usuario ya existe'); setIsSaving(false); return }; throw error }
        toast.success('Usuario creado')
      }
      setIsFormOpen(false); resetForm(); loadData()
    } catch (error) { toast.error('Error al guardar el usuario'); console.error(error) } finally { setIsSaving(false) }
  }

  const handleDelete = async () => {
    if (!deletingUser) return
    try {
      const { error } = await supabase.from('users').delete().eq('id', deletingUser.id)
      if (error) throw error
      toast.success('Usuario eliminado'); setIsDeleteOpen(false); setDeletingUser(null); loadData()
    } catch { toast.error('Error al eliminar el usuario') }
  }

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase())
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
              <h1 className="text-lg font-bold">Usuarios</h1>
              <p className="text-[10px] text-muted-foreground">{users.length} registrados</p>
            </div>
          </div>
          <Button size="sm" onClick={openCreateForm} className="bg-primary hover:bg-primary/90 rounded-xl gap-1.5 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" />
            Nuevo
          </Button>
        </div>
        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar usuarios..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-11 h-11 bg-card/60 border-white/[0.06] rounded-xl focus:bg-card focus:border-primary/30 transition-all" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"><X className="w-4 h-4" /></button>
            )}
          </div>
        </div>
      </header>

      {/* Users List */}
      <div className="px-5 py-4 space-y-2.5 pb-24">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-16 animate-fade-in-up">
            <div className="w-16 h-16 rounded-2xl bg-card/60 border border-white/[0.06] mx-auto mb-4 flex items-center justify-center">
              <UserCog className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-muted-foreground font-medium">{searchQuery ? 'No se encontraron usuarios' : 'No hay usuarios registrados'}</p>
          </div>
        ) : (
          filteredUsers.map((user, i) => (
            <div key={user.id} className="bg-card/60 backdrop-blur-sm rounded-2xl p-4 border border-white/[0.06] transition-all duration-300 hover:bg-card/80 animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${user.role === 'admin' ? 'bg-gradient-to-br from-pifa-red/20 to-red-600/10' : 'bg-gradient-to-br from-primary/20 to-orange-600/10'}`}>
                    {user.role === 'admin' ? (
                      <Shield className="w-5 h-5 text-pifa-red" />
                    ) : (
                      <UserCog className="w-5 h-5 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{user.full_name}</p>
                    <p className="text-xs text-muted-foreground">@{user.username}</p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openEditForm(user)} className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground rounded-xl"><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => { setDeletingUser(user); setIsDeleteOpen(true) }} className="h-9 w-9 p-0 text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-xl"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
              
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${
                  user.role === 'admin' 
                    ? 'bg-pifa-red/15 text-pifa-red ring-1 ring-pifa-red/20' 
                    : 'bg-primary/15 text-primary ring-1 ring-primary/20'
                }`}>
                  {user.role === 'admin' ? '⚙️ Admin' : '⚽ DT'}
                </span>
                {user.club && (
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.04] text-muted-foreground ring-1 ring-white/[0.06]">
                    🛡️ {user.club.name}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsFormOpen(open) }}>
        <DialogContent className="max-w-md mx-4 rounded-2xl bg-card/95 backdrop-blur-xl border-white/[0.08] max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">{editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</DialogTitle>
            <DialogDescription className="sr-only">{editingUser ? 'Formulario para editar los datos del usuario' : 'Formulario para crear un nuevo usuario'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Usuario</Label>
              <Input value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="nombre_usuario" className="h-12 bg-background/50 border-white/[0.08] rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Contraseña {editingUser && <span className="normal-case text-muted-foreground/60">(dejar vacío para no cambiar)</span>}
              </Label>
              <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder={editingUser ? '••••••••' : 'Contraseña'} className="h-12 bg-background/50 border-white/[0.08] rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Nombre Completo</Label>
              <Input value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} placeholder="Juan Pérez" className="h-12 bg-background/50 border-white/[0.08] rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Rol</Label>
              <Select value={formData.role} onValueChange={(value: 'user' | 'admin') => setFormData({ ...formData, role: value })}>
                <SelectTrigger className="h-12 bg-background/50 border-white/[0.08] rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card/95 backdrop-blur-xl border-white/[0.08]">
                  <SelectItem value="user">⚽ Director Técnico</SelectItem>
                  <SelectItem value="admin">⚙️ Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.role === 'user' && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Club Asignado</Label>
                  <Select value={formData.club_id || 'none'} onValueChange={(value) => setFormData({ ...formData, club_id: value, create_club: false })}>
                    <SelectTrigger className="h-12 bg-background/50 border-white/[0.08] rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card/95 backdrop-blur-xl border-white/[0.08]">
                      <SelectItem value="none">Sin club asignado</SelectItem>
                      {clubs.map((club) => (<SelectItem key={club.id} value={club.id}>{club.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <input type="checkbox" id="create_club" checked={formData.create_club} onChange={(e) => setFormData({ ...formData, create_club: e.target.checked, club_id: e.target.checked ? 'none' : formData.club_id })} className="w-5 h-5 rounded border-white/[0.08] bg-background/50 accent-primary" />
                  <Label htmlFor="create_club" className="text-sm font-normal cursor-pointer">Crear nuevo club</Label>
                </div>
                {formData.create_club && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Nombre del Nuevo Club</Label>
                    <Input value={formData.new_club_name} onChange={(e) => setFormData({ ...formData, new_club_name: e.target.value })} placeholder="Nombre del club" className="h-12 bg-background/50 border-white/[0.08] rounded-xl" />
                  </div>
                )}
              </>
            )}
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
            <AlertDialogTitle className="text-foreground">Eliminar Usuario</AlertDialogTitle>
            <AlertDialogDescription>¿Eliminar a <strong className="text-foreground">{deletingUser?.full_name}</strong>? Esta acción no se puede deshacer.</AlertDialogDescription>
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
