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
  // Add more formations if needed
}

export interface LineupData {
  formation: string
  players: Record<string, string | null> // slot_id -> player_id
}

interface PitchLineupProps {
  players: Player[]
  initialLineup: LineupData | null
  onSave: (lineup: LineupData) => Promise<void>
}

export function PitchLineup({ players, initialLineup, onSave }: PitchLineupProps) {
  const [formation, setFormation] = useState<string>(initialLineup?.formation || '4-3-3')
  const [lineup, setLineup] = useState<Record<string, string | null>>(initialLineup?.players || {})
  const [activeSlot, setActiveSlot] = useState<FormationSlot | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Validate lineup on formation change
  useEffect(() => {
    setLineup(prev => {
      const slots = FORMATIONS[formation]
      const next: Record<string, string | null> = {}
      slots.forEach(slot => {
        next[slot.id] = prev[slot.id] || null
      })
      return next
    })
  }, [formation])

  const handlePlayerSelect = (playerId: string | 'clear', forcedSlotId?: string) => {
    const targetSlotId = forcedSlotId || activeSlot?.id
    if (!targetSlotId) return

    setLineup(prev => {
      const next = { ...prev }

      if (playerId === 'clear') {
         next[targetSlotId] = null
      } else {
         // Si el jugador ya estaba en otra posición, quitarlo de allá (intercambio)
         let previousSlotId: string | null = null
         for (const key in next) {
           if (next[key] === playerId) {
             previousSlotId = key
             break
           }
         }

         if (previousSlotId && previousSlotId !== targetSlotId) {
            // Swap if target is occupied
            const playerAtTarget = next[targetSlotId]
            next[previousSlotId] = playerAtTarget
         }
         
         next[targetSlotId] = playerId
      }
      return next
    })
    setActiveSlot(null)
  }

  const handleDragStart = (e: React.DragEvent, playerId: string) => {
    e.dataTransfer.setData('playerId', playerId)
    // Visual feedback
    e.currentTarget.classList.add('opacity-40')
  }

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('opacity-40')
  }

  const handleDrop = (e: React.DragEvent, slotId: string) => {
    e.preventDefault()
    const playerId = e.dataTransfer.getData('playerId')
    if (playerId) {
      handlePlayerSelect(playerId, slotId)
    }
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      await onSave({ formation, players: lineup })
      toast.success('Alineación guardada correctamente', {
         description: 'Esta alineación se usará en tus próximos partidos.'
      })
    } catch (error) {
      toast.error('Error al guardar la alineación')
    } finally {
      setIsSaving(false)
    }
  }

  const getPlayerDetails = (id: string | null) => players.find(p => p.id === id)

  // Substitutes (bench) 
  const usedPlayerIds = Object.values(lineup).filter(Boolean) as string[]
  const bench = players.filter(p => !usedPlayerIds.includes(p.id))

  const currentSlots = FORMATIONS[formation] || FORMATIONS['4-3-3']
  const totalStarters = usedPlayerIds.length
  
  // Is modified? (if we want more precise button disabling)
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
               <p className="text-[8px] font-bold text-[#6A6C6E] uppercase mt-0.5">Faltan jugadores para completar el 11</p>
            )}
          </div>
          <Button
            onClick={handleSave}
            disabled={isSaving || totalStarters === 0}
            size="sm"
            className="bg-[#00FF85] hover:bg-[#00CC6A] text-[#0A0A0A] font-black uppercase text-[10px] tracking-wider h-8 px-4"
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Save className="w-3 h-3 mr-1.5" />}
            Guardar Alineación
          </Button>
        </div>
        
        <div className="flex items-center gap-3">
           <span className="text-[10px] font-bold text-[#6A6C6E] uppercase tracking-wider">Formación</span>
           <Select value={formation} onValueChange={setFormation}>
             <SelectTrigger className="flex-1 h-9 rounded-md border-[#202020] bg-[#0A0A0A] text-xs font-black text-white px-3 focus:ring-0">
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
                if (confirm('¿Vaciar toda la alineación?')) setLineup({})
             }}
             className="h-9 px-3 text-[#FF3333] hover:text-[#FF3333] hover:bg-[#FF3333]/10"
           >
             <RefreshCcw className="w-3.5 h-3.5" />
           </Button>
        </div>
      </div>

      {/* Touch Modal for Selection (Fallback for non-drag or quick selection) */}
      {activeSlot && (
         <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center p-4">
            <div className="bg-[#141414] w-full max-w-sm rounded-[24px] border border-[#202020] overflow-hidden flex flex-col max-h-[80vh] animate-slide-in">
               <div className="flex items-center justify-between p-4 border-b border-[#202020] bg-[#0A0A0A]">
                  <div>
                     <span className="text-[10px] text-[#00FF85] font-black uppercase tracking-widest bg-[#00FF85]/10 px-2 py-0.5 rounded">
                        Rol: {activeSlot.role}
                     </span>
                     <h4 className="text-white font-black uppercase text-sm mt-1">Seleccionar Jugador</h4>
                  </div>
                  <button onClick={() => setActiveSlot(null)} className="p-2 bg-[#202020] rounded-full text-white hover:bg-[#2D2D2D]">
                     <X className="w-4 h-4" />
                  </button>
               </div>
               
               <div className="overflow-y-auto p-4 space-y-2 app-viewport">
                  {lineup[activeSlot.id] && (
                     <button
                        onClick={() => handlePlayerSelect('clear')}
                        className="w-full h-11 flex items-center justify-center gap-2 rounded bg-[#FF3333]/10 text-[#FF3333] font-bold text-xs uppercase tracking-wider border border-[#FF3333]/20 mb-4"
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
                           className={`w-full flex items-center gap-3 p-2 rounded-xl border transition-all ${
                              isCurrent ? 'bg-[#00FF85]/10 border-[#00FF85]/50' :
                              isUsedElsewhere ? 'bg-[#0A0A0A] border-[#202020] opacity-50' : 
                              'bg-[#1A1A1A] border-[#2D2D2D] hover:border-[#00FF85]/30'
                           }`}
                        >
                           <div className="w-10 h-10 rounded-lg bg-[#0A0A0A] overflow-hidden border border-[#2D2D2D] shrink-0">
                              {player.photo_url ? (
                                 <img src={player.photo_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                 <Shield className="w-full h-full p-2 text-[#4A4A4A]" />
                              )}
                           </div>
                           <div className="flex flex-col items-start min-w-0">
                              <span className="text-xs font-black text-white uppercase truncate text-left w-full">
                                 {player.name}
                              </span>
                              <div className="flex gap-2">
                                 <span className="text-[9px] font-bold text-[#6A6C6E] uppercase">
                                    {player.position}
                                 </span>
                                 {player.number && (
                                    <span className="text-[9px] font-bold text-[#6A6C6E]">
                                       #{player.number}
                                    </span>
                                 )}
                              </div>
                           </div>
                           {isCurrent && <Check className="w-4 h-4 text-[#00FF85] ml-auto shrink-0" />}
                           {isUsedElsewhere && !isCurrent && <span className="text-[8px] text-[#6A6C6E] font-bold uppercase ml-auto shrink-0 bg-[#0A0A0A] px-1.5 py-0.5 rounded">En cancha</span>}
                        </button>
                     )
                  })}
               </div>
            </div>
         </div>
      )}

      {/* The Pitch View */}
      <div className="relative w-full aspect-[2/3] max-w-md mx-auto bg-green-900 rounded-lg border-2 border-white/20 overflow-hidden shrink-0 shadow-[0_0_30px_rgba(0,255,133,0.1)]">
        {/* Pitch Markings (Simplified CSS) */}
        <div className="absolute inset-0 z-0 pointer-events-none">
           {/* Grass Pattern */}
           <div className="absolute inset-0 bg-[linear-gradient(0deg,transparent_49%,rgba(255,255,255,0.05)_50%,transparent_51%)] bg-[length:100%_10%]" />
           
           {/* Center Circle & Line */}
           <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/40 -translate-y-1/2" />
           <div className="absolute top-1/2 left-1/2 w-24 h-24 border-2 border-white/40 rounded-full -translate-x-1/2 -translate-y-1/2" />
           <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-white/40 rounded-full -translate-x-1/2 -translate-y-1/2" />

           {/* Penalty Areas */}
           <div className="absolute bottom-0 left-1/2 w-48 h-24 border-2 border-b-0 border-white/40 -translate-x-1/2" />
           <div className="absolute top-0 left-1/2 w-48 h-24 border-2 border-t-0 border-white/40 -translate-x-1/2" />
           
           {/* Goal Areas */}
           <div className="absolute bottom-0 left-1/2 w-24 h-8 border-2 border-b-0 border-white/40 -translate-x-1/2" />
           <div className="absolute top-0 left-1/2 w-24 h-8 border-2 border-t-0 border-white/40 -translate-x-1/2" />
        </div>

        {/* Players Overlay */}
        <div className="absolute inset-0 z-10 p-2">
           {currentSlots.map((slot) => {
             const playerId = lineup[slot.id];
             const pDetails = getPlayerDetails(playerId);

             return (
                <div
                  key={slot.id}
                  onClick={() => setActiveSlot(slot)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, slot.id)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group cursor-pointer"
                  style={{ top: slot.top, left: slot.left }}
                >
                  <div 
                    draggable={!!pDetails}
                    onDragStart={(e) => pDetails && handleDragStart(e, pDetails.id)}
                    onDragEnd={handleDragEnd}
                    className={`w-12 h-12 rounded-full border-2 overflow-hidden bg-black flex items-center justify-center transition-all ${
                      pDetails ? 'border-[#00FF85] shadow-[0_0_15px_rgba(0,255,133,0.3)]' : 'border-white/30 bg-black/40 border-dashed'
                    } group-hover:scale-110 active:scale-95`}
                  >
                     {pDetails?.photo_url ? (
                        <img src={pDetails.photo_url} alt="" className="w-full h-full object-cover scale-110" />
                     ) : pDetails ? (
                        <Shield className="w-6 h-6 text-[#202020]" />
                     ) : (
                        <Plus className="w-5 h-5 text-white/50" />
                     )}
                  </div>
                  
                  {/* Name badge */}
                  <div className={`mt-0.5 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider max-w-[56px] truncate ${
                     pDetails ? 'bg-[#00FF85]/90 text-black' : 'bg-black/80 text-white/50'
                  }`}>
                     {pDetails ? pDetails.name : slot.role}
                  </div>
                </div>
             )
           })}
        </div>
      </div>

      {/* Bench (Suplentes) */}
      <div className="bg-[#141414] rounded-xl border border-[#202020] p-4 flex flex-col gap-3">
        <h3 className="text-xs font-black text-[#6A6C6E] uppercase tracking-widest flex items-center gap-2">
          PLANTILLA DISPONIBLE <span className="text-[10px]">({bench.length})</span>
        </h3>
        {bench.length === 0 ? (
           <p className="text-[10px] text-white/40 italic">No tienes más jugadores en plantilla.</p>
        ) : (
           <div className="flex overflow-x-auto gap-3 pb-2 app-viewport no-scrollbar">
              {bench.map(player => (
                 <div 
                    key={player.id} 
                    draggable="true"
                    onDragStart={(e) => handleDragStart(e, player.id)}
                    onDragEnd={handleDragEnd}
                    className="w-14 shrink-0 flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing hover:scale-110 transition-transform"
                 >
                    <div className="w-10 h-10 rounded-full border border-[#2D2D2D] overflow-hidden bg-[#0A0A0A] shadow-lg">
                       {player.photo_url ? (
                          <img src={player.photo_url} alt="" className="w-full h-full object-cover" />
                       ) : (
                          <Shield className="w-full h-full p-2 text-[#4A4A4A]" />
                       )}
                    </div>
                    <span className="text-[7px] font-bold text-white uppercase text-center leading-tight truncate w-full px-1">
                       {player.name}
                    </span>
                 </div>
              ))}
           </div>
        )}
      </div>

    </div>
  )
}

