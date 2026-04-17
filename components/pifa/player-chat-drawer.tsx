'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Player } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, X, Loader2, User as UserIcon, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogPortal,
  DialogOverlay,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface PlayerChatDrawerProps {
  player: Player | null
  isOpen: boolean
  onClose: () => void
  clubId: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function PlayerChatDrawer({ player, isOpen, onClose, clubId }: PlayerChatDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(false)
  const [personality, setPersonality] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadHistory = useCallback(async () => {
    if (isOpen && player) {
      setInitialLoading(true)
      setMessages([])
      try {
        const response = await fetch('/api/player/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId: player.id,
            clubId,
            messages: []
          })
        })
        const data = await response.json()
        if (data.history && data.history.length > 0) {
          setMessages(data.history)
        } else {
          setMessages([{ role: 'assistant', content: `¿Qué pasa, míster? Usted dirá.` }])
        }
        if (data.personality) setPersonality(data.personality)
      } catch (err) {
        console.error('Error loading history:', err)
      } finally {
        setInitialLoading(false)
        // Auto-focus input after loading history
        setTimeout(() => inputRef.current?.focus(), 100)
      }
    }
  }, [isOpen, player, clubId])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const [error, setError] = useState<string | null>(null)

  const [retryCount, setRetryCount] = useState(0)

  const handleSend = async () => {
    if (!input.trim() || !player || loading) return

    setError(null)
    const userMsg: Message = { role: 'user', content: input }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)
    setRetryCount(0)

    const sendWithPersistence = async (attempt: number): Promise<void> => {
      try {
        const response = await fetch('/api/player/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId: player.id,
            clubId,
            messages: updatedMessages
          })
        })

        // Si el servidor está saturado (429 o 503)
        if (response.status === 429 || response.status === 503 || !response.ok) {
          setRetryCount(attempt)
          // Espera inteligente: cada vez esperamos un poco más, hasta un máximo de 10 segundos entre intentos
          const waitTime = Math.min(attempt * 2000, 10000) 
          await new Promise(resolve => setTimeout(resolve, waitTime))
          return sendWithPersistence(attempt + 1)
        }

        const data = await response.json()
        if (data.text) {
          setMessages(prev => [...prev, { role: 'assistant', content: data.text }])
          setLoading(false)
          setRetryCount(0)
        } else if (data.error) {
          // Si hay un error de lógica, esperamos y reintentamos también
          setRetryCount(attempt)
          await new Promise(resolve => setTimeout(resolve, 3000))
          return sendWithPersistence(attempt + 1)
        }
      } catch (err) {
        setRetryCount(attempt)
        await new Promise(resolve => setTimeout(resolve, 3000))
        return sendWithPersistence(attempt + 1)
      }
    }

    sendWithPersistence(1)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  if (!player) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogPortal>
        <DialogOverlay className="bg-black/60 backdrop-blur-sm z-[150]" />
        <DialogContent 
          showCloseButton={false}
          onOpenAutoFocus={(e) => e.preventDefault()} // Custom focus management
          className="bg-[#0A0A0A] border-white/10 shadow-2xl z-[151] flex flex-col p-0 gap-0 outline-none max-h-[90vh] w-[95vw] sm:max-w-[500px] overflow-hidden rounded-[24px]"
        >
          <div className="sr-only">
            <DialogTitle>Chat con {player.name}</DialogTitle>
            <DialogDescription>Conversación directa con tu jugador sobre la temporada.</DialogDescription>
          </div>
          {/* Header */}
          <div className="p-5 border-b border-white/5 bg-[#0D0D0D] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#141414] border border-white/10 overflow-hidden flex items-center justify-center relative shadow-lg">
                {player.photo_url ? (
                  <img src={player.photo_url} className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-5 h-5 text-white/20" />
                )}
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#00FF85] border-2 border-[#0A0A0A] rounded-full" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-xs font-black text-white uppercase tracking-tighter">{player.name}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[8px] font-bold text-[#6A6C6E] uppercase tracking-widest">{player.position}</span>
                  {personality && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[6px] font-black uppercase tracking-widest ${
                      personality === 'Humilde' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                    }`}>
                      {personality}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-full transition-colors group"
            >
              <X className="w-4 h-4 text-white/20 group-hover:text-white transition-colors" />
            </button>
          </div>

          {/* Chat Body */}
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[url('/grid-pattern.svg')] bg-fixed"
          >
            {initialLoading ? (
              <div className="space-y-6">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                    <div className={`w-2/3 h-14 rounded-2xl animate-pulse ${i % 2 === 0 ? 'bg-[#00FF85]/5' : 'bg-white/5'}`} />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="text-center py-4 border-b border-dashed border-white/5 mb-6">
                  <p className="text-[9px] font-black text-white/10 uppercase tracking-[0.4em]">Conexión Neuronal Establecida</p>
                  <p className="text-[7px] font-bold text-[#00FF85]/20 uppercase tracking-widest mt-1">Temporada: {player.club?.name || 'Club'}</p>
                </div>

                {messages.map((msg, i) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] rounded-[20px] p-4 shadow-xl ${
                      msg.role === 'user' 
                        ? 'bg-[#00FF85] text-[#0A0A0A] rounded-tr-none font-bold' 
                        : 'bg-[#141414] text-white/90 border border-white/5 rounded-tl-none leading-relaxed'
                    }`}>
                      <p className="text-[12.5px] leading-relaxed">{msg.content}</p>
                    </div>
                  </motion.div>
                ))}
              </>
            )}
            
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#141414] text-white/40 border border-white/5 rounded-[20px] rounded-tl-none p-4 flex items-center gap-3 shadow-lg">
                  <div className="flex gap-1.5">
                    <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 rounded-full bg-[#00FF85]/40" />
                    <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-[#00FF85]/40" />
                    <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-[#00FF85]/40" />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] italic">
                    {retryCount > 0 ? `Reintentando (${retryCount}/3)...` : 'Procesando...'}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-center"
              >
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold px-4 py-2 rounded-full uppercase tracking-tight">
                  {error}
                </div>
              </motion.div>
            )}
          </div>

          {/* Input Footer */}
          <div className="p-6 bg-[#0D0D0D] border-t border-white/5 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 group">
                <input 
                  ref={inputRef}
                  type="text"
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Habla con tu jugador..."
                  className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 text-xs text-white focus:outline-none focus:border-[#00FF85]/80 transition-all font-medium pr-12 shadow-inner"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-20 group-focus-within:opacity-100 transition-opacity">
                   <MessageCircle className="w-4 h-4 text-[#00FF85]" />
                </div>
              </div>
              <Button 
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="w-14 h-14 rounded-2xl bg-[#00FF85] text-[#0A0A0A] hover:bg-[#00CC6A] shadow-[0_5px_15px_rgba(0,255,133,0.3)] flex items-center justify-center p-0 transition-all active:scale-95"
              >
                {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6 -rotate-12 translate-x-0.5" />}
              </Button>
            </div>
            <p className="text-[8px] font-bold text-white/10 uppercase tracking-widest text-center mt-5 flex items-center justify-center gap-2">
              <span className="w-1 h-1 rounded-full bg-white/20" />
              Canal de comunicación directa · Sin negociaciones contractuales
              <span className="w-1 h-1 rounded-full bg-white/20" />
            </p>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  )
}
