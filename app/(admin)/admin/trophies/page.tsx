'use client'

import { useEffect, useState } from 'react'
import { Award, Plus, Trash2, Loader2, Save, Shield, Minus, Trophy as TrophyIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ImageUpload } from '@/components/pifa/image-upload'
import { toast } from 'sonner'
import type { Trophy, Club, ClubTrophy } from '@/lib/types'

export default function AdminTrophiesPage() {
  const [trophies, setTrophies] = useState<Trophy[]>([])
  const [clubs, setClubs] = useState<Club[]>([])
  const [clubTrophies, setClubTrophies] = useState<Record<string, ClubTrophy[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
  // Form para nuevo trofeo
  const [newTrophy, setNewTrophy] = useState({ name: '', image_url: '' })

  const loadData = async () => {
    setIsLoading(true)
    const [trophiesRes, clubsRes, ctRes] = await Promise.all([
      supabase.from('trophies').select('*').order('name'),
      supabase.from('clubs').select('*').order('name'),
      supabase.from('club_trophies').select('*, trophies(*)')
    ])

    if (trophiesRes.data) setTrophies(trophiesRes.data)
    if (clubsRes.data) setClubs(clubsRes.data)
    
    if (ctRes.data) {
      const grouped = ctRes.data.reduce((acc: any, ct: any) => {
        if (!acc[ct.club_id]) acc[ct.club_id] = []
        acc[ct.club_id].push(ct)
        return acc
      }, {})
      setClubTrophies(grouped)
    }
    setIsLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const handleCreateTrophy = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTrophy.name || !newTrophy.image_url) {
      toast.error('Nombre e imagen son obligatorios')
      return
    }

    setIsSaving(true)
    const { error } = await supabase.from('trophies').insert(newTrophy)
    if (error) {
      toast.error('Error al crear trofeo')
    } else {
      toast.success('Trofeo creado')
      setNewTrophy({ name: '', image_url: '' })
      loadData()
    }
    setIsSaving(false)
  }

  const handleDeleteTrophy = async (id: string) => {
    if (!confirm('¿Eliminar trofeo? Esto lo quitará de todos los clubes.')) return
    const { error } = await supabase.from('trophies').delete().eq('id', id)
    if (error) toast.error('Error al eliminar')
    else loadData()
  }

  const handleUpdateQuantity = async (clubId: string, trophyId: string, delta: number) => {
    const existing = clubTrophies[clubId]?.find(ct => ct.trophy_id === trophyId)
    
    if (existing) {
      const newQty = existing.quantity + delta
      if (newQty <= 0) {
        await supabase.from('club_trophies').delete().eq('id', existing.id)
      } else {
        await supabase.from('club_trophies').update({ quantity: newQty }).eq('id', existing.id)
      }
    } else if (delta > 0) {
      await supabase.from('club_trophies').insert({ club_id: clubId, trophy_id: trophyId, quantity: 1 })
    }
    loadData()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto pb-32">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
          <Award className="w-6 h-6 text-amber-500" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">Gestión de Palmarés</h1>
          <p className="text-sm text-[#6A6C6E]">Crea trofeos históricos y asígnalos a los clubes</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Catálogo de Trofeos */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#141414] border border-[#202020] rounded-[2rem] p-6 shadow-xl">
            <h2 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
              <Plus className="w-4 h-4 text-amber-500" />
              Nuevo Tipo de Trofeo
            </h2>

            <form onSubmit={handleCreateTrophy} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-widest ml-1">Nombre del Trofeo</label>
                <input
                  type="text"
                  value={newTrophy.name}
                  onChange={e => setNewTrophy({ ...newTrophy, name: e.target.value })}
                  placeholder="Ej: Copa de la Liga"
                  className="w-full bg-[#0A0A0A] border border-[#202020] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <ImageUpload
                value={newTrophy.image_url}
                onChange={url => setNewTrophy({ ...newTrophy, image_url: url })}
                onRemove={() => setNewTrophy({ ...newTrophy, image_url: '' })}
                bucket="pifa-assets"
                folder="trophies"
                label="Imagen del Trofeo"
              />

              <button
                type="submit"
                disabled={isSaving}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-[#202020] text-black font-black uppercase tracking-widest text-xs py-4 rounded-xl shadow-lg mt-4 flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Crear Trofeo'}
              </button>
            </form>
          </div>

          <div className="space-y-3">
            <h3 className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-widest ml-1">Catálogo</h3>
            {trophies.map(t => (
              <div key={t.id} className="bg-[#141414] border border-[#202020] rounded-2xl p-3 flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-black border border-white/5">
                    {t.image_url && <img src={t.image_url} alt="" className="w-full h-full object-contain p-1" />}
                  </div>
                  <span className="text-sm font-bold text-white uppercase tracking-tight">{t.name}</span>
                </div>
                <button onClick={() => handleDeleteTrophy(t.id)} className="p-2 text-[#2D2D2D] hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Asignación a Clubes */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500" />
            Adjudicación por Club
          </h2>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clubs.map(club => (
                <div key={club.id} className="bg-[#141414] border border-[#202020] rounded-[2rem] p-5">
                  <div className="flex items-center gap-3 mb-4">
                    {club.shield_url ? (
                      <img src={club.shield_url} alt="" className="w-8 h-8 object-contain" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#202020] flex items-center justify-center">
                        <Shield className="w-4 h-4 text-[#2D2D2D]" />
                      </div>
                    )}
                    <h3 className="text-sm font-black text-white uppercase tracking-tight">{club.name}</h3>
                  </div>

                  <div className="space-y-2">
                    {trophies.map(trophy => {
                      const count = clubTrophies[club.id]?.find(ct => ct.trophy_id === trophy.id)?.quantity || 0
                      return (
                        <div key={trophy.id} className="flex items-center justify-between bg-black/40 rounded-xl p-2 px-3 border border-white/5">
                          <div className="flex items-center gap-2">
                            {trophy.image_url && <img src={trophy.image_url} alt="" className="w-5 h-5 object-contain" />}
                            <span className="text-[10px] font-bold text-[#6A6C6E] uppercase">{trophy.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => handleUpdateQuantity(club.id, trophy.id, -1)}
                              className="w-6 h-6 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-black text-white w-4 text-center">{count}</span>
                            <button 
                              onClick={() => handleUpdateQuantity(club.id, trophy.id, 1)}
                              className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
