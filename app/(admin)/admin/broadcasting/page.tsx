'use client'

import { useEffect, useState } from 'react'
import { Megaphone, Send, Image as ImageIcon, Loader2, Trash2, Clock, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sendPushToAll } from '@/lib/push-notifications'
import { toast } from 'sonner'
import { ImageUpload } from '@/components/pifa/image-upload'
import type { Diffusion } from '@/lib/types'

export default function BroadcastingPage() {
  const [diffusions, setDiffusions] = useState<Diffusion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [formData, setFormData] = useState({ title: '', content: '', image_url: '' })

  const loadDiffusions = async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('diffusions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (!error && data) setDiffusions(data)
    setIsLoading(false)
  }

  useEffect(() => { loadDiffusions() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error('Título y contenido son obligatorios')
      return
    }

    setIsSending(true)
    try {
      // 1. Save to DB
      const { data, error } = await supabase
        .from('diffusions')
        .insert({
          title: formData.title.trim(),
          content: formData.content.trim(),
          image_url: formData.image_url.trim() || null,
        })
        .select()
        .single()

      if (error) throw error

      // 2. Send Push Notification
      const pushResult = await sendPushToAll(
        `📢 ${formData.title.trim()}`,
        formData.content.trim().substring(0, 100) + (formData.content.length > 100 ? '...' : ''),
        { type: 'diffusion', diffusion_id: (data as Diffusion).id }
      )

      if (pushResult.success) {
        toast.success(`Difusión enviada a ${pushResult.sentCount} dispositivos`)
      } else {
        toast.warning('Difusión guardada pero hubo errores con las notificaciones push')
      }

      setFormData({ title: '', content: '', image_url: '' })
      loadDiffusions()
    } catch (err: any) {
      toast.error('Error al procesar la difusión: ' + err.message)
    } finally {
      setIsSending(false)
    }
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('diffusions').delete().eq('id', id)
    if (error) {
      toast.error('Error al eliminar')
    } else {
      toast.success('Comunicado eliminado')
      loadDiffusions()
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto pb-32">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-[#FF3131]/10 flex items-center justify-center border border-[#FF3131]/20">
          <Megaphone className="w-6 h-6 text-[#FF3131]" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">Centro de Difusión</h1>
          <p className="text-sm text-[#6A6C6E]">Envía comunicados oficiales y notificaciones push a todos los DTs</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Formulario */}
        <div className="space-y-6">
          <div className="bg-[#141414] border border-[#202020] rounded-[2rem] p-6 shadow-xl">
            <h2 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
              <Send className="w-4 h-4 text-[#00FF85]" />
              Nuevo Comunicado
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-widest ml-1">Título del Comunicado</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ej: Inicio de Mercado de Fichajes"
                  className="w-full bg-[#0A0A0A] border border-[#202020] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FF3131] transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-widest ml-1">Contenido</label>
                <textarea
                  value={formData.content}
                  onChange={e => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Escribe aquí el mensaje oficial..."
                  rows={5}
                  className="w-full bg-[#0A0A0A] border border-[#202020] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FF3131] transition-colors resize-none"
                />
              </div>

              <ImageUpload
                value={formData.image_url}
                onChange={(url) => setFormData({ ...formData, image_url: url })}
                onRemove={() => setFormData({ ...formData, image_url: '' })}
                bucket="pifa-assets"
                folder="diffusions"
                label="Imagen del Comunicado (Opcional)"
              />

              <button
                type="submit"
                disabled={isSending}
                className="w-full bg-[#FF3131] hover:bg-[#D72828] disabled:bg-[#202020] text-white font-black uppercase tracking-widest text-xs py-4 rounded-xl shadow-lg mt-4 flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                {isSending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Megaphone className="w-4 h-4" />
                    Publicar y Notificar
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Historial Reciente */}
        <div className="space-y-6">
          <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#6A6C6E]" />
            Últimos Envios
          </h2>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-[#FF3131] animate-spin" />
            </div>
          ) : diffusions.length === 0 ? (
            <div className="bg-[#141414] border border-dashed border-[#202020] rounded-[2rem] p-12 text-center">
              <p className="text-sm text-[#6A6C6E]">No hay difusiones enviadas recientemente</p>
            </div>
          ) : (
            <div className="space-y-4">
              {diffusions.map((diffusion) => (
                <div key={diffusion.id} className="bg-[#141414] border border-[#202020] rounded-2xl p-4 group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="w-3 h-3 text-[#00FF85]" />
                        <span className="text-[10px] text-[#6A6C6E] uppercase font-bold tracking-wider">
                          {new Date(diffusion.created_at).toLocaleString()}
                        </span>
                      </div>
                      <h3 className="text-sm font-black text-white uppercase tracking-tight mb-2">{diffusion.title}</h3>
                      <p className="text-xs text-[#A0A2A4] line-clamp-2 mb-3 leading-relaxed">{diffusion.content}</p>
                      
                      {diffusion.image_url && (
                        <div className="w-full aspect-video rounded-xl overflow-hidden bg-[#0A0A0A] border border-[#202020] mb-3">
                          <img src={diffusion.image_url} alt="" className="w-full h-full object-cover opacity-60" />
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => { if(confirm('¿Seguro?')) handleDelete(diffusion.id) }}
                      className="p-2 text-[#6A6C6E] hover:text-[#FF3131] transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
