'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Player, ClauseNegotiation } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, X, Loader2, User as UserIcon, MessageCircle, ShieldAlert, Coins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogPortal,
  DialogOverlay,
  DialogTitle,
} from '@/components/ui/dialog'
import { startClauseNegotiation, transferPlayerByClause } from '@/lib/market-engine'
import { toast } from 'sonner'

interface ClauseChatDrawerProps {
  player: Player | null
  isOpen: boolean
  onClose: () => void
  buyerClubId: string
  onTransferComplete?: () => void
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function ClauseChatDrawer({ player, isOpen, onClose, buyerClubId, onTransferComplete }: ClauseChatDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [negotiation, setNegotiation] = useState<ClauseNegotiation | null>(null)
  const [dealAccepted, setDealAccepted] = useState(false)
  const [executingTransfer, setExecutingTransfer] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchGreeting = async (negId: string) => {
    if (!player) return
    setLoading(true)
    try {
      const response = await fetch('/api/market/clause-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: player.id,
          clubId: buyerClubId,
          negotiationId: negId,
          messages: [] // Vacío indica que es el saludo inicial
        })
      })
      if (response.ok) {
        const data = await response.json()
        if (data.text) {
          setMessages([{ role: 'assistant', content: data.text }])
        }
      }
    } catch (err) {
      console.error('Error fetching greeting:', err)
    } finally {
      setLoading(false)
    }
  }

  const initNegotiation = useCallback(async () => {
    if (isOpen && player) {
      // Limpieza inmediata para evitar rastro de chats anteriores
      setMessages([])
      setNegotiation(null)
      setDealAccepted(false)
      setLoading(true)

      try {
        const neg = await startClauseNegotiation(player.id, buyerClubId)
        setNegotiation(neg)
        
        // Siempre pedir saludo si estamos abriendo/cambiando de jugador
        await fetchGreeting(neg.id)
      } catch (err: any) {
        toast.error(err.message || 'Error al iniciar negociación')
        onClose()
      } finally {
        setLoading(false)
      }
    }
  }, [isOpen, player?.id, buyerClubId])

  useEffect(() => {
    initNegotiation()
  }, [initNegotiation])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const handleSend = async () => {
    if (!input.trim() || !player || !negotiation || loading || negotiation.status === 'blocked') return

    const userMsg: Message = { role: 'user', content: input }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    try {
      const response = await fetch('/api/market/clause-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: player.id,
          clubId: buyerClubId,
          negotiationId: negotiation.id,
          messages: updatedMessages
        })
      })

      if (!response.ok) throw new Error('Error al conectar con el jugador')

      const data = await response.json()
      
      if (data.text) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.text }])
        setNegotiation(prev => prev ? { ...prev, patience: data.patience, status: data.status } : null)
        if (data.deal_accepted) setDealAccepted(true)
      }
      
      if (data.status === 'blocked') {
        toast.error('El jugador ha cortado la negociación.')
      }
    } catch (err) {
      toast.error('El jugador no responde...')
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const handleConfirmTransfer = async () => {
    if (!negotiation) return
    setExecutingTransfer(true)
    try {
      await transferPlayerByClause(negotiation.id)
      toast.success('¡TRASPASO COMPLETADO! Bienvenido al equipo.')
      if (onTransferComplete) onTransferComplete()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Error al ejecutar el traspaso')
    } finally {
      setExecutingTransfer(false)
    }
  }

  if (!player) return null

  const patienceColor = (negotiation?.patience || 0) > 60 ? '#00FF85' : (negotiation?.patience || 0) > 30 ? '#FFB800' : '#FF3333'

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogPortal>
        <DialogOverlay className="bg-black/80 backdrop-blur-md z-[200]" />
        <DialogContent 
          showCloseButton={false}
          className="bg-[#050505] border-white/5 shadow-2xl z-[201] flex flex-col p-0 gap-0 outline-none h-full sm:h-[90vh] w-full sm:max-w-[550px] overflow-hidden sm:rounded-[40px]"
        >
          <div className="sr-only">
            <DialogTitle>Negociación con {player.name}</DialogTitle>
          </div>

          {/* Patience Bar Header */}
          <div className="bg-[#0A0A0A] border-b border-white/5 p-4 relative overflow-hidden">
             {/* Background Glow */}
             <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 0%, ${patienceColor}, transparent)` }} />
             
             <div className="flex items-center justify-between mb-3 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center p-1">
                        {player.photo_url ? (
                            <img src={player.photo_url} className="w-full h-full object-cover" />
                        ) : (
                            <UserIcon className="w-5 h-5 text-white/20" />
                        )}
                    </div>
                    <div>
                        <h3 className="text-[11px] font-black text-white uppercase tracking-tighter">{player.name}</h3>
                        <p className="text-[8px] font-bold text-[#6A6C6E] uppercase tracking-widest">{player.position} · Cláusula: ${(player.release_clause || 700000).toLocaleString()}</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-white/20 hover:text-white transition-all">
                    <X className="w-5 h-5" />
                </button>
             </div>

             <div className="space-y-1.5 px-2 relative z-10">
                <div className="flex justify-between items-center px-1">
                    <span className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-[0.3em]">Nivel de Paciencia</span>
                    <span className="text-[10px] font-black" style={{ color: patienceColor }}>{negotiation?.patience || 0}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/[0.03]">
                    <motion.div 
                        initial={{ width: '100%' }}
                        animate={{ width: `${negotiation?.patience || 0}%` }}
                        style={{ backgroundColor: patienceColor }}
                        className="h-full rounded-full shadow-[0_0_10px_rgba(0,255,133,0.2)]"
                    />
                </div>
             </div>
          </div>

          {/* Chat Messages */}
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[url('/grid-pattern.svg')] bg-fixed"
          >
            {messages.map((msg, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] rounded-[24px] p-4 ${
                  msg.role === 'user' 
                    ? 'bg-[#00FF85] text-[#0A0A0A] rounded-tr-none font-bold shadow-[0_10px_30px_rgba(0,255,133,0.1)]' 
                    : 'bg-[#121212] text-white/90 border border-white/5 rounded-tl-none leading-relaxed shadow-xl'
                }`}>
                  <p className="text-[13px]">{msg.content}</p>
                </div>
              </motion.div>
            ))}
            
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#121212] text-white/40 border border-white/5 rounded-[24px] rounded-tl-none p-4 flex items-center gap-3">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] italic">El jugador está pensando...</span>
                </div>
              </div>
            )}
            
            {negotiation?.status === 'blocked' && (
              <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
                <ShieldAlert className="w-12 h-12 text-red-500 animate-pulse" />
                <div>
                   <h4 className="text-sm font-black text-red-500 uppercase">NEGOCIACIÓN ROTA</h4>
                   <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest mt-1">Has agotado la paciencia del jugador.</p>
                </div>
                <Button onClick={onClose} variant="ghost" className="text-[10px] text-white/60 font-black uppercase">SALIR</Button>
              </div>
            )}
          </div>

          {/* Footer - Final Deal or Input */}
          <div className="p-6 bg-[#0A0A0A] border-t border-white/5">
            {dealAccepted && negotiation?.status !== 'blocked' ? (
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-[#00FF85] p-6 rounded-[32px] text-[#0A0A0A] flex flex-col items-center gap-4 shadow-[0_20px_50px_rgba(0,255,133,0.2)]"
              >
                <div className="text-center">
                    <h3 className="text-xl font-black uppercase tracking-tighter">¡TRATO CERRADO!</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">El jugador ha aceptado tus condiciones</p>
                </div>
                <Button 
                    onClick={handleConfirmTransfer}
                    disabled={executingTransfer}
                    className="w-full bg-[#0A0A0A] text-[#00FF85] hover:bg-black font-black uppercase tracking-[0.2em] text-[11px] h-14 rounded-2xl shadow-2xl"
                >
                    {executingTransfer ? <Loader2 className="w-5 h-5 animate-spin" /> : 'DATAR TRANSFERENCIA (Pagar Cláusula)'}
                </Button>
              </motion.div>
            ) : negotiation?.status === 'blocked' ? (
              <div className="flex justify-center">
                <Button onClick={onClose} className="w-full h-12 bg-white/5 text-white/40 font-black uppercase tracking-widest rounded-2xl border border-white/5 hover:bg-white/10">
                  Cerrar Negociación
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="relative flex-1 group">
                    <input 
                      ref={inputRef}
                      type="text"
                      autoFocus
                      disabled={loading || negotiation?.status === 'blocked'}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      placeholder="Propón un salario, rol, o convéncelo..."
                      className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 text-xs text-white focus:border-[#00FF85] transition-all font-medium pr-12 disabled:opacity-50"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-20 group-focus-within:opacity-100 transition-opacity">
                       <MessageCircle className="w-4 h-4 text-[#00FF85]" />
                    </div>
                  </div>
                  <Button 
                    onClick={handleSend}
                    disabled={loading || !input.trim() || negotiation?.status === 'blocked'}
                    className="w-14 h-14 rounded-2xl bg-[#00FF85] text-[#0A0A0A] hover:bg-[#00CC6A] flex items-center justify-center p-0 transition-all active:scale-95 disabled:opacity-20"
                  >
                    <Send className="w-5 h-5 -rotate-12" />
                  </Button>
                </div>
                <div className="flex items-center justify-center gap-6">
                    <div className="flex items-center gap-1.5">
                        <Coins className="w-3 h-3 text-[#00FF85]" />
                        <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">Negociación Directa</span>
                    </div>
                    <div className="w-1 h-1 rounded-full bg-white/10" />
                    <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">Sin Agentes</span>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  )
}
