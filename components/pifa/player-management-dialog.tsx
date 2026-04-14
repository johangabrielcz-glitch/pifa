'use client'

import { useState, useRef } from 'react'
import { Player } from '@/lib/types'
import { supabase } from '@/lib/supabase'
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
import { toast } from 'sonner'
import { DollarSign, Tag, XCircle, CheckCircle2, User as UserIcon, Camera, Loader2 } from 'lucide-react'

interface PlayerManagementDialogProps {
  player: Player | null
  isOpen: boolean
  onClose: () => void
  onUpdate?: () => void
}

export function PlayerManagementDialog({ player, isOpen, onClose, onUpdate }: PlayerManagementDialogProps) {
  const [loading, setLoading] = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [salePrice, setSalePrice] = useState<string>(player?.sale_price?.toString() || '')
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!player) return null

  // Redimensionador Canvas super ligero (250px max)
  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new window.Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height
          const MAX_SIZE = 250 // Resolucion ultraligera
          
          if (width > height && width > MAX_SIZE) {
            height *= MAX_SIZE / width
            width = MAX_SIZE
          } else if (height > MAX_SIZE) {
            width *= MAX_SIZE / height
            height = MAX_SIZE
          }
          
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx?.drawImage(img, 0, 0, width, height)
          // Comprimir al 70% calidad
          resolve(canvas.toDataURL('image/jpeg', 0.7))
        }
        img.src = e.target?.result as string
      }
      reader.onerror = error => reject(error)
      reader.readAsDataURL(file)
    })
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor sube una imagen')
      return
    }

    setPhotoLoading(true)
    try {
      const base64Photo = await resizeImage(file)
      
      const { error } = await supabase
        .from('players')
        .update({ photo_url: base64Photo })
        .eq('id', player!.id)

      if (error) throw error

      toast.success('Foto actualizada con éxito')
      if (onUpdate) onUpdate()
    } catch (err: any) {
      toast.error('Error al actualizar foto')
    } finally {
      setPhotoLoading(false)
    }
  }

  async function toggleSaleStatus() {
    setLoading(true)
    try {
      const isCurrentlyOnSale = player?.is_on_sale
      
      if (!isCurrentlyOnSale && (!salePrice || isNaN(Number(salePrice)) || Number(salePrice) <= 0)) {
        toast.error('Ingresa un precio de venta vAAlido')
        setLoading(false)
        return
      }

      const { error } = await supabase
        .from('players')
        .update({
          is_on_sale: !isCurrentlyOnSale,
          sale_price: !isCurrentlyOnSale ? Number(salePrice) : null
        })
        .eq('id', player.id)

      if (error) throw error

      toast.success(isCurrentlyOnSale ? 'Jugador retirado de la venta' : 'Jugador puesto en venta')
      if (onUpdate) onUpdate()
      onClose()
    } catch (err: any) {
      toast.error('Error al actualizar estado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#0A0A0A] border-white/[0.08] text-white rounded-[24px] sm:max-w-[380px] overflow-hidden p-0 gap-0 shadow-2xl fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="p-6 pb-2">
          <DialogHeader className="mb-4">
            <div className="flex flex-col items-center text-center">
              {/* Avatar Subida */}
              <div className="relative group cursor-pointer mb-4" onClick={() => fileInputRef.current?.click()}>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden" 
                  accept="image/*"
                  onChange={handlePhotoUpload}
                />
                <div className="w-20 h-20 bg-[#141414] rounded-2xl flex items-center justify-center border border-[#202020] shadow-xl overflow-hidden relative">
                  {photoLoading ? (
                    <Loader2 className="w-6 h-6 text-[#FF3131] animate-spin" />
                  ) : player.photo_url ? (
                    <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-8 h-8 text-[#FF3131]/60" />
                  )}
                  {/* Overlay Hover */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="absolute -bottom-2 bg-[#FF3131] text-white text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-black shadow-lg left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all">
                  Subir Foto
                </div>
              </div>

              <DialogTitle className="text-base font-black uppercase tracking-tighter text-white">{player.name}</DialogTitle>
              <DialogDescription className="text-[#2D2D2D] text-[8px] font-black uppercase tracking-[0.3em] mt-1">
                {player.position} · DORSAL {player.number || '?'}
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* Separador */}
          <div className="w-full h-px bg-gradient-to-r from-transparent via-white/[0.05] to-transparent my-4"></div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[8px] font-black text-[#FF3131] uppercase tracking-[0.2em] flex items-center gap-2 ml-1">
                <Tag className="w-3 h-3" />
                Valor de Cláusula (USD)
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <DollarSign className={`w-4 h-4 transition-colors duration-300 ${player.is_on_sale ? 'text-[#FF3131]' : 'text-[#2D2D2D]'}`} />
                </div>
                <Input
                  type="number"
                  placeholder="Ej. 150000"
                  disabled={player.is_on_sale}
                  className="bg-[#141414] border-[#202020] h-10.5 pl-10 text-xs font-bold text-white rounded-xl focus:border-[#FF3131]/30 transition-all uppercase tracking-widest disabled:opacity-50"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                />
              </div>
              {player.is_on_sale && (
                <p className="text-[7px] font-black text-[#2D2D2D] uppercase tracking-widest text-center mt-2 px-4">
                  IDENTIDAD EN EL MERCADO: RETIRAR PARA NEGOCIAR
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="bg-[#0A0A0A]/50 border-t border-white/[0.04] p-5 sm:p-5 sm:justify-center">
          <Button
            className={`w-full h-10 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all duration-300 shadow-xl flex items-center gap-2 ${
              player.is_on_sale 
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20' 
                : 'bg-[#FF3131] text-white hover:bg-[#D32F2F] shadow-[0_0_15px_rgba(255,49,49,0.2)]'
            }`}
            onClick={toggleSaleStatus}
            disabled={loading}
          >
            {player.is_on_sale ? (
              <>
                <XCircle className="w-4 h-4" />
                Retirar de la Venta
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Poner en Venta
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
