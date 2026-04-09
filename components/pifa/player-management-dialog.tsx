'use client'

import { useState } from 'react'
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
import { DollarSign, Tag, XCircle, CheckCircle2, User as UserIcon } from 'lucide-react'

interface PlayerManagementDialogProps {
  player: Player | null
  isOpen: boolean
  onClose: () => void
  onUpdate?: () => void
}

export function PlayerManagementDialog({ player, isOpen, onClose, onUpdate }: PlayerManagementDialogProps) {
  const [loading, setLoading] = useState(false)
  const [salePrice, setSalePrice] = useState<string>(player?.sale_price?.toString() || '')

  if (!player) return null

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
        <div className="p-6">
          <DialogHeader className="mb-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-[#141414] rounded-2xl flex items-center justify-center border border-[#202020] mb-4 shadow-xl">
                <UserIcon className="w-7 h-7 text-[#FF3131]" />
              </div>
              <DialogTitle className="text-base font-black uppercase tracking-tighter text-white">Gestionar Jugador</DialogTitle>
              <DialogDescription className="text-[#2D2D2D] text-[7px] font-black uppercase tracking-[0.3em] mt-1.5">
                {player.name} · {player.position}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-[0.2em] flex items-center gap-2 ml-1">
                <Tag className="w-3.5 h-3.5" />
                Precio de Venta (USD)
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <DollarSign className={`w-4 h-4 transition-colors duration-300 ${player.is_on_sale ? 'text-amber-400' : 'text-[#2D2D2D]'}`} />
                </div>
                <Input
                  type="number"
                  placeholder="0.00"
                  disabled={player.is_on_sale}
                  className="bg-[#141414] border-[#202020] h-10.5 pl-10 text-xs font-bold text-white rounded-xl focus:border-[#FF3131]/30 transition-all uppercase tracking-widest"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                />
              </div>
              {player.is_on_sale && (
                <p className="text-[7px] font-black text-[#2D2D2D] uppercase tracking-widest text-center mt-2 px-4">
                  IDENTIDAD BLOQUEADA: RETIRAR DE VENTA PARA MODIFICAR VALOR
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
