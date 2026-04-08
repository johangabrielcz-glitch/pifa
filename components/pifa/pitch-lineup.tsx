'use client'

import React, { useState, useEffect } from 'react'
import { Save, Plus, Loader2, X, RefreshCcw, Check, Shield } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { Player } from '@/lib/types'

interface FormationSlot {
  id: string
  top: string
  left: string
  role: string
}

const FORMATIONS: Record<string, FormationSlot[]> = {
  '4-3-3': [
    { id: 'pos_0', top: '85%', left: '50%', role: 'GK' },
    { id: 'pos_1', top: '68%', left: '15%', role: 'LB' },
    { id: 'pos_2', top: '75%', left: '35%', role: 'CB' },
    { id: 'pos_3', top: '75%', left: '65%', role: 'CB' },
    { id: 'pos_4', top: '68%', left: '85%', role: 'RB' },
    { id: 'pos_5', top: '48%', left: '25%', role: 'CM' },
    { id: 'pos_6', top: '55%', left: '50%', role: 'CDM' },
    { id: 'pos_7', top: '48%', left: '75%', role: 'CM' },
    { id: 'pos_8', top: '22%', left: '25%', role: 'LW' },
    { id: 'pos_9', top: '15%', left: '50%', role: 'ST' },
    { id: 'pos_10', top: '22%', left: '75%', role: 'RW' },
  ],
  '4-4-2': [
    { id: 'pos_0', top: '85%', left: '50%', role: 'GK' },
    { id: 'pos_1', top: '68%', left: '15%', role: 'LB' },
    { id: 'pos_2', top: '75%', left: '35%', role: 'CB' },
    { id: 'pos_3', top: '75%', left: '65%', role: 'CB' },
    { id: 'pos_4', top: '68%', left: '85%', role: 'RB' },
    { id: 'pos_5', top: '40%', left: '15%', role: 'LM' },
    { id: 'pos_6', top: '50%', left: '35%', role: 'CM' },
    { id: 'pos_7', top: '50%', left: '65%', role: 'CM' },
    { id: 'pos_8', top: '40%', left: '85%', role: 'RM' },
    { id: 'pos_9', top: '20%', left: '35%', role: 'ST' },
    { id: 'pos_10', top: '20%', left: '65%', role: 'ST' },
  ],
  '3-5-2': [
    { id: 'pos_0', top: '85%', left: '50%', role: 'GK' },
    { id: 'pos_1', top: '75%', left: '25%', role: 'CB' },
    { id: 'pos_2', top: '80%', left: '50%', role: 'CB' },
    { id: 'pos_3', top: '75%', left: '75%', role: 'CB' },
    { id: 'pos_4', top: '50%', left: '10%', role: 'LM' },
    { id: 'pos_5', top: '55%', left: '32%', role: 'CM' },
    { id: 'pos_6', top: '60%', left: '50%', role: 'CDM' },
    { id: 'pos_7', top: '55%', left: '68%', role: 'CM' },
    { id: 'pos_8', top: '50%', left: '90%', role: 'RM' },
    { id: 'pos_9', top: '22%', left: '35%', role: 'ST' },
    { id: 'pos_10', top: '22%', left: '65%', role: 'ST' },
  ],
  '4-2-3-1': [
    { id: 'pos_0', top: '85%', left: '50%', role: 'GK' },
    { id: 'pos_1', top: '68%', left: '15%', role: 'LB' },
    { id: 'pos_2', top: '75%', left: '35%', role: 'CB' },
    { id: 'pos_3', top: '75%', left: '65%', role: 'CB' },
    { id: 'pos_4', top: '68%', left: '85%', role: 'RB' },
    { id: 'pos_5', top: '55%', left: '38%', role: 'CDM' },
    { id: 'pos_6', top: '55%', left: '62%', role: 'CDM' },
    { id: 'pos_7', top: '35%', left: '25%', role: 'LW' },
    { id: 'pos_8', top: '38%', left: '50%', role: 'CAM' },
    { id: 'pos_9', top: '35%', left: '75%', role: 'RW' },
    { id: 'pos_10', top: '18%', left: '50%', role: 'ST' },
  ],
  '5-3-2': [
    { id: 'pos_0', top: '85%', left: '50%', role: 'GK' },
    { id: 'pos_1', top: '65%', left: '12%', role: 'LWB' },
    { id: 'pos_2', top: '75%', left: '30%', role: 'CB' },
    { id: 'pos_3', top: '78%', left: '50%', role: 'CB' },
    { id: 'pos_4', top: '75%', left: '70%', role: 'CB' },
    { id: 'pos_5', top: '65%', left: '88%', role: 'RWB' },
    { id: 'pos_6', top: '48%', left: '28%', role: 'CM' },
    { id: 'pos_7', top: '55%', left: '50%', role: 'CM' },
    { id: 'pos_8', top: '48%', left: '72%', role: 'CM' },
    { id: 'pos_9', top: '22%', left: '38%', role: 'ST' },
    { id: 'pos_10', top: '22%', left: '62%', role: 'ST' },
  ],
  '3-4-3': [
    { id: 'pos_0', top: '85%', left: '50%', role: 'GK' },
    { id: 'pos_1', top: '75%', left: '25%', role: 'CB' },
    { id: 'pos_2', top: '78%', left: '50%', role: 'CB' },
    { id: 'pos_3', top: '75%', left: '75%', role: 'CB' },
    { id: 'pos_4', top: '52%', left: '15%', role: 'LM' },
    { id: 'pos_5', top: '55%', left: '40%', role: 'CM' },
    { id: 'pos_6', top: '55%', left: '60%', role: 'CM' },
    { id: 'pos_7', top: '52%', left: '85%', role: 'RM' },
    { id: 'pos_8', top: '25%', left: '20%', role: 'LW' },
    { id: 'pos_9', top: '20%', left: '50%', role: 'ST' },
    { id: 'pos_10', top: '25%', left: '80%', role: 'RW' },
  ],
  '5-4-1': [
    { id: 'pos_0', top: '85%', left: '50%', role: 'GK' },
    { id: 'pos_1', top: '65%', left: '12%', role: 'LWB' },
    { id: 'pos_2', top: '75%', left: '30%', role: 'CB' },
    { id: 'pos_3', top: '78%', left: '50%', role: 'CB' },
    { id: 'pos_4', top: '75%', left: '70%', role: 'CB' },
    { id: 'pos_5', top: '65%', left: '88%', role: 'RWB' },
    { id: 'pos_6', top: '45%', left: '20%', role: 'LM' },
    { id: 'pos_7', top: '50%', left: '42%', role: 'CM' },
    { id: 'pos_8', top: '50%', left: '58%', role: 'CM' },
    { id: 'pos_9', top: '45%', left: '80%', role: 'RM' },
    { id: 'pos_10', top: '20%', left: '50%', role: 'ST' },
  ]
}

export interface LineupData {
  formation: string
  players: Record<string, string | null> // slot_id -> player_id
  customPositions?: Record<string, { top: string, left: string }> // player_id -> coord
}

interface PitchLineupProps {
  players: Player[]
  initialLineup: LineupData | null
  onSave: (lineup: LineupData) => Promise<void>
}

export function PitchLineup({ players, initialLineup, onSave }: PitchLineupProps) {
  const [formation, setFormation] = useState<string>(initialLineup?.formation || '4-3-3')
  const [lineup, setLineup] = useState<Record<string, string | null>>(initialLineup?.players || {})
  const [customPositions, setCustomPositions] = useState<Record<string, { top: string, left: string }>>(initialLineup?.customPositions || {})
  const [activeSlot, setActiveSlot] = useState<{ id: string, role: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [draggingPlayer, setDraggingPlayer] = useState<{ id: string, isFromPitch: boolean, originalSlot?: string } | null>(null)
  
  const pitchRef = React.useRef<HTMLDivElement>(null)

  // Validate lineup on formation change (ONLY if not using manual dragging for everyone)
  useEffect(() => {
    setLineup(prev => {
      const slots = FORMATIONS[formation] || FORMATIONS['4-3-3']
      const next: Record<string, string | null> = {}
      slots.forEach(slot => {
        next[slot.id] = prev[slot.id] || null
      })
      return next
    })
    // Reset custom positions when changing formation?? 
    // Maybe better to KEEP them until user specifically resets.
  }, [formation])

  const handlePlayerSelect = (playerId: string | 'clear', forcedSlotId?: string) => {
    const targetSlotId = forcedSlotId || activeSlot?.id
    if (!targetSlotId) return

    setLineup(prev => {
      const next = { ...prev }
      if (playerId === 'clear') {
         next[targetSlotId] = null
      } else {
         let previousSlotId: string | null = null
         for (const key in next) {
           if (next[key] === playerId) {
             previousSlotId = key
             break
           }
         }
         if (previousSlotId && previousSlotId !== targetSlotId) {
            const playerAtTarget = next[targetSlotId]
            next[previousSlotId] = playerAtTarget
         }
         next[targetSlotId] = playerId
      }
      return next
    })
    setActiveSlot(null)
  }

  // POINTER EVENTS LOGIC (FOR MOBILE & DESKTOP)
  const onPointerDown = (e: React.PointerEvent, playerId: string, isFromPitch: boolean, slotId?: string) => {
    e.stopPropagation()
    setDraggingPlayer({ id: playerId, isFromPitch, originalSlot: slotId })
    // Capture pointer
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingPlayer || !pitchRef.current) return
    
    // Calculate position relative to pitch
    const rect = pitchRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    // Constrain within bounds
    const left = Math.min(Math.max(x, 5), 95)
    const top = Math.min(Math.max(y, 5), 95)

    setCustomPositions(prev => ({
      ...prev,
      [draggingPlayer.id]: { top: `${top.toFixed(1)}%`, left: `${left.toFixed(1)}%` }
    }))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!draggingPlayer || !pitchRef.current) {
      setDraggingPlayer(null)
      return
    }

    // Check if dropped near a slot or just free-form
    const rect = pitchRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    // Logic to snap to slot if near, or stay free
    const currentSlots = FORMATIONS[formation] || FORMATIONS['4-3-3']
    let snappedSlotId: string | null = null

    for (const slot of currentSlots) {
       const sTop = parseFloat(slot.top)
       const sLeft = parseFloat(slot.left)
       const dist = Math.sqrt(Math.pow(x - sLeft, 2) + Math.pow(y - sTop, 2))
       if (dist < 8) { // Precision radius
          snappedSlotId = slot.id
          break
       }
    }

    if (snappedSlotId) {
       handlePlayerSelect(draggingPlayer.id, snappedSlotId)
       // Optional: remove custom position to use slot position
       setCustomPositions(prev => {
         const next = { ...prev }
         delete next[draggingPlayer.id]
         return next
       })
    } else if (!draggingPlayer.isFromPitch) {
       // If dragged from bench BUT not into a slot, what do we do?
       // Let's create a "free" assignment if it's within the pitch
       if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
          // Find first empty slot to "hold" the player id
          const emptySlot = currentSlots.find(s => !lineup[s.id])
          if (emptySlot) {
             handlePlayerSelect(draggingPlayer.id, emptySlot.id)
          } else {
             // Already has 11? Can't add more unless swapped.
             toast.error('Ya tienes 11 jugadores en el campo')
             setCustomPositions(prev => {
                const next = { ...prev }
                delete next[draggingPlayer.id]
                return next
             })
          }
       }
    }

    setDraggingPlayer(null)
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      await onSave({ formation, players: lineup, customPositions })
      toast.success('Alineación guardada correctamente')
    } catch (error) {
      toast.error('Error al guardar la alineación')
    } finally {
      setIsSaving(false)
    }
  }

  const getPlayerDetails = (id: string | null) => players.find(p => p.id === id)
  const usedPlayerIds = Object.values(lineup).filter(Boolean) as string[]
  const bench = players.filter(p => !usedPlayerIds.includes(p.id))
  const currentSlots = FORMATIONS[formation] || FORMATIONS['4-3-3']
  const totalStarters = usedPlayerIds.length
  const isComplete = totalStarters === 11

  return (
    <div className="flex flex-col gap-6 animate-fade-in-up">
      {/* Controls */}
      <div className="bg-[#141414] rounded-xl border border-[#202020] p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
              11 INICIAL <span className={`${isComplete ? 'text-[#00FF85]' : 'text-[#FF3333]'} text-[10px]`}>({totalStarters}/11)</span>
            </h3>
            {!isComplete && (
               <p className="text-[8px] font-bold text-[#6A6C6E] uppercase mt-0.5">Faltan jugadores para el equipo</p>
            )}
          </div>
          <Button
            onClick={handleSave}
            disabled={isSaving || totalStarters === 0}
            size="sm"
            className="bg-[#00FF85] hover:bg-[#00CC6A] text-[#0A0A0A] font-black uppercase text-[10px] tracking-wider h-8 px-4"
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Save className="w-3 h-3 mr-1.5" />}
            Guardar
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
           <Select value={formation} onValueChange={setFormation}>
             <SelectTrigger className="flex-1 h-9 rounded-md border-[#202020] bg-[#0A0A0A] text-xs font-bold text-white px-3 focus:ring-0">
               <span className="text-[10px] text-[#6A6C6E] mr-2 uppercase">Gesto:</span>
               <SelectValue />
             </SelectTrigger>
             <SelectContent className="bg-[#141414] border-[#202020] text-white">
               {Object.keys(FORMATIONS).map(fmt => (
                 <SelectItem key={fmt} value={fmt} className="font-bold focus:bg-[#0A0A0A] focus:text-white">
                   {fmt}
                 </SelectItem>
               ))}
             </SelectContent>
           </Select>
           
           <Button
             variant="ghost"
             size="sm"
             onClick={() => {
                if (confirm('¿Vaciar toda la alineación?')) {
                  setLineup({})
                  setCustomPositions({})
                }
             }}
             className="h-9 px-3 text-[#FF3333] hover:text-[#FF3333] hover:bg-[#FF3333]/10"
           >
             <RefreshCcw className="w-3.5 h-3.5" />
           </Button>
        </div>
      </div>

      {/* Selector Modal Corregido */}
      {activeSlot && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-6">
            <div className="bg-[#141414] w-full max-w-sm rounded-[32px] border border-[#202020] shadow-2xl overflow-hidden flex flex-col max-h-[70vh] animate-scale-in">
               <div className="flex items-center justify-between p-5 border-b border-[#202020] bg-[#0A0A0A]">
                  <div className="flex flex-col">
                     <span className="text-[9px] text-[#00FF85] font-black uppercase tracking-[0.2em] bg-[#00FF85]/10 w-fit px-2 py-0.5 rounded-full mb-1">
                        ROL: {activeSlot.role}
                     </span>
                     <h4 className="text-white font-black uppercase text-base">Elegir Jugador</h4>
                  </div>
                  <button onClick={() => setActiveSlot(null)} className="p-2.5 bg-[#1F1F1F] rounded-full text-white/50 hover:text-white transition-colors">
                     <X className="w-5 h-5" />
                  </button>
               </div>
               
               <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar">
                  {lineup[activeSlot.id] && (
                     <button
                        onClick={() => handlePlayerSelect('clear')}
                        className="w-full h-12 flex items-center justify-center gap-2 rounded-2xl bg-[#FF3333]/10 text-[#FF3333] font-black text-[10px] uppercase tracking-widest border border-[#FF3333]/20 mb-3 active:scale-95 transition-transform"
                     >
                        Quitar Jugador Actual
                     </button>
                  )}
                  
                  {players.map(player => {
                     const isUsedElsewhere = usedPlayerIds.includes(player.id) && lineup[activeSlot.id] !== player.id;
                     const isCurrent = lineup[activeSlot.id] === player.id;

                     return (
                        <button
                           key={player.id}
                           onClick={() => handlePlayerSelect(player.id)}
                           className={`w-full flex items-center gap-3.5 p-3 rounded-2xl border transition-all active:scale-[0.98] ${
                              isCurrent ? 'bg-[#00FF85]/10 border-[#00FF85]/50' :
                              isUsedElsewhere ? 'bg-[#0A0A0A] border-[#1F1F1F] opacity-40 cursor-not-allowed' : 
                              'bg-[#1D1D1D] border-[#252525] hover:border-[#00FF85]/40'
                           }`}
                        >
                           <div className="w-11 h-11 rounded-xl bg-[#0A0A0A] overflow-hidden border border-[#252525] shrink-0">
                              {player.photo_url ? (
                                 <img src={player.photo_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                 <Shield className="w-full h-full p-2.5 text-white/10" />
                              )}
                           </div>
                           <div className="flex flex-col items-start min-w-0">
                              <span className="text-[13px] font-black text-white uppercase truncate text-left w-full tracking-tight">
                                 {player.name}
                              </span>
                              <div className="flex gap-2">
                                 <span className="text-[10px] font-bold text-[#6A6C6E] uppercase">{player.position}</span>
                                 {player.number && <span className="text-[10px] font-black text-[#00FF85]/60">#{player.number}</span>}
                              </div>
                           </div>
                           {isCurrent && <Check className="w-5 h-5 text-[#00FF85] ml-auto shrink-0" />}
                        </button>
                     )
                  })}
               </div>
            </div>
         </div>
      )}

      {/* The Pitch View */}
      <div 
        ref={pitchRef}
        onPointerMove={onPointerMove}
        className="relative w-full aspect-[2.3/3.2] max-w-md mx-auto bg-green-950 rounded-2xl border-[3px] border-white/20 overflow-hidden shrink-0 shadow-[0_20px_60px_rgba(0,0,0,0.6)] touch-none"
      >
        {/* Grass Pattern */}
        <div className="absolute inset-0 z-0 bg-green-900 overflow-hidden">
           <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,#14532D_0px,#14532D_40px,#166534_41px,#166534_80px)] opacity-50" />
           <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,133,0.05)_0%,transparent_70%)]" />
        </div>

        {/* Pitch Lines */}
        <div className="absolute inset-0 z-0 pointer-events-none p-4">
           <div className="w-full h-full border-2 border-white/20 rounded-sm relative">
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/20" />
              <div className="absolute top-1/2 left-1/2 w-28 h-28 border-2 border-white/20 rounded-full -translate-x-1/2 -translate-y-1/2" />
              <div className="absolute top-0 left-1/2 w-48 h-24 border-2 border-t-0 border-white/20 -translate-x-1/2" />
              <div className="absolute bottom-0 left-1/2 w-48 h-24 border-2 border-b-0 border-white/20 -translate-x-1/2" />
              <div className="absolute top-0 left-1/2 w-24 h-8 border-2 border-t-0 border-white/20 -translate-x-1/2" />
              <div className="absolute bottom-0 left-1/2 w-24 h-8 border-2 border-b-0 border-white/20 -translate-x-1/2" />
           </div>
        </div>

        {/* Players Overlay */}
        <div className="absolute inset-0 z-10">
           {currentSlots.map((slot) => {
             const playerId = lineup[slot.id];
             const pDetails = getPlayerDetails(playerId);
             const customPos = pDetails ? customPositions[pDetails.id] : null;

             return (
                <div
                  key={slot.id}
                  onPointerDown={(e) => pDetails && onPointerDown(e, pDetails.id, true, slot.id)}
                  onPointerUp={onPointerUp}
                  onClick={() => !draggingPlayer && setActiveSlot(slot)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group cursor-pointer transition-all duration-75"
                  style={{ 
                    top: customPos ? customPos.top : slot.top, 
                    left: customPos ? customPos.left : slot.left,
                    zIndex: draggingPlayer?.id === pDetails?.id ? 50 : 20
                  }}
                >
                  <div className={`w-14 h-14 rounded-full border-[3px] overflow-hidden bg-black flex items-center justify-center transition-all shadow-xl ${
                    pDetails ? 'border-[#00FF85] shadow-[#00FF85]/20' : 'border-white/10 bg-black/40 border-dashed'
                  } ${draggingPlayer?.id === pDetails?.id ? 'scale-125 rotate-6' : ''}`}>
                     {pDetails?.photo_url ? (
                        <img src={pDetails.photo_url} alt="" className="w-full h-full object-cover select-none" draggable="false" />
                     ) : pDetails ? (
                        <Shield className="w-7 h-7 text-white/10" />
                     ) : (
                        <Plus className="w-6 h-6 text-white/20" />
                     )}
                  </div>
                  <div className={`mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider max-w-[64px] truncate shadow-lg border ${
                     pDetails ? 'bg-[#00FF85] text-black border-[#00FF85]' : 'bg-black/60 text-white/40 border-white/10 backdrop-blur-md'
                  }`}>
                     {pDetails ? pDetails.name : slot.role}
                  </div>
                </div>
             )
           })}
        </div>
      </div>

      {/* Available Bench Bar */}
      <div className="bg-[#141414] rounded-2xl border border-[#202020] p-5 flex flex-col gap-4 shadow-xl">
        <h3 className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-[0.2em] flex items-center gap-2">
          PLANTILLA <span className="text-white/60">({bench.length})</span>
        </h3>
        <div className="flex overflow-x-auto gap-4 pb-2 no-scrollbar scroll-smooth p-1">
          {bench.length === 0 ? (
             <p className="text-[10px] text-white/20 italic italic w-full text-center py-2">Todos están en el campo</p>
          ) : (
             bench.map(player => (
               <div 
                  key={player.id} 
                  onPointerDown={(e) => onPointerDown(e, player.id, false)}
                  onPointerUp={onPointerUp}
                  className="flex flex-col items-center gap-2 shrink-0 group active:scale-95 transition-transform"
               >
                  <div className="w-12 h-12 rounded-2xl bg-[#1D1D1D] border border-[#252525] overflow-hidden shadow-lg group-hover:border-[#00FF85]/40 transition-colors">
                     {player.photo_url ? (
                        <img src={player.photo_url} alt="" className="w-full h-full object-cover select-none" draggable="false" />
                     ) : (
                        <Shield className="w-full h-full p-3 text-white/5" />
                     )}
                  </div>
                  <span className="text-[8px] font-black text-[#6A6C6E] uppercase truncate w-14 text-center">
                    {player.name}
                  </span>
               </div>
             ))
          )}
        </div>
      </div>
    </div>
  )
}

