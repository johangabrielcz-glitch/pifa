'use client'

import { useState, useRef, useEffect } from 'react'
import { Player, SquadRole } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { paySalary } from '@/lib/contract-engine'
import { updateReleaseClause, firePlayer } from '@/lib/market-engine'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { DollarSign, Tag, XCircle, CheckCircle2, User as UserIcon, Camera, Loader2, FileText, Heart, Star, ChevronRight, MessageCircle, ShieldCheck } from 'lucide-react'
import { PlayerChatDrawer } from './player-chat-drawer'

interface PlayerManagementDialogProps {
  player: Player | null
  isOpen: boolean
  onClose: () => void
  onUpdate?: () => void
  isPreseason?: boolean
  clubBudget?: number
}

export function PlayerManagementDialog({ player, isOpen, onClose, onUpdate, isPreseason = false, clubBudget = 0 }: PlayerManagementDialogProps) {
  const [loading, setLoading] = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [salePrice, setSalePrice] = useState<string>(player?.sale_price?.toString() || '')
  const [payingsalary, setPayingsalary] = useState(false)
  const [showContractSection, setShowContractSection] = useState(true)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [newReleaseClause, setNewReleaseClause] = useState<string>('')
  const [isBlindajeConfirmOpen, setIsBlindajeConfirmOpen] = useState(false)
  const [isFireConfirmOpen, setIsFireConfirmOpen] = useState(false)
  const [firing, setFiring] = useState(false)
  const [liveBudget, setLiveBudget] = useState<number>(clubBudget)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Cargar presupuesto real directo de la DB al abrir para evitar datos obsoletos
  useEffect(() => {
    async function fetchLiveBudget() {
      if (isOpen && player?.club_id) {
        const { data } = await supabase
          .from('clubs')
          .select('budget')
          .eq('id', player.club_id)
          .single()
        if (data) setLiveBudget(data.budget)
      }
    }
    fetchLiveBudget()
  }, [isOpen, player?.club_id])

  // Sincronizar estados cuando cambia el jugador o el diálogo se abre
  useEffect(() => {
    if (player && isOpen) {
      setSalePrice(player.sale_price?.toString() || '')
      setNewReleaseClause('')
    }
  }, [player?.id, isOpen])

  if (!player) return null

  const morale = player.morale ?? 75
  const moraleColor = morale > 70 ? '#00FF85' : morale > 55 ? '#FFB800' : morale > 30 ? '#FF8C00' : '#FF3333'
  const moraleLabel = morale > 70 ? 'Contento' : morale > 55 ? 'Neutral' : morale > 30 ? 'Descontento' : 'Furioso'
  const salary = player.salary ?? 25000
  const contractSeasons = player.contract_seasons_left ?? 0
  const salaryPaid = player.salary_paid_this_season ?? false
  const wantsToLeave = player.wants_to_leave ?? false
  const contractStatus = player.contract_status ?? 'active'

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
          // Comprimir al 80% calidad en WebP para mantener fondos transparentes (Alpha Channel)
          resolve(canvas.toDataURL('image/webp', 0.8))
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

  async function handlePaySalary() {
    if (!player) return
    setPayingsalary(true)
    try {
      const result = await paySalary(player.id, player.club_id)
      if (result.success) {
        toast.success(`Salario de $${salary.toLocaleString()} pagado a ${player.name}`)
        if (onUpdate) onUpdate()
        onClose()
      } else {
        toast.error(result.error || 'Error al pagar salario')
      }
    } catch (err: any) {
      toast.error('Error al pagar salario')
    } finally {
      setPayingsalary(false)
    }
  }

  async function toggleSaleStatus() {
    setLoading(true)
    try {
      const isCurrentlyOnSale = player?.is_on_sale
      
      if (!isCurrentlyOnSale && (!salePrice || isNaN(Number(salePrice)) || Number(salePrice) <= 0)) {
        toast.error('Ingresa un precio de venta válido')
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

  async function handleBlindaje() {
    if (!player || !newReleaseClause) return
    const increment = Number(newReleaseClause)
    
    if (isNaN(increment) || increment <= 0) {
      toast.error('Ingresa un monto de aumento válido')
      return
    }

    if (liveBudget < increment) {
      toast.error(`No tienes presupuesto suficiente. Necesitas $${(increment - liveBudget).toLocaleString()} extras.`)
      return
    }

    const finalAmount = (player.release_clause || 700000) + increment

    setLoading(true)
    try {
      await updateReleaseClause(player.id, player.club_id, finalAmount)
      toast.success('¡Jugador blindado con éxito!')
      setNewReleaseClause('')
      if (onUpdate) onUpdate()
      setIsBlindajeConfirmOpen(false)
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Error al blindar')
    } finally {
      setLoading(false)
    }
  }

  async function handleFirePlayer() {
    if (!player) return
    setFiring(true)
    try {
      const result = await firePlayer(player.id, player.club_id)
      if (result.success) {
        toast.success(`Contrato de ${player.name} rescindido. Ha sido liberado como agente libre.`)
        if (onUpdate) onUpdate()
        setIsFireConfirmOpen(false)
        onClose()
      } else {
        toast.error(result.error || 'Error al despedir jugador')
      }
    } catch (err: any) {
      toast.error('Error de red al despedir')
    } finally {
      setFiring(false)
    }
  }

  const roleButtons: { value: SquadRole; label: string; emoji: string; color: string }[] = [
    { value: 'essential', label: 'Esencial', emoji: '⭐', color: 'amber' },
    { value: 'important', label: 'Importante', emoji: '🔵', color: 'blue' },
    { value: 'rotation', label: 'Rotación', emoji: '🔄', color: 'zinc' },
  ]

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) setIsChatOpen(false)
        onClose()
      }}>
      <DialogContent className="bg-[#0A0A0A] border-white/[0.08] text-white rounded-[24px] sm:max-w-[380px] overflow-hidden p-0 gap-0 shadow-2xl fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-h-[90vh] overflow-y-auto">
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

              {/* Wants to leave badge */}
              {wantsToLeave && (
                <div className="mt-2 px-3 py-1 bg-red-500/10 border border-red-500/30 rounded-full">
                  <span className="text-[8px] font-black text-red-400 uppercase tracking-widest">🚪 En busca de equipo</span>
                </div>
              )}
            </div>
          </DialogHeader>

          {/* Separador */}
          <div className="w-full h-px bg-gradient-to-r from-transparent via-white/[0.05] to-transparent my-4"></div>

          <div className="space-y-4">
            {/* CONTRACT SECTION */}
            <div className="space-y-3">
              <button 
                onClick={() => setShowContractSection(!showContractSection)}
                className="flex items-center justify-between w-full"
              >
                <span className="text-[8px] font-black text-[#FF3131] uppercase tracking-[0.2em] flex items-center gap-2 ml-1">
                  <FileText className="w-3 h-3" />
                  Contrato
                </span>
                <ChevronRight className={`w-3 h-3 text-[#2D2D2D] transition-transform ${showContractSection ? 'rotate-90' : ''}`} />
              </button>

              {showContractSection && (
                <div className="space-y-3 animate-fade-in">
                  {/* Contract Info Row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-[#141414] rounded-xl p-2.5 border border-[#202020] text-center">
                      <span className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-wider block mb-1">Duración</span>
                      <span className={`text-sm font-black ${contractSeasons <= 1 ? 'text-red-400' : 'text-white'}`}>
                        {contractSeasons}T
                      </span>
                    </div>
                    <div className="bg-[#141414] rounded-xl p-2.5 border border-[#202020] text-center">
                      <span className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-wider block mb-1">Salario</span>
                      <span className="text-sm font-black text-[#00FF85]">
                        ${salary >= 1000 ? `${(salary / 1000).toFixed(0)}K` : salary}
                      </span>
                    </div>
                    <div className="bg-[#141414] rounded-xl p-2.5 border border-[#202020] text-center">
                      <span className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-wider block mb-1">Estado</span>
                      <span className={`text-[9px] font-black uppercase ${
                        contractStatus === 'active' ? 'text-emerald-400' : 
                        contractStatus === 'renewal_pending' ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {contractStatus === 'active' ? 'Activo' : contractStatus === 'renewal_pending' ? 'Renovar' : 'Libre'}
                      </span>
                    </div>
                  </div>

                  {/* Role Selector */}
                  <div className="space-y-1.5">
                    <span className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-[0.2em] ml-1">Rol en plantilla</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {roleButtons.map(role => (
                        <div
                          key={role.value}
                          className={`py-2 px-1 rounded-xl text-[8px] font-black uppercase tracking-wider transition-all border text-center ${
                            player.squad_role === role.value
                              ? role.value === 'essential' 
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                : role.value === 'important'
                                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                : 'bg-white/10 text-white/60 border-white/20'
                              : 'bg-[#141414] text-[#2D2D2D] border-[#202020]'
                          }`}
                        >
                          {role.emoji} {role.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Morale Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-[0.2em] flex items-center gap-1">
                        <Heart className="w-3 h-3" /> Moral
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black" style={{ color: moraleColor }}>{moraleLabel}</span>
                        <span className="text-[10px] font-black" style={{ color: moraleColor }}>{morale}%</span>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-[#141414] rounded-full overflow-hidden border border-[#202020]">
                      <div 
                        className="h-full rounded-full transition-all" 
                        style={{ width: `${morale}%`, backgroundColor: moraleColor }} 
                      />
                    </div>
                  </div>

                  {/* Pay Salary Button */}
                  {!salaryPaid && !wantsToLeave && contractStatus !== 'free_agent' && (
                    <button
                      onClick={handlePaySalary}
                      disabled={payingsalary || clubBudget < salary}
                      className="w-full py-2.5 rounded-xl bg-[#00FF85]/10 border border-[#00FF85]/20 text-[#00FF85] hover:bg-[#00FF85] hover:text-[#0A0A0A] text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {payingsalary ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <DollarSign className="w-3 h-3" />
                          Pagar Salario (${salary.toLocaleString()})
                        </>
                      )}
                    </button>
                  )}

                  {salaryPaid && (
                    <div className="text-center py-2 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
                      <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">✓ Salario pagado esta temporada</span>
                    </div>
                  )}

                  {clubBudget < salary && !salaryPaid && (
                    <p className="text-[7px] font-black text-red-400/70 uppercase tracking-widest text-center">
                      Presupuesto insuficiente — Necesitas ${salary.toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Separador */}
            <div className="w-full h-px bg-gradient-to-r from-transparent via-white/[0.05] to-transparent my-4"></div>

            {/* Stamina & Status Section */}
            <div className="space-y-3">
              {/* Stamina Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-[0.2em]">⚡ Energía</span>
                  <span className="text-[10px] font-black" style={{ color: (player.stamina ?? 100) > 60 ? '#00FF85' : (player.stamina ?? 100) > 30 ? '#FFB800' : '#FF3333' }}>
                    {player.stamina ?? 100}%
                  </span>
                </div>
                <div className="w-full h-2 bg-[#141414] rounded-full overflow-hidden border border-[#202020]">
                  <div 
                    className="h-full rounded-full transition-all" 
                    style={{ 
                      width: `${player.stamina ?? 100}%`, 
                      backgroundColor: (player.stamina ?? 100) > 60 ? '#00FF85' : (player.stamina ?? 100) > 30 ? '#FFB800' : '#FF3333' 
                    }} 
                  />
                </div>
              </div>

              {/* Injury Status */}
              {(player.injury_matches_left ?? 0) > 0 && (
                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">🏥</span>
                    <span className="text-[9px] font-black text-red-400 uppercase tracking-wider">Lesionado — {player.injury_matches_left} partido{(player.injury_matches_left ?? 0) > 1 ? 's' : ''}</span>
                  </div>
                  {player.injury_reason && (
                    <p className="text-[9px] text-red-400/70 font-bold italic ml-6">"{player.injury_reason}"</p>
                  )}
                </div>
              )}

              {/* Red Card Status */}
              {(player.red_card_matches_left ?? 0) > 0 && (
                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">🟥</span>
                    <span className="text-[9px] font-black text-red-400 uppercase tracking-wider">Suspendido — {player.red_card_matches_left} partido{(player.red_card_matches_left ?? 0) > 1 ? 's' : ''}</span>
                  </div>
                  {player.red_card_reason && (
                    <p className="text-[9px] text-red-400/70 font-bold italic ml-6">"{player.red_card_reason}"</p>
                  )}
                </div>
              )}
            </div>

            {/* Cláusula de Rescisión (Blindaje) - Destacado al inicio */}
            <div className="space-y-3 bg-[#00FF85]/5 border border-[#00FF85]/10 p-4 rounded-2xl relative overflow-hidden group mb-4">
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                <ShieldCheck className="w-8 h-8 text-[#00FF85]" />
              </div>
              <label className="text-[9px] font-black text-[#00FF85] uppercase tracking-[0.2em] flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                Aumentar Blindaje (Suma a la Cláusula)
              </label>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-[#6A6C6E] uppercase tracking-wider">Valor Actual:</span>
                <span className="text-[11px] font-black text-white">${(player.release_clause || 700000).toLocaleString()}</span>
              </div>
              <div className="space-y-3">
                <div className="relative group">
                  <Input
                    type="number"
                    placeholder="Monto a sumar... Ej: 300000"
                    className="bg-white/5 border-white/10 h-11 text-sm font-bold text-white rounded-xl focus:border-[#00FF85]/30 transition-all uppercase tracking-widest relative z-10 pl-4"
                    value={newReleaseClause}
                    onChange={(e) => setNewReleaseClause(e.target.value)}
                  />
                  {newReleaseClause && Number(newReleaseClause) > 0 && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-[#00FF85] z-20 pointer-events-none animate-in fade-in slide-in-from-right-2">
                       +${Number(newReleaseClause).toLocaleString()}
                    </div>
                  )}
                </div>

                {/* Botones de magnitud rápida */}
                <div className="grid grid-cols-3 gap-2">
                   <button 
                    onClick={() => setNewReleaseClause("100000")}
                    className="py-1.5 bg-white/5 border border-white/10 rounded-lg text-[8px] font-black text-[#6A6C6E] hover:text-[#00FF85] hover:border-[#00FF85]/30 transition-all uppercase"
                   >
                     +100K
                   </button>
                   <button 
                    onClick={() => setNewReleaseClause("500000")}
                    className="py-1.5 bg-white/5 border border-white/10 rounded-lg text-[8px] font-black text-[#6A6C6E] hover:text-[#00FF85] hover:border-[#00FF85]/30 transition-all uppercase"
                   >
                     +500K
                   </button>
                   <button 
                    onClick={() => setNewReleaseClause("1000000")}
                    className="py-1.5 bg-white/5 border border-white/10 rounded-lg text-[8px] font-black text-[#6A6C6E] hover:text-[#00FF85] hover:border-[#00FF85]/30 transition-all uppercase"
                   >
                     +1M
                   </button>
                </div>

                <Button 
                  onClick={() => setIsBlindajeConfirmOpen(true)}
                  disabled={!newReleaseClause || Number(newReleaseClause) <= 0 || Number(newReleaseClause) > liveBudget || loading}
                  className={`w-full h-11 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-[0_5px_20px_rgba(0,255,133,0.3)] border-b-4 ${
                    Number(newReleaseClause) > liveBudget 
                      ? 'bg-red-500/20 text-red-500 border-red-500/50 grayscale' 
                      : 'bg-[#00FF85] text-[#0A0A0A] border-[#00A355] hover:bg-[#00CC6A]'
                  }`}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 
                   Number(newReleaseClause) > liveBudget 
                    ? 'Presupuesto Insuficiente' 
                    : `Invertir $${Number(newReleaseClause).toLocaleString()}`}
                </Button>

                {newReleaseClause && Number(newReleaseClause) > 0 && (
                  <div className={`p-3 border rounded-xl transition-colors ${
                    Number(newReleaseClause) > liveBudget 
                      ? 'bg-red-500/10 border-red-500/30' 
                      : 'bg-[#00FF85]/10 border-[#00FF85]/20'
                  }`}>
                    <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest mb-1.5 border-b border-white/5 pb-1.5">
                      <span className="text-[#6A6C6E]">Nueva Cláusula Total:</span>
                      <span className="text-white font-bold">${((player.release_clause || 700000) + Number(newReleaseClause)).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-[7px] font-black uppercase tracking-widest mb-1">
                      <span className="text-[#6A6C6E]/60 text-[6px]">Presupuesto Real:</span>
                      <span className="text-white/60">${liveBudget.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-[7px] font-black uppercase tracking-widest">
                      <span className="text-[#6A6C6E]/60 text-[6px]">Tu Inversión:</span>
                      <span className={Number(newReleaseClause) > liveBudget ? 'text-red-500' : 'text-[#00FF85]'}>
                        -${Number(newReleaseClause).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
                
                {newReleaseClause && Number(newReleaseClause) > 0 && Number(newReleaseClause) < 10000 && (
                  <p className="text-[8px] text-[#FF3131] font-black uppercase text-center animate-bounce">
                    ¡Cuidado! Estás poniendo una cláusula de solo ${Number(newReleaseClause).toLocaleString()}. ¿Seguro?
                  </p>
                )}
              </div>
            </div>

            <div className="w-full h-px bg-gradient-to-r from-transparent via-white/[0.05] to-transparent"></div>

            {/* Sale Section (Opcional - Mercado Directo) */}
            {!wantsToLeave && contractStatus === 'active' && (
              <div className="space-y-2 pt-2">
                <label className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-[0.2em] flex items-center gap-2 ml-1">
                  <Tag className="w-3 h-3" />
                  Precio de Venta en Mercado (Opcional)
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <DollarSign className={`w-4 h-4 transition-colors duration-300 ${player.is_on_sale ? 'text-[#00FF85]' : 'text-[#2D2D2D]'}`} />
                  </div>
                  <Input
                    type="number"
                    placeholder="Ej. 150000"
                    disabled={player.is_on_sale}
                    className="bg-[#141414] border-[#202020] h-10.5 pl-10 text-xs font-bold text-white rounded-xl focus:border-[#00FF85]/30 transition-all uppercase tracking-widest disabled:opacity-50"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {!wantsToLeave && contractStatus === 'active' && (
          <div className="px-6 pb-6 space-y-3">
            <Button
              onClick={() => setIsChatOpen(true)}
              className="w-full h-11 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 text-[9px] font-black uppercase tracking-widest transition-all gap-2"
            >
              <MessageCircle className="w-4 h-4 text-[#00FF85]" />
              Hablar con Jugador
            </Button>

            <Button
              className={`w-full h-11 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-300 shadow-xl flex items-center gap-2 ${
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

            <Button
              variant="outline"
              onClick={() => setIsFireConfirmOpen(true)}
              className="w-full border-red-500/20 text-red-500/60 hover:bg-red-500 hover:text-white hover:border-red-500 text-[9px] font-black uppercase tracking-widest h-11 rounded-xl transition-all duration-300 flex items-center justify-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              Rescindir Contrato (${(salary * 2).toLocaleString()})
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>

    <PlayerChatDrawer 
        player={player}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        clubId={player.club_id}
      />

    <AlertDialog open={isBlindajeConfirmOpen} onOpenChange={setIsBlindajeConfirmOpen}>
      <AlertDialogContent className="bg-[#0A0A0A] border-white/10 text-white rounded-[24px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-black uppercase tracking-tighter">¿Confirmar Blindaje?</AlertDialogTitle>
          <AlertDialogDescription className="text-[#6A6C6E] text-xs font-bold uppercase tracking-wider">
            Se descontarán <span className="text-[#00FF85]">${Number(newReleaseClause).toLocaleString()} USD</span> de tu presupuesto para aumentar la cláusula de {player.name} a un total de <span className="text-white">${((player.release_clause || 700000) + Number(newReleaseClause)).toLocaleString()} USD</span>. Esta operación es irreversible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="bg-transparent border-white/10 text-white rounded-xl hover:bg-white/5 uppercase text-[10px] font-black">Cancelar</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleBlindaje}
            className="bg-[#00FF85] text-[#0A0A0A] rounded-xl hover:bg-[#00CC6A] uppercase text-[10px] font-black"
          >
            Confirmar Pago
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={isFireConfirmOpen} onOpenChange={setIsFireConfirmOpen}>
      <AlertDialogContent className="bg-[#0A0A0A] border-red-500/20 text-white rounded-[24px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-black uppercase tracking-tighter text-red-500">¿Despedir a {player.name}?</AlertDialogTitle>
          <AlertDialogDescription className="text-[#6A6C6E] text-xs font-bold uppercase tracking-wider">
            Rescindir el contrato unilateralmente te costará <span className="text-red-400">${(salary * 2).toLocaleString()} USD</span> (el doble de su salario anual). 
            <br/><br/>
            El jugador quedará como **Agente Libre** inmediatamente y podrá ser fichado por cualquier club. Esta acción es definitiva.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="bg-transparent border-white/10 text-white rounded-xl hover:bg-white/5 uppercase text-[10px] font-black">Cancelar</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleFirePlayer}
            disabled={firing || liveBudget < (salary * 2)}
            className="bg-red-500 text-white rounded-xl hover:bg-red-600 uppercase text-[10px] font-black"
          >
            {firing ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
            {liveBudget < (salary * 2) ? 'Presupuesto Insuficiente' : 'Confirmar Despido'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
