'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Club } from '@/lib/types'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { ImageUpload } from '@/components/pifa/image-upload'
import { PenLine, Send, X, Loader2 } from 'lucide-react'

interface CreateNewsDialogProps {
  club: Club
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function CreateNewsDialog({ club, isOpen, onClose, onSuccess }: CreateNewsDialogProps) {
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('match')
  const [imageUrl, setImageUrl] = useState('')

  const handleSubmit = async () => {
    if (!title || !content) {
      toast.error('Título y contenido son obligatorios')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase
        .from('news')
        .insert({
          club_id: club.id,
          title: title.toUpperCase(),
          content,
          category,
          image_url: imageUrl || null,
          emoji: '📰' // Valor por defecto para noticias manuales
        })

      if (error) throw error

      toast.success('Noticia publicada correctamente')
      setTitle('')
      setContent('')
      setImageUrl('')
      onSuccess()
      onClose()
    } catch (err: any) {
      console.error('Error saving news:', err)
      toast.error('Error al publicar la noticia')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#0A0A0A] border-white/[0.08] text-white rounded-[24px] sm:rounded-[40px] w-[95vw] sm:max-w-[480px] max-h-[95vh] overflow-y-auto overflow-x-hidden p-0 gap-0 shadow-2xl custom-scrollbar">
        <div className="p-6 space-y-6">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-[#00FF85]/10 rounded-xl border border-[#00FF85]/20">
                <PenLine className="w-5 h-5 text-[#00FF85]" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black uppercase italic tracking-tighter text-white">Redactar Noticia</DialogTitle>
                <DialogDescription className="text-[#6A6C6E] text-[8px] font-black uppercase tracking-[0.2em] mt-0.5">
                  Publicación Manual para {club.name}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            {/* Image Upload Row */}
            <ImageUpload 
              value={imageUrl}
              onChange={setImageUrl}
              onRemove={() => setImageUrl('')}
              bucket="pifa-assets"
              folder="news"
              label="Imagen de Portada (Cuadrada)"
              className="mt-2"
            />

            <div className="space-y-2">
              <label className="text-[9px] font-black text-[#6A6C6E] uppercase tracking-[0.2em] ml-1">Titular</label>
              <Input 
                placeholder="ESCRIBE UN TITULAR IMPACTANTE..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-[#141414] border-[#202020] h-11 text-xs font-bold text-white rounded-xl focus:border-[#00FF85]/30 transition-all uppercase tracking-widest"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-black text-[#6A6C6E] uppercase tracking-[0.2em] ml-1">Contenido</label>
              <Textarea 
                placeholder="Cuenta los detalles de la noticia..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="bg-[#141414] border-[#202020] min-h-[100px] text-xs font-medium text-white rounded-xl focus:border-[#00FF85]/30 transition-all resize-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {['match', 'gossip', 'market'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`py-2 px-1 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all ${
                    category === cat 
                      ? 'bg-[#141414] border-[#00FF85] text-[#00FF85] shadow-[0_0_15px_rgba(0,255,133,0.1)]' 
                      : 'bg-[#0F0F0F] border-white/5 text-[#6A6C6E]'
                  }`}
                >
                  {cat === 'match' ? 'Crónica' : cat === 'gossip' ? 'Chisme' : 'Mercado'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="bg-[#0A0A0A]/50 border-t border-white/[0.04] p-5 sm:justify-between flex-row items-center gap-4">
          <Button
            variant="ghost"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl text-[9px] font-black uppercase tracking-widest text-[#6A6C6E] hover:bg-white/5 transition-all"
          >
            Cancelar
          </Button>
          <Button
            disabled={loading}
            onClick={handleSubmit}
            className="flex-[2] h-11 rounded-xl bg-[#00FF85] text-[#0A0A0A] text-[9px] font-black uppercase tracking-widest hover:bg-[#00E577] shadow-[0_10px_20px_rgba(0,255,133,0.2)] flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? 'Publicando...' : 'Publicar Ahora'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
