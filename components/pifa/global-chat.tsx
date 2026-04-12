'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Club, User } from '@/lib/types'
import { Send, MessageSquare, Loader2, ChevronUp, ArrowDown, Users, AtSign, Shield, Reply, X, Plus, Image as ImageIcon, Film, Smile, Star, MoreHorizontal, Download, Trash2 } from 'lucide-react'
import { sendPushToClub, sendPushToAll } from '@/lib/push-notifications'
import { toast } from 'sonner'
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
  reply_to_id?: string | null
  reply_to?: {
    content: string
    user: { full_name: string }
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
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null)
  
  // -- ESTADOS MULTIMEDIA & STICKERS --
  const [isMediaMenuOpen, setIsMediaMenuOpen] = useState(false)
  const [mediaPickerType, setMediaPickerType] = useState<'attachments' | 'stickers' | null>(null)
  const [myStickers, setMyStickers] = useState<{id: string, url: string}[]>([])
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [stickerTab, setStickerTab] = useState<'global' | 'personal'>('global')
  const [pendingMedia, setPendingMedia] = useState<{url: string, type: 'image' | 'video'} | null>(null)
  const [activeMediaUrl, setActiveMediaUrl] = useState<string | null>(null)
  const [stickerToConfirm, setStickerToConfirm] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const officialStickers = [
    { id: 'st-cup', url: '/stickers/pifa_sticker_trophy_1775954266532.png' },
    { id: 'st-ball', url: '/stickers/pifa_sticker_ball_fire_1775954283937.png' },
    { id: 'st-red', url: '/stickers/pifa_sticker_red_card_1775954295329.png' },
    { id: 'st-dt', url: '/stickers/pifa_sticker_manager_celebrate_1775954306296.png' }
  ]
  
  // -- ESTADOS MENCIONES --
  const [allDTs, setAllDTs] = useState<User[]>([])
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)

  // -- LOGICA DE LECTURA (READ RECEIPTS) --
  
  const updateMyReadStatus = useCallback(async (msgId?: string) => {
    if (!club?.id || !user?.id) return
    
    let targetId = msgId
    
    // Si no se proporciona un ID, buscamos el mensaje más nuevo de TODA la base de datos
    if (!targetId) {
      const { data: latest } = await supabase
        .from('global_chat_messages')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      if (latest) targetId = latest.id
    }

    if (!targetId) return

    // Guardar marca de tiempo local inmediatamente para el badge
    const now = new Date().toISOString()
    localStorage.setItem(`pifa_chat_read_at_${user.id}`, now)
    localStorage.setItem(`pifa_chat_last_id_${user.id}`, targetId)
    
    await supabase
      .from('global_chat_read_status')
      .upsert({
        user_id: user.id,
        club_id: club.id,
        last_read_message_id: targetId,
        updated_at: now
      }, { onConflict: 'user_id,club_id' })
    
    // Notificar localmente para limpiar el badge al instante
    window.dispatchEvent(new CustomEvent('pifa_chat_read'))
  }, [club?.id, user?.id])

  const fetchReadStatuses = useCallback(async () => {
    const { data } = await supabase
      .from('global_chat_read_status')
      .select('*, club:clubs(shield_url), last_read_msg:global_chat_messages!last_read_message_id(created_at)')
    
    if (data) setReadStatuses(data)
  }, [])

  // -- PROCESAMIENTO DE ESTADOS DE LECTURA (Optimización para Receipts) --
  const clubReadStats = useMemo(() => {
    const stats: Record<string, { lastMsgAt: number, shield_url: string | null }> = {}
    
    readStatuses.forEach(rs => {
      // Usamos el timestamp del mensaje referenciado en el estado de lectura
      const readAt = rs.last_read_msg?.created_at ? new Date(rs.last_read_msg.created_at).getTime() : 0
      if (readAt === 0) return

      // Si el club no existe o este usuario ha leído mensajes más recientes
      if (!stats[rs.club_id] || readAt > stats[rs.club_id].lastMsgAt) {
        stats[rs.club_id] = {
          lastMsgAt: readAt,
          shield_url: rs.club?.shield_url || null
        }
      }
    })
    
    return stats
  }, [readStatuses])

  // -- EFECTOS --

  const fetchMessagesPaginated = useCallback(async (beforeTimestamp?: string) => {
    let query = supabase
      .from('global_chat_messages')
      .select(`
        *,
        user:users(full_name, username),
        club:clubs(name, shield_url),
        reply_to:reply_to_id(content, user:users(full_name))
      `)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (beforeTimestamp) {
      query = query.lt('created_at', beforeTimestamp)
    }

    const { data, error } = await query
    if (error) console.error('Error fetching chat messages:', error)
    return (data || []).reverse()
  }, [])

  const handleCatchUp = useCallback(async () => {
    // Si no hay mensajes, no hay nada que "atrapar"
    if (messages.length === 0) return

    const lastMsg = messages[messages.length - 1]
    const { data: missedMsgs, error } = await supabase
      .from('global_chat_messages')
      .select(`
        *,
        user:users(full_name, username),
        club:clubs(name, shield_url),
        reply_to:reply_to_id(content, user:users(full_name))
      `)
      .gt('created_at', lastMsg.created_at)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error al recuperar mensajes perdidos:', error)
      return
    }

    if (missedMsgs && missedMsgs.length > 0) {
      setMessages(prev => {
        const newUniqueMsgs = missedMsgs.filter(mm => !prev.find(m => m.id === mm.id))
        
        if (newUniqueMsgs.length > 0) {
          if (isAtBottomRef.current) {
            setTimeout(() => scrollToBottom('smooth'), 100)
            updateMyReadStatus(newUniqueMsgs[newUniqueMsgs.length - 1].id)
          } else {
            setNewMessagesCount(c => c + newUniqueMsgs.length)
          }
          return [...prev, ...newUniqueMsgs]
        }
        return prev
      })
    }

    // Aprovechar para refrescar estados de lectura
    fetchReadStatuses()
  }, [messages, fetchReadStatuses, updateMyReadStatus])

  useEffect(() => {
    let isMounted = true
    const init = async () => {
      try {
        const [initialMessages, { data: usersData }, { data: stickersData }] = await Promise.all([
          fetchMessagesPaginated(),
          supabase.from('users').select('*, club:clubs(name)').not('club_id', 'is', null),
          supabase.from('user_stickers').select('*').eq('user_id', user.id)
        ])

        if (!isMounted) return
        setMessages(initialMessages)
        if (usersData) setAllDTs(usersData as User[])
        if (stickersData) setMyStickers(stickersData)
        
        await fetchReadStatuses()
        setLoading(false)

        if (initialMessages.length < PAGE_SIZE) setHasMore(false)
        if (initialMessages.length > 0) {
          const lastMsgId = initialMessages[initialMessages.length - 1].id
          await updateMyReadStatus(lastMsgId)
        }
        
        // El autoscroll solo debe ocurrir una vez al inicio
        setTimeout(() => scrollToBottom('auto'), 100)
      } catch (err) {
        console.error('Error in init:', err)
        setLoading(false)
      }
    }

    init()
    return () => { isMounted = false }
  }, []) // Solo al montar

  // Sincronización al volver del segundo plano (Efecto separado)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleCatchUp()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [handleCatchUp])

  // Suscripciones Realtime
  useEffect(() => {
    const chatChannel = supabase
      .channel('chat-main')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_chat_messages' }, async (payload) => {
        const { data: newMsg, error: newMsgError } = await supabase
          .from('global_chat_messages')
          .select('*, user:users(full_name, username), club:clubs(name, shield_url), reply_to:reply_to_id(content, user:users(full_name))')
          .eq('id', payload.new.id)
          .single()

        if (newMsgError) console.error('Error fetching new real-time message:', newMsgError)

        if (newMsg) {
          setMessages(prev => {
            const exists = prev.find(m => m.id === newMsg.id)
            if (exists) return prev
            
            if (!isAtBottomRef.current) {
              setNewMessagesCount(c => c + 1)
            } else {
              updateMyReadStatus(newMsg.id)
              setTimeout(() => scrollToBottom('smooth'), 50)
            }
            return [...prev, newMsg]
          })
        }
      })
      .subscribe()

    const readChannel = supabase
      .channel('chat-reads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'global_chat_read_status' }, () => {
        fetchReadStatuses()
      })
      .subscribe()

    const stickersChannel = supabase
      .channel('user-stickers')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'user_stickers',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        setMyStickers(prev => {
          // Evitar duplicados si ya se añadió optimísticamente
          if (prev.find(s => s.id === payload.new.id)) return prev
          return [...prev, payload.new as any]
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(chatChannel)
      supabase.removeChannel(readChannel)
      supabase.removeChannel(stickersChannel)
    }
  }, [fetchReadStatuses, updateMyReadStatus])

  // -- HANDLERS --

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 100
    setIsAtBottom(atBottom)
    isAtBottomRef.current = atBottom
    
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
    setShowMentionMenu(false)

    // 1. Insertar en DB
    const { data } = await supabase
      .from('global_chat_messages')
      .insert({ 
        user_id: user.id, 
        club_id: club?.id || null, 
        content,
        reply_to_id: replyingTo?.id || null,
        media_url: pendingMedia?.url || null,
        media_type: pendingMedia?.type || null
      })
      .select('id')
      .single()

    if (data) updateMyReadStatus(data.id)
    setReplyingTo(null)
    setMediaPickerType(null)
    setPendingMedia(null)

    // 2. Notificaciones Push (Si hay media, cambiar mensaje)
    const pushTitle = pendingMedia ? `🖼️ ${club?.name || user.full_name}` : `💬 ${club?.name || user.full_name}`
    const pushBody = pendingMedia ? `Envió un archivo: ${content || ''}` : content
    // Para simplificar, buscaremos menciones de nombres de clubes o @todos
    const hasEveryone = content.toLowerCase().includes('@todos')
    
    // Identificar clubes mencionados
    const mentionedClubs = allDTs.filter(dt => 
      dt.club?.name && content.toLowerCase().includes(`@${dt.club.name.toLowerCase()}`)
    )

    if (hasEveryone) {
      sendPushToAll(
        `📢 @TODOS: Mensaje de ${club?.name || user.full_name}`,
        pushBody,
        { type: 'chat_mention_all' }
      )
    } else if (mentionedClubs.length > 0) {
      // Notificar a los mencionados
      mentionedClubs.forEach(dt => {
        if (dt.club_id && dt.club_id !== club?.id) {
          sendPushToClub(
            dt.club_id,
            `🔔 ¡Has sido etiquetado!`,
            `${club?.name || user.full_name}: ${pushBody}`,
            { type: 'chat_mention_direct' }
          )
        }
      })
      sendPushToAll(pushTitle, pushBody, { type: 'chat_message' })
    } else {
      sendPushToAll(pushTitle, pushBody, { type: 'chat_message' })
    }

    setSending(false)
  }

  // -- LOGICA MULTIMEDIA --
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement> | any, type: 'image' | 'video' | 'sticker') => {
    const file = e.type === 'change' ? e.target.files?.[0] : e.target?.files?.[0]
    if (!file || !club?.id) return

    setUploadingMedia(true)
    const tid = toast.loading('Subiendo archivo...')
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`
      const folder = type === 'sticker' ? 'my-stickers' : 'chat-media'
      const filePath = `${folder}/${user.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('pifa-assets')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('pifa-assets')
        .getPublicUrl(filePath)

      if (type === 'sticker') {
        const { data: stickerData, error: stErr } = await supabase
          .from('user_stickers')
          .insert({ user_id: user.id, url: publicUrl })
          .select()
          .single()
        
        if (stErr) throw stErr
        setMyStickers(prev => [...prev, stickerData])
        await sendMediaMessage(publicUrl, 'sticker')
        toast.success('Sticker creado y enviado', { id: tid })
      } else {
        // En lugar de enviar directo, ponemos en "pending"
        setPendingMedia({ url: publicUrl, type: type as any })
        toast.success('Archivo listo para enviar', { id: tid })
      }
    } catch (err) {
      console.error('Upload error:', err)
      toast.error('Error al subir archivo', { id: tid })
    } finally {
      setUploadingMedia(false)
      setMediaPickerType(null)
    }
  }

  const sendMediaMessage = async (url: string, type: 'image' | 'video' | 'sticker') => {
    const { data } = await supabase
      .from('global_chat_messages')
      .insert({ 
        user_id: user.id, 
        club_id: club?.id || null, 
        content: type === 'sticker' ? 'Sent a sticker' : `Sent a ${type}`,
        media_url: url,
        media_type: type,
        reply_to_id: replyingTo?.id || null
      })
      .select('id')
      .single()
    
    if (data) updateMyReadStatus(data.id)
    setReplyingTo(null)
    setMediaPickerType(null)

    // Push notification especial
    sendPushToAll(
      `🖼️ ${club?.name || user.full_name}`,
      type === 'sticker' ? 'Envió un sticker' : `Envió una ${type === 'image' ? 'imagen' : 'video'}`,
      { type: 'chat_media' }
    )
  }

  const saveToMyStickers = async (url: string) => {
    const tid = toast.loading('Guardando sticker...')
    try {
      const { data, error } = await supabase
        .from('user_stickers')
        .insert({ user_id: user.id, url })
        .select()
        .single()
      
      if (error) throw error
      setMyStickers(prev => [...prev, data])
      toast.success('Añadido a tus stickers', { id: tid })
    } catch (err) {
      toast.error('Ya tienes este sticker o hubo un error', { id: tid })
    }
  }

  const downloadFile = async (url: string) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = url.split('/').pop() || 'pifa-media'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error('Download error:', err)
      // Si falla fetch (CORS), intentamos abrir en pestaña como último recurso
      window.open(url, '_blank')
    }
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

          // Quiénes han leído este mensaje (basado en el tiempo de creación)
          const msgTime = new Date(msg.created_at).getTime()
          const readers = Object.entries(clubReadStats)
            .filter(([idClub, stat]) => 
              idClub !== club?.id && // No mi propio club
              idClub !== msg.club_id && // No el club autor
              stat.lastMsgAt >= msgTime
            )
            .map(([idClub, stat]) => ({
              club_id: idClub,
              shield_url: stat.shield_url
            }))

          return (
            <div key={msg.id} className={`flex flex-col ${isFirstInGroup ? 'mt-6' : 'mt-1'}`}>
              {showFullDate && (
                <div className="flex justify-center my-6">
                  <div className="px-4 py-1 rounded-full bg-white/5 border border-white/5 text-[7px] font-black uppercase tracking-[0.2em] text-[#6A6C6E]">
                    {format(new Date(msg.created_at), "eeee, d 'de' MMMM", { locale: es })}
                  </div>
                </div>
              )}

              <motion.div 
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group/msg relative`}
                drag="x"
                dragConstraints={{ left: 0, right: 80 }}
                dragElastic={0.2}
                dragSnapToOrigin={true}
                onDragEnd={(e, info) => {
                  if (info.offset.x > 50) {
                    setReplyingTo(msg)
                  }
                }}
              >
                {/* Indicador visual de swipe */}
                <div className="absolute left-[-40px] top-1/2 -translate-y-1/2 opacity-0 group-active/msg:opacity-100 transition-opacity">
                  <Reply className="w-5 h-5 text-[#00FF85]" />
                </div>

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
                    {/* MENSAJE CITADO (REPLY) */}
                    {msg.reply_to_id && msg.reply_to && (
                      <div 
                        className="mb-2 p-2 rounded-lg bg-black/30 border-l-2 border-[#00FF85] cursor-pointer hover:bg-black/40 transition-colors"
                        onClick={() => {
                          const original = document.getElementById(`msg-${msg.reply_to_id}`)
                          if (original) {
                            original.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          }
                        }}
                      >
                        <p className="text-[8px] font-black text-[#00FF85] uppercase tracking-widest mb-0.5">
                          {msg.reply_to.user?.full_name || 'DT'}
                        </p>
                        <p className="text-[10px] text-white/50 line-clamp-2 break-words italic leading-relaxed">
                          "{msg.reply_to.content}"
                        </p>
                      </div>
                    )}

                    {/* CONTENIDO MULTIMEDIA */}
                    {msg.media_url && (
                      <div className="mb-2 overflow-hidden rounded-xl">
                        {msg.media_type === 'image' && (
                          <div className="relative bg-white/5 rounded-xl overflow-hidden min-h-[150px] flex items-center justify-center">
                            <img 
                              src={msg.media_url} 
                              loading="lazy"
                              className="w-full max-h-64 object-cover z-10" 
                              onClick={() => setActiveMediaUrl(msg.media_url!)}
                            />
                            <div className="absolute inset-0 animate-pulse bg-white/5" />
                          </div>
                        )}
                        {msg.media_type === 'video' && (
                          <video 
                            src={msg.media_url} 
                            controls 
                            className="w-full max-h-64 bg-black"
                            onClick={(e) => {
                              e.preventDefault()
                              setActiveMediaUrl(msg.media_url!)
                            }}
                          />
                        )}
                      </div>
                    )}

                    {msg.media_type !== 'sticker' && (
                      <p className="text-[11.5px] sm:text-xs text-white/95 leading-relaxed font-medium" id={`msg-${msg.id}`}>
                        {msg.content.split(' ').map((word, i) => {
                          if (word.startsWith('@')) {
                            return <span key={i} className="text-[#00FF85] font-black italic mr-1">{word} </span>
                          }
                          return word + ' '
                        })}
                      </p>
                    )}

                    {msg.media_type === 'sticker' && (
                      <div className="relative group/sticker cursor-pointer" onClick={() => setStickerToConfirm(msg.media_url!)}>
                        <div className="w-24 h-24 bg-white/5 rounded-xl absolute inset-0 animate-pulse -z-10" />
                        <img 
                          src={msg.media_url!} 
                          loading="lazy"
                          className="w-24 h-24 object-contain relative z-10" 
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-xl transition-opacity z-20">
                          <Star className="w-5 h-5 text-yellow-400 fill-current" />
                        </div>
                      </div>
                    )}

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
              </motion.div>
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

      {/* Input de Mensaje - Estilo Flotante */}
      <div className="px-6 py-4 z-30 bg-[#0A0A0A] border-t border-white/5">
        {/* PREVIEW DE MULTIMEDIA PENDIENTE */}
        <AnimatePresence>
          {pendingMedia && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mb-3 p-3 bg-[#111111] border border-[#00FF85]/30 rounded-xl relative flex items-center gap-4"
            >
              <div className="w-16 h-16 rounded-lg overflow-hidden border border-white/10 bg-black/50">
                {pendingMedia.type === 'image' ? (
                  <img src={pendingMedia.url} className="w-full h-full object-cover" />
                ) : (
                  <Film className="w-full h-full p-4 text-[#00FF85]" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-[9px] font-black text-[#00FF85] uppercase tracking-widest mb-1">Adjunto listo para enviar</p>
                <p className="text-[8px] text-white/40 uppercase tracking-tighter italic">Puedes añadir un mensaje antes de enviar</p>
              </div>
              <button 
                onClick={() => setPendingMedia(null)}
                className="p-2 hover:bg-white/5 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-white/40" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PREVIEW DE RESPUESTA */}
        <AnimatePresence>
          {replyingTo && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mb-3 p-3 bg-[#111111] border border-white/10 rounded-xl relative flex flex-col"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Reply className="w-3 h-3 text-[#00FF85]" />
                  <span className="text-[9px] font-black text-[#00FF85] uppercase tracking-widest">Respondiendo a {replyingTo.user?.full_name}</span>
                </div>
                <button 
                  onClick={() => setReplyingTo(null)}
                  className="p-1 hover:bg-white/5 rounded-full transition-colors"
                >
                  <X className="w-3 h-3 text-white/40" />
                </button>
              </div>
              <p className="text-xs text-white/40 truncate italic px-1">{replyingTo.content}</p>
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#00FF85] rounded-l-xl" />
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={sendMessage} className="relative flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                const type = file.type.startsWith('video/') ? 'video' : 'image'
                handleFileUpload(e, type)
              }
            }}
          />

          <div className="relative flex items-center">
            <button
              type="button"
              onClick={() => {
                setMediaPickerType(mediaPickerType === 'attachments' ? null : 'attachments')
                setShowMentionMenu(false)
              }}
              className="p-3.5 rounded-2xl bg-white/5 text-white/40 hover:text-[#00FF85] border border-white/5 transition-all active:scale-90"
            >
              <Plus className={`w-5 h-5 transition-transform ${mediaPickerType === 'attachments' ? 'rotate-45' : ''}`} />
            </button>

            <AnimatePresence>
              {mediaPickerType === 'attachments' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  className="absolute bottom-full left-0 mb-3 bg-[#111111] border border-white/10 rounded-2xl p-2 shadow-2xl z-50 flex flex-col gap-2 min-w-[150px]"
                >
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-xl transition-colors text-left group">
                    <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400 group-hover:scale-110 transition-transform">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-black text-white/80 uppercase">Galería</span>
                  </button>
                  <button type="button" onClick={() => setMediaPickerType('stickers')} className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-xl transition-colors text-left group">
                    <div className="p-2 bg-[#00FF85]/20 rounded-lg text-[#00FF85] group-hover:scale-110 transition-transform">
                      <Smile className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-black text-white/80 uppercase">Stickers</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex-1 relative group">
            {/* PANEL DE STICKERS */}
            <AnimatePresence>
              {mediaPickerType === 'stickers' && (
                <motion.div 
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.95 }}
                  className="absolute bottom-full left-0 w-full mb-4 bg-[#111111] border border-white/10 rounded-2xl overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.8)] z-50 flex flex-col h-80"
                >
                  <div className="px-4 py-3 bg-white/5 border-b border-white/5 flex items-center justify-between">
                    <div className="flex gap-4">
                      <button 
                        type="button" 
                        onClick={() => setStickerTab('global')}
                        className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 pb-1 transition-all ${
                          stickerTab === 'global' ? 'text-[#00FF85] border-b-2 border-[#00FF85]' : 'text-white/40'
                        }`}
                      >
                        Mundial
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setStickerTab('personal')} 
                        className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 pb-1 transition-all ${
                          stickerTab === 'personal' ? 'text-[#00FF85] border-b-2 border-[#00FF85]' : 'text-white/40'
                        }`}
                      >
                        Favoritos
                      </button>
                    </div>
                    <button onClick={() => setMediaPickerType(null)}><X className="w-4 h-4 text-white/20" /></button>
                  </div>
                  
                  <div className="flex-1 p-4 overflow-y-auto grid grid-cols-4 gap-4 custom-scrollbar">
                    {/* Boton subir sticker */}
                    <button 
                      type="button"
                      onClick={() => {
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = 'image/*'
                        input.onchange = (ev: any) => {
                          const f = ev.target.files[0]
                          if (f) {
                            const event = { target: { files: [f] }, type: 'custom' }
                            handleFileUpload(event, 'sticker')
                          }
                        }
                        input.click()
                      }}
                      className="aspect-square rounded-xl border-2 border-dashed border-white/5 flex items-center justify-center hover:border-[#00FF85]/40 transition-all text-white/20 hover:text-[#00FF85]"
                    >
                      <Plus className="w-6 h-6" />
                    </button>

                    {stickerTab === 'global' ? (
                      officialStickers.map(st => (
                        <button 
                          key={st.id} 
                          type="button"
                          onClick={() => sendMediaMessage(st.url, 'sticker')}
                          className="aspect-square hover:scale-110 transition-transform relative"
                        >
                          <div className="absolute inset-0 bg-white/5 rounded-xl animate-pulse" />
                          <img 
                            src={st.url} 
                            loading="lazy"
                            className="w-full h-full object-contain relative z-10" 
                          />
                        </button>
                      ))
                    ) : (
                      myStickers.map(st => (
                        <button 
                          key={st.id} 
                          type="button"
                          onClick={() => sendMediaMessage(st.url, 'sticker')}
                          className="aspect-square hover:scale-110 transition-transform relative group/personal"
                        >
                          <div className="absolute inset-0 bg-white/5 rounded-xl animate-pulse" />
                          <img 
                            src={st.url} 
                            loading="lazy"
                            className="w-full h-full object-contain relative z-10" 
                          />
                          <Star className="absolute -top-1 -right-1 w-3 h-3 text-yellow-400 fill-current z-20" />
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {/* MENÚ DE MENCIONES */}
            <AnimatePresence>
              {showMentionMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute bottom-full left-0 w-full mb-3 bg-[#111111] border border-white/10 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50"
                >
                  <div className="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between">
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Mencionar DT</span>
                    <AtSign className="w-3 h-3 text-[#00FF85]" />
                  </div>
                  <div className="max-h-48 overflow-y-auto custom-scrollbar">
                    {/* Opción @todos */}
                    {('@todos'.includes(mentionFilter.toLowerCase()) || mentionFilter === '') && (
                      <button
                        type="button"
                        onClick={() => {
                          const words = inputText.split(' ')
                          words[words.length - 1] = '@todos '
                          setInputText(words.join(' '))
                          setShowMentionMenu(false)
                        }}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#00FF85]/10 transition-colors border-b border-white/5 group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#00FF85]/20 flex items-center justify-center border border-[#00FF85]/20">
                          <Users className="w-4 h-4 text-[#00FF85]" />
                        </div>
                        <div className="text-left">
                          <p className="text-[10px] font-black text-white group-hover:text-[#00FF85]">@todos</p>
                          <p className="text-[7px] font-bold text-white/40 uppercase tracking-widest">Notificar a todo el vestuario</p>
                        </div>
                      </button>
                    )}

                    {allDTs
                      .filter(dt => dt.club?.name?.toLowerCase().includes(mentionFilter.toLowerCase()))
                      .map((dt, idx) => (
                        <button
                          key={dt.id}
                          type="button"
                          onClick={() => {
                            const words = inputText.split(' ')
                            words[words.length - 1] = `@${dt.club?.name} `
                            setInputText(words.join(' '))
                            setShowMentionMenu(false)
                          }}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#00FF85]/10 transition-colors border-b border-white/5 last:border-0 group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 p-1">
                            {dt.club?.shield_url ? (
                              <img src={dt.club.shield_url} className="w-full h-full object-contain" />
                            ) : (
                              <Shield className="w-4 h-4 text-white/20" />
                            )}
                          </div>
                          <div className="text-left">
                            <p className="text-[10px] font-black text-white group-hover:text-[#00FF85]">@{dt.club?.name}</p>
                            <p className="text-[7px] font-bold text-white/40 uppercase tracking-widest">{dt.full_name}</p>
                          </div>
                        </button>
                      ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="absolute -inset-1 bg-gradient-to-r from-[#00FF85]/0 via-[#00FF85]/20 to-[#00FF85]/0 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-md" />
            <input 
              type="text"
              value={inputText}
              onChange={(e) => {
                const val = e.target.value
                setInputText(val)
                
                // Detectar si el último caracter o palabra empieza con @
                const words = val.split(' ')
                const lastWord = words[words.length - 1]
                if (lastWord.startsWith('@')) {
                  setShowMentionMenu(true)
                  setMentionFilter(lastWord.slice(1))
                } else {
                  setShowMentionMenu(false)
                }
              }}
              placeholder="Envía un comunicado al vestuario..."
              className="w-full bg-[#141414]/90 backdrop-blur-xl border border-white/10 px-5 py-4 rounded-2xl text-[11px] font-bold text-white placeholder:text-white/20 focus:outline-none focus:border-[#00FF85]/40 transition-all shadow-2xl"
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

    {/* MODAL DE CONFIRMACIÓN DE STICKER */}
    <AnimatePresence>
      {stickerToConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-[#0A0A0A] border border-white/10 p-6 rounded-[32px] w-full max-w-sm text-center shadow-2xl"
          >
            <div className="w-32 h-32 mx-auto mb-6">
              <img src={stickerToConfirm} className="w-full h-full object-contain" />
            </div>
            <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-2">¿Guardar Sticker?</h3>
            <p className="text-xs text-white/40 mb-8 uppercase tracking-widest">Se añadirá a tu pestaña de Favoritos</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setStickerToConfirm(null)}
                className="flex-1 py-4 rounded-2xl bg-white/5 text-white/40 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  saveToMyStickers(stickerToConfirm)
                  setStickerToConfirm(null)
                }}
                className="flex-1 py-4 rounded-2xl bg-[#00FF85] text-[#0A0A0A] text-[10px] font-black uppercase tracking-widest hover:shadow-[0_0_20px_rgba(0,255,133,0.4)] transition-all"
              >
                Guardar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    {/* LIGHTBOX (VISUALIZADOR A PANTALLA COMPLETA) */}
    <AnimatePresence>
      {activeMediaUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl group">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative w-full h-full flex items-center justify-center p-4"
            onClick={() => setActiveMediaUrl(null)}
          >
            {activeMediaUrl.includes('.mp4') || activeMediaUrl.includes('video') ? (
              <video 
                src={activeMediaUrl} 
                controls 
                autoPlay 
                className="max-w-full max-h-full rounded-2xl" 
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img 
                src={activeMediaUrl} 
                className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" 
                onClick={(e) => e.stopPropagation()}
              />
            )}

            {/* BOTONES DE ACCIÓN */}
            <div className="absolute top-6 right-6 flex gap-4">
              <button 
                onClick={(e) => {
                  e.stopPropagation()
                  downloadFile(activeMediaUrl!)
                }}
                className="p-4 bg-white/5 hover:bg-[#00FF85] text-white hover:text-black rounded-full backdrop-blur-md transition-all border border-white/10 group/btn"
              >
                <Download className="w-6 h-6 group-hover/btn:scale-110 transition-transform" />
              </button>
              <button 
                onClick={() => setActiveMediaUrl(null)}
                className="p-4 bg-white/5 hover:bg-red-500 text-white rounded-full backdrop-blur-md transition-all border border-white/10"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  </div>
)
}
