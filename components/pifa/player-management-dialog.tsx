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
      <DialogContent className="bg-[#0A0A0A] border-[#202020] text-white rounded-[32px] sm:max-w-[400px] overflow-hidden p-0 gap-0 shadow-2xl">
        <div className="p-8">
          <DialogHeader className="mb-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-[#141414] rounded-3xl flex items-center justify-center border border-[#202020] mb-4 shadow-inner">
                <UserIcon className="w-10 h-10 text-[#00FF85]" />
              </div>
              <DialogTitle className="text-xl font-black uppercase tracking-tighter text-white">Gestionar Jugador</DialogTitle>
              <DialogDescription className="text-[#6A6C6E] text-[10px] font-bold uppercase tracking-widest mt-1">
                {player.name} · {player.position}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-[0.2em] flex items-center gap-2">
                <Tag className="w-3.5 h-3.5" />
                Precio de Venta ($)
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <DollarSign className={`w-5 h-5 transition-colors duration-300 ${player.is_on_sale ? 'text-[#00FF85]' : 'text-[#2D2D2D]'}`} />
                </div>
                <Input
                  type="number"
                  placeholder="Ej: 1500000"
                  disabled={player.is_on_sale}
                  className="bg-[#141414] border-[#202020] border-2 h-16 pl-12 text-xl font-black text-white rounded-2xl focus:ring-[#00FF85]/20 focus:border-[#00FF85] transition-all"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                />
              </div>
              {player.is_on_sale && (
                <p className="text-[8px] font-bold text-[#6A6C6E] uppercase tracking-widest text-center mt-2 px-4">
                  Para cambiar el precio, primero debes retirar al jugador de la venta.
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="bg-[#141414]/50 border-t border-[#202020] p-6 sm:p-6 sm:justify-center">
          <Button
            className={`w-full h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 shadow-xl flex items-center gap-3 ${
              player.is_on_sale 
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20' 
                : 'bg-[#00FF85] text-[#0A0A0A] hover:bg-white'
            }`}
            onClick={toggleSaleStatus}
            disabled={loading}
          >
            {player.is_on_sale ? (
              <>
                <XCircle className="w-5 h-5" />
                Retirar de la Venta
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Poner en Venta
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
