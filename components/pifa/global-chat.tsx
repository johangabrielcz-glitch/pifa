'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Club, User } from '@/lib/types'
import { Send, MessageSquare, Loader2, ChevronUp, ArrowDown, Users } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface ChatMessage {
  id: string
  user_id: string
  club_id: string | null
  content: string
  created_at: string
  user?: {
    full_name: string
    username: string
  }
  club?: {
    name: string
    shield_url: string | null
  }
}

interface ReadStatus {
  club_id: string
  last_read_message_id: string
  club?: {
    shield_url: string | null
  }
}

const PAGE_SIZE = 15

export function GlobalChat({ user, club }: { user: User; club: Club | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [readStatuses, setReadStatuses] = useState<ReadStatus[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [newMessagesCount, setNewMessagesCount] = useState(0)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)

  // -- LOGICA DE LECTURA (READ RECEIPTS) --
  
  const updateMyReadStatus = useCallback(async (msgId: string) => {
    if (!club?.id) return
    
    await supabase
      .from('global_chat_read_status')
      .upsert({
        club_id: club.id,
        last_read_message_id: msgId,
        updated_at: new Date().toISOString()
      })
  }, [club?.id])

  const fetchReadStatuses = useCallback(async () => {
    const { data } = await supabase
      .from('global_chat_read_status')
      .select('*, club:clubs(shield_url)')
    
    if (data) setReadStatuses(data)
  }, [])

  // -- EFECTOS --

  const fetchMessagesPaginated = useCallback(async (beforeTimestamp?: string) => {
    let query = supabase
      .from('global_chat_messages')
      .select(`
        *,
        user:users(full_name, username),
        club:clubs(name, shield_url)
      `)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (beforeTimestamp) {
      query = query.lt('created_at', beforeTimestamp)
    }

    const { data, error } = await query
    return (data || []).reverse()
  }, [])

  useEffect(() => {
    const init = async () => {
      const initial = await fetchMessagesPaginated()
      setMessages(initial)
      await fetchReadStatuses()
      setLoading(false)
      if (initial.length < PAGE_SIZE) setHasMore(false)
      
      if (initial.length > 0) {
        updateMyReadStatus(initial[initial.length - 1].id)
      }
      
      setTimeout(() => scrollToBottom('auto'), 100)
    }

    init()

    // Suscripciones Realtime
    const chatChannel = supabase
      .channel('chat-main')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_chat_messages' }, async (payload) => {
        const { data: newMsg } = await supabase
          .from('global_chat_messages')
          .select('*, user:users(full_name, username), club:clubs(name, shield_url)')
          .eq('id', payload.new.id)
          .single()

        if (newMsg) {
          setMessages(prev => [...prev, newMsg])
          if (!isAtBottom) {
            setNewMessagesCount(prev => prev + 1)
          } else {
            updateMyReadStatus(newMsg.id)
            setTimeout(() => scrollToBottom('smooth'), 50)
          }
        }
      })
      .subscribe()

    const readChannel = supabase
      .channel('chat-reads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'global_chat_read_status' }, () => {
        fetchReadStatuses()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(chatChannel)
      supabase.removeChannel(readChannel)
    }
  }, [fetchMessagesPaginated, isAtBottom, fetchReadStatuses, updateMyReadStatus])

  // -- HANDLERS --

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 100
    setIsAtBottom(atBottom)
    
    if (atBottom && newMessagesCount > 0) {
      setNewMessagesCount(0)
      if (messages.length > 0) updateMyReadStatus(messages[messages.length - 1].id)
    }
  }

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)

    const oldest = messages[0]?.created_at
    const olderMsgs = await fetchMessagesPaginated(oldest)
    
    if (olderMsgs.length < PAGE_SIZE) setHasMore(false)
    
    const currentScrollHeight = scrollRef.current?.scrollHeight || 0
    setMessages(prev => [...olderMsgs, ...prev])
    setLoadingMore(false)
    
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight - currentScrollHeight
      }
    }, 10)
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim() || sending) return

    setSending(true)
    const content = inputText.trim()
    setInputText('')

    const { data } = await supabase
      .from('global_chat_messages')
      .insert({ user_id: user.id, club_id: club?.id || null, content })
      .select('id')
      .single()

    if (data) updateMyReadStatus(data.id)
    setSending(false)
  }

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior })
      setNewMessagesCount(0)
      setIsAtBottom(true)
      if (messages.length > 0) updateMyReadStatus(messages[messages.length - 1].id)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <div className="relative">
          <div className="absolute inset-0 bg-[#00FF85] blur-xl opacity-20 animate-pulse" />
          <Loader2 className="w-10 h-10 text-[#00FF85] animate-spin relative z-10" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-transparent">
      
      {/* Header Estilo Premium */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#0A0A0A]/60 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#00FF85]/10 rounded-xl border border-[#00FF85]/20">
            <Users className="w-4 h-4 text-[#00FF85]" />
          </div>
          <div>
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Vestuario Global</h2>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00FF85] animate-pulse" />
              <span className="text-[7px] font-bold text-[#6A6C6E] uppercase tracking-widest">DTs Conectados</span>
            </div>
          </div>
        </div>
        <div className="px-3 py-1 rounded-full bg-white/5 border border-white/5">
          <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">{messages.length} Mensajes</span>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto pt-4 pb-24 px-4 custom-scrollbar flex flex-col"
      >
        {hasMore && (
          <button 
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="self-center mb-6 px-4 py-2 rounded-full bg-white/5 border border-white/5 text-[8px] font-black uppercase tracking-widest text-[#6A6C6E] hover:text-white transition-all active:scale-95"
          >
            {loadingMore ? 'Cargando...' : 'Cargar historial anterior'}
          </button>
        )}

        {messages.map((msg, idx) => {
          const isOwn = msg.user_id === user.id
          const prevMsg = messages[idx-1]
          const isFirstInGroup = !prevMsg || prevMsg.user_id !== msg.user_id
          const isLastInGroup = !messages[idx+1] || messages[idx+1].user_id !== msg.user_id
          
          const showFullDate = !prevMsg || 
            format(new Date(msg.created_at), 'yyyy-MM-dd') !== format(new Date(prevMsg.created_at), 'yyyy-MM-dd')

          // Quiénes han leído este mensaje (excluyendo al autor y a mí mismo si soy el autor)
          const readers = readStatuses.filter(rs => 
            rs.club_id !== club?.id && // No mostrar mi propio club en mis mensajes
            rs.club_id !== msg.club_id && // No mostrar al autor en sus propios mensajes
            (rs.last_read_message_id === msg.id || 
            (messages.findIndex(m => m.id === rs.last_read_message_id) > idx))
          )

          return (
            <div key={msg.id} className={`flex flex-col ${isFirstInGroup ? 'mt-6' : 'mt-1'}`}>
              {showFullDate && (
                <div className="flex justify-center my-6">
                  <div className="px-4 py-1 rounded-full bg-white/5 border border-white/5 text-[7px] font-black uppercase tracking-[0.2em] text-[#6A6C6E]">
                    {format(new Date(msg.created_at), "eeee, d 'de' MMMM", { locale: es })}
                  </div>
                </div>
              )}

              <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group/msg`}>
                {!isOwn && (
                  <div className="w-8 flex flex-col items-center mr-2">
                    {isFirstInGroup ? (
                      <div className="w-8 h-8 rounded-xl bg-[#141414] border border-white/10 overflow-hidden flex items-center justify-center p-1.5 shadow-xl">
                        {msg.club?.shield_url ? (
                          <img src={msg.club.shield_url} alt="Club" className="w-full h-full object-contain" />
                        ) : (
                          <MessageSquare className="w-4 h-4 text-white/20" />
                        )}
                      </div>
                    ) : <div className="w-8" />}
                  </div>
                )}

                <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[70%]`}>
                  {isFirstInGroup && (
                    <div className={`flex items-center gap-2 mb-1.5 px-1 ${isOwn ? 'flex-row-reverse text-right' : ''}`}>
                      <span className="text-[8.5px] font-black text-white/80 uppercase tracking-tighter italic">
                        {msg.user?.full_name}
                      </span>
                      {msg.club && (
                        <div className="flex items-center gap-1">
                          <div className="w-0.5 h-0.5 rounded-full bg-[#00FF85]/40" />
                          <span className="text-[7.5px] font-bold text-[#00FF85] uppercase tracking-widest">{msg.club.name}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={`group relative px-4 py-2.5 shadow-2xl transition-all ${
                    isOwn 
                      ? `bg-[#00FF85]/10 border border-[#00FF85]/30 ${isFirstInGroup ? 'rounded-2xl rounded-tr-none' : 'rounded-2xl'}` 
                      : `bg-[#141414] border border-white/5 ${isFirstInGroup ? 'rounded-2xl rounded-tl-none' : 'rounded-2xl'}`
                  }`}>
                    <p className="text-[11.5px] sm:text-xs text-white/95 leading-relaxed font-medium">
                      {msg.content}
                    </p>
                    <div className="flex items-center justify-end gap-1.5 mt-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                      <span className="text-[7px] font-black text-white/40">{format(new Date(msg.created_at), 'HH:mm')}</span>
                    </div>

                    {/* INDICADORES DE VISTO (READ RECEIPTS) */}
                    {isOwn && readers.length > 0 && (
                      <div className="absolute -bottom-2 -left-1 flex items-center bg-[#0A0A0A]/80 backdrop-blur-md rounded-full px-1.5 py-0.5 border border-white/5 space-x-[-4px]">
                        {readers.slice(0, 5).map((reader) => (
                          <div key={reader.club_id} className="w-3.5 h-3.5 rounded-full bg-[#111111] border border-white/10 p-0.5 shadow-lg">
                            {reader.club?.shield_url ? (
                              <img src={reader.club.shield_url} className="w-full h-full object-contain" />
                            ) : (
                              <div className="w-full h-full bg-[#00FF85] rounded-full" />
                            )}
                          </div>
                        ))}
                        {readers.length > 5 && (
                          <span className="pl-2 pr-1 text-[6px] font-black text-white/40 tracking-tighter">+{readers.length - 5}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Floating Badge for New Messages */}
      <AnimatePresence>
        {!isAtBottom && newMessagesCount > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            onClick={() => scrollToBottom()}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-[#00FF85] text-[#0A0A0A] px-6 py-2.5 rounded-full shadow-[0_10px_30px_rgba(0,255,133,0.4)] flex items-center gap-3 z-50 group hover:scale-105 active:scale-95 transition-all"
          >
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{newMessagesCount} nuevos mensajes</span>
            <div className="p-1 bg-black/10 rounded-full group-hover:animate-bounce">
              <ArrowDown className="w-3.5 h-3.5" />
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input de Mensaje - Estilo Flotante con espacio para Navbar */}
      <div className="px-6 pt-4 pb-[85px] z-30 bg-gradient-to-t from-[#0A0A0A] to-transparent">
        <form onSubmit={sendMessage} className="relative flex items-center gap-3">
          <div className="flex-1 relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-[#00FF85]/0 via-[#00FF85]/20 to-[#00FF85]/0 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-md" />
            <input 
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Envía un comunicado al vestuario..."
              className="w-full bg-[#141414]/90 backdrop-blur-xl border border-white/10 px-5 py-3.5 rounded-2xl text-[11px] font-bold text-white placeholder:text-white/20 focus:outline-none focus:border-[#00FF85]/40 transition-all shadow-2xl"
            />
          </div>
          <button 
            type="submit"
            disabled={!inputText.trim() || sending}
            className={`p-3.5 rounded-2xl transition-all active:scale-90 shadow-2xl ${
              inputText.trim() && !sending 
                ? 'bg-[#00FF85] text-[#0A0A0A] shadow-[0_5px_20px_rgba(0,255,133,0.3)] hover:scale-105' 
                : 'bg-white/5 text-white/10'
            }`}
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 fill-current" />}
          </button>
        </form>
      </div>
    </div>
  )
}
