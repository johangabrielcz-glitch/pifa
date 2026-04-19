'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Club, User } from '@/lib/types'
import { Send, MessageSquare, Loader2, ChevronUp, ArrowDown, Users, AtSign, Shield, Reply, X, Plus, Image as ImageIcon, Film, Smile, Star, MoreHorizontal, Download, Trash2, ArrowLeft, History, GripVertical, ImagePlus } from 'lucide-react'
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
  _is_edited?: boolean
}

interface ReadStatus {
  club_id: string
  last_read_message_id: string
  club?: {
    shield_url: string | null
  }
}

const PAGE_SIZE = 25

// -- SUB-COMPONENTES OPTIMIZADOS --

import React from 'react'

const MessageItem = React.memo(({ 
  msg, 
  user, 
  club, 
  isOwn, 
  isFirstInGroup, 
  showFullDate, 
  readers,
  onReply,
  onImageClick,
  onStickerClick,
  isHighlighted,
  onScrollToReply,
  onEdit,
  onDelete
}: { 
  msg: ChatMessage; 
  user: User; 
  club: Club | null; 
  isOwn: boolean; 
  isFirstInGroup: boolean; 
  showFullDate: boolean;
  readers: { club_id: string; shield_url: string | null }[];
  onReply: (msg: ChatMessage) => void;
  onImageClick: (url: string) => void;
  onStickerClick: (url: string) => void;
  isHighlighted: boolean;
  onScrollToReply: (id: string) => void;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
}) => {
  const [showMenu, setShowMenu] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(msg.content)
  const pressTimer = useRef<any>(null)

  const handlePressStart = () => {
    if (!isOwn) return
    pressTimer.current = setTimeout(() => {
      setShowMenu(true)
      if (window.navigator.vibrate) window.navigator.vibrate(10)
    }, 500)
  }

  const handlePressEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
  }

  const handleEdit = () => {
    onEdit(msg.id, editText)
    setIsEditing(false)
  }

  // Detectamos borrado permanente y edición (marcador invisible persistente o flag de sesión)
  const isDeleted = msg.content === 'Este mensaje ha sido borrado'
  const isEdited = msg._is_edited || msg.content.includes('\u200B')
  return (
    <div className={`flex flex-col ${isFirstInGroup ? 'mt-3' : 'mt-0.5'} z-10 relative`}>
      {showFullDate && (
        <div className="flex justify-center my-6">
          <div className="px-4 py-1 rounded-full bg-white/5 border border-white/5 text-[7px] font-black uppercase tracking-[0.2em] text-[#6A6C6E]">
            {format(new Date(msg.created_at), "eeee, d 'de' MMMM", { locale: es })}
          </div>
        </div>
      )}

      <motion.div 
        className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group/msg relative ${showMenu ? 'z-50' : 'z-0'}`}
        drag="x"
        dragDirectionLock={true}
        dragConstraints={{ left: 0, right: isDeleted ? 0 : 60 }}
        dragElastic={0.15}
        dragTransition={{ bounceStiffness: 600, bounceDamping: 20 }}
        dragSnapToOrigin={true}
        onDragEnd={(e, info) => {
          if (!isDeleted && info.offset.x > 50) onReply(msg)
        }}
        animate={isHighlighted ? { 
          scale: 1.01,
          backgroundColor: 'rgba(0, 255, 133, 0.05)'
        } : { 
          scale: 1,
          backgroundColor: 'rgba(0, 255, 133, 0)'
        }}
        transition={{ duration: 0.1 }}
      >
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

          <div className={`group relative px-3.5 py-2 shadow-sm border border-white/[0.04] ${
            isOwn 
              ? `${isDeleted ? 'bg-[#141414]' : 'bg-gradient-to-br from-[#082b1d] to-[#031c12]'} ${isFirstInGroup ? 'rounded-[18px] rounded-tr-[4px]' : 'rounded-[14px]'}` 
              : `bg-[#0B1115] ${isFirstInGroup ? 'rounded-[18px] rounded-tl-[4px]' : 'rounded-[14px]'}`
          }`}>
            {msg.reply_to_id && msg.reply_to && (
              <div 
                className="mb-2 p-2 rounded-lg bg-black/30 border-l-2 border-[#00FF85] cursor-pointer hover:bg-black/40 transition-colors"
                onClick={() => {
                  if (msg.reply_to_id) onScrollToReply(msg.reply_to_id)
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

            {msg.media_url && !isDeleted && (
              <div className="mb-2 overflow-hidden rounded-xl">
                {msg.media_type === 'image' && (
                  <div className="relative bg-white/5 rounded-xl overflow-hidden min-h-[150px] flex items-center justify-center">
                    <img 
                      src={msg.media_url} 
                      loading="lazy"
                      className="w-full max-h-64 object-cover z-10" 
                      onClick={() => onImageClick(msg.media_url!)}
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
                      onImageClick(msg.media_url!)
                    }}
                  />
                )}
              </div>
            )}

            {msg.media_type !== 'sticker' && !isEditing && (
              <p 
                className={`text-[12.5px] leading-[1.4] font-medium tracking-[-0.01em] ${isDeleted ? 'text-white/20 italic font-normal' : 'text-[#e9edef]'}`} 
                id={`msg-${msg.id}`}
                onMouseDown={handlePressStart}
                onMouseUp={handlePressEnd}
                onTouchStart={handlePressStart}
                onTouchEnd={handlePressEnd}
                onContextMenu={(e) => {
                  if (isOwn && !isDeleted) { e.preventDefault(); setShowMenu(true); }
                }}
              >
                {msg.content.replace(/\u200B/g, '').split(' ').map((word, i) => {
                  if (!isDeleted && word.startsWith('@')) {
                    return <span key={i} className="text-[#00FF85] font-black italic mr-1">{word} </span>
                  }
                  return word + ' '
                })}
              </p>
            )}

            {isEditing && (
              <div className="flex flex-col gap-2 min-w-[200px]">
                <textarea
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full bg-black/40 border border-[#00FF85]/30 rounded-lg p-2 text-xs text-white focus:outline-none"
                  rows={2}
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setIsEditing(false)} className="px-2 py-1 text-[8px] font-black uppercase text-white/40 hover:text-white">Cancelar</button>
                  <button onClick={handleEdit} className="px-3 py-1 bg-[#00FF85] text-black rounded-lg text-[8px] font-black uppercase">Guardar</button>
                </div>
              </div>
            )}

            {msg.media_type === 'sticker' && !isDeleted && (
              <div className="relative group/sticker cursor-pointer">
                <div className="w-24 h-24 bg-white/5 rounded-xl absolute inset-0 animate-pulse -z-10" />
                <img 
                  src={msg.media_url!} 
                  loading="lazy"
                  className="w-24 h-24 object-contain relative z-10" 
                  onClick={() => onStickerClick(msg.media_url!)}
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-1.5 mt-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
              {isEdited && !isDeleted && <span className="text-[6px] font-black text-[#00FF85] uppercase tracking-tighter">Editado</span>}
              <span className="text-[7px] font-black text-white/40">{format(new Date(msg.created_at), 'HH:mm')}</span>
            </div>

            {readers.length > 0 && (
              <div className="absolute -bottom-2 -left-1 flex items-center bg-[#00FF85]/10 backdrop-blur-md rounded-full px-1.5 py-0.5 border border-[#00FF85]/20 space-x-[-4px] shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
                {readers.slice(0, 5).map((reader) => (
                  <div key={reader.club_id} className="w-3.5 h-3.5 rounded-full bg-[#0A0A0A] border border-[#00FF85]/20 p-0.5 shadow-lg overflow-hidden">
                    {reader.shield_url ? (
                      <img src={reader.shield_url} className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full bg-[#00FF85] rounded-full" />
                    )}
                  </div>
                ))}
                {readers.length > 5 && (
                  <span className="pl-2 pr-1 text-[6px] font-black text-[#00FF85] tracking-tighter">+{readers.length - 5}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Menu popover */}
        <AnimatePresence>
          {showMenu && (
            <div className="fixed inset-0 z-[60]" onClick={() => setShowMenu(false)}>
              <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                transition={{ duration: 0.15 }}
                className={`absolute z-[70] bg-[#141414] border border-white/10 rounded-2xl p-1.5 shadow-2xl flex flex-col min-w-[120px]`}
                style={{ 
                  left: isOwn ? 'auto' : '20%', 
                  right: isOwn ? '20%' : 'auto',
                  top: '40%' 
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button 
                  onClick={() => { setIsEditing(true); setShowMenu(false); }}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 rounded-xl transition-colors text-left"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-[#00FF85]" />
                  <span className="text-[9px] font-black text-white/80 uppercase">Editar</span>
                </button>
                <button 
                  onClick={() => { onDelete(msg.id); setShowMenu(false); }}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-red-500/10 rounded-xl transition-colors text-left"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-[9px] font-black text-red-500 uppercase">Eliminar</span>
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}, (prev, next) => {
  return prev.msg.id === next.msg.id && 
         prev.msg.content === next.msg.content &&
         prev.msg._is_edited === next.msg._is_edited &&
         prev.readers.length === next.readers.length &&
         prev.isFirstInGroup === next.isFirstInGroup &&
         prev.showFullDate === next.showFullDate &&
         prev.isHighlighted === next.isHighlighted
})

const ChatInputArea = React.memo(({ 
  onSendMessage, 
  onUploadMedia, 
  user, 
  club, 
  allDTs,
  myStickers,
  officialStickers,
  replyingTo,
  setReplyingTo,
  pendingMedia,
  setPendingMedia,
  onSendMediaMessage,
  onTyping,
  onRemoveSticker
}: any) => {
  const [inputText, setInputText] = useState('')
  const [mediaPickerType, setMediaPickerType] = useState<'attachments' | 'stickers' | null>(null)
  const [stickerTab, setStickerTab] = useState<'global' | 'personal' | 'recent'>('recent')
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [recentStickers, setRecentStickers] = useState<{id: string, url: string}[]>([])

  useEffect(() => {
    const stored = localStorage.getItem('pifa_recent_stickers')
    if (stored) {
      try { setRecentStickers(JSON.parse(stored)) } catch (e) {}
    }
  }, [])

  const addToRecents = (url: string) => {
    setRecentStickers(prev => {
      const filtered = prev.filter(s => s.url !== url)
      const next = [{ id: Date.now().toString(), url }, ...filtered].slice(0, 15)
      localStorage.setItem('pifa_recent_stickers', JSON.stringify(next))
      return next
    })
  }
  const [mentionFilter, setMentionFilter] = useState('')
  const [sending, setSending] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim() || sending) return
    setSending(true)
    await onSendMessage(inputText.trim())
    setInputText('')
    setSending(false)
    setShowMentionMenu(false)
  }

  return (
    <div className="px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] z-30 bg-[#0A0A0A] border-t border-white/5">
      <AnimatePresence>
        {pendingMedia && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={{ duration: 0.15 }} className="mb-3 p-3 bg-[#111111] border border-[#00FF85]/30 rounded-xl relative flex items-center gap-4">
            <div className="w-16 h-16 rounded-lg overflow-hidden border border-white/10 bg-black/50">
              {pendingMedia.type === 'image' ? <img src={pendingMedia.url} className="w-full h-full object-cover" /> : <Film className="w-full h-full p-4 text-[#00FF85]" />}
            </div>
            <div className="flex-1">
              <p className="text-[9px] font-black text-[#00FF85] uppercase tracking-widest mb-1">Adjunto listo para enviar</p>
              <p className="text-[8px] text-white/40 uppercase tracking-tighter italic">Puedes añadir un mensaje antes de enviar</p>
            </div>
            <button onClick={() => setPendingMedia(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X className="w-4 h-4 text-white/40" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {replyingTo && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={{ duration: 0.15 }} className="mb-3 p-3 bg-[#111111] border border-white/10 rounded-xl relative flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Reply className="w-3 h-3 text-[#00FF85]" />
                <span className="text-[9px] font-black text-[#00FF85] uppercase tracking-widest">Respondiendo a {replyingTo.user?.full_name}</span>
              </div>
              <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-white/5 rounded-full transition-colors"><X className="w-3 h-3 text-white/40" /></button>
            </div>
            <p className="text-xs text-white/40 truncate italic px-1">{replyingTo.content}</p>
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#00FF85] rounded-l-xl" />
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="relative flex items-center gap-3">
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*,video/*"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) {
              onUploadMedia(e, file.type.startsWith('video/') ? 'video' : 'image')
              setMediaPickerType(null)
            }
            e.target.value = '' // Reset para permitir subir el mismo archivo
          }} 
        />

        <div className="relative flex items-center">
          <button type="button" onClick={() => setMediaPickerType(mediaPickerType === 'attachments' ? null : 'attachments')} className="p-3.5 rounded-2xl bg-white/5 text-white/40 hover:text-[#00FF85] border border-white/5 transition-all active:scale-90">
            <Plus className={`w-5 h-5 transition-transform ${mediaPickerType === 'attachments' ? 'rotate-45' : ''}`} />
          </button>

          <AnimatePresence>
            {mediaPickerType === 'attachments' && (
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 5 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 5 }} transition={{ duration: 0.15 }} className="absolute bottom-full left-0 mb-3 bg-[#111111] border border-white/10 rounded-2xl p-2 shadow-2xl z-50 flex flex-col gap-2 min-w-[150px]">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-xl transition-colors text-left group">
                  <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400 group-hover:scale-110 transition-transform"><ImageIcon className="w-4 h-4" /></div>
                  <span className="text-[10px] font-black text-white/80 uppercase">Galería</span>
                </button>

                <button type="button" onClick={() => setMediaPickerType('stickers')} className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-xl transition-colors text-left group">
                  <div className="p-2 bg-[#00FF85]/20 rounded-lg text-[#00FF85] group-hover:scale-110 transition-transform"><Smile className="w-4 h-4" /></div>
                  <span className="text-[10px] font-black text-white/80 uppercase">Stickers</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex-1 relative group">
          <AnimatePresence>
            {mediaPickerType === 'stickers' && (
              <motion.div initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.15 }} className="absolute bottom-full left-0 w-full mb-4 bg-[#111111] border border-white/10 rounded-2xl overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.8)] z-50 flex flex-col h-80">
                <div className="px-4 py-3 bg-white/5 border-b border-white/5 flex items-center justify-between">
                  <div className="flex gap-4">
                    <button type="button" onClick={() => setStickerTab('recent')} className={`text-[10px] font-black uppercase tracking-widest pb-1 ${stickerTab === 'recent' ? 'text-[#00FF85] border-b-2 border-[#00FF85]' : 'text-white/40'}`}><History className="w-3.5 h-3.5 inline-block -mt-0.5 mr-1" />Recientes</button>
                    <button type="button" onClick={() => setStickerTab('global')} className={`text-[10px] font-black uppercase tracking-widest pb-1 ${stickerTab === 'global' ? 'text-[#00FF85] border-b-2 border-[#00FF85]' : 'text-white/40'}`}>Mundial</button>
                    <button type="button" onClick={() => setStickerTab('personal')} className={`text-[10px] font-black uppercase tracking-widest pb-1 ${stickerTab === 'personal' ? 'text-[#00FF85] border-b-2 border-[#00FF85]' : 'text-white/40'}`}>Favoritos</button>
                  </div>
                  <button onClick={() => setMediaPickerType(null)}><X className="w-4 h-4 text-white/20" /></button>
                </div>
                <div className="flex-1 p-4 overflow-y-auto grid grid-cols-4 gap-4 custom-scrollbar">
                  <button type="button" onClick={() => {
                    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
                    input.onchange = (ev: any) => { if(ev.target.files[0]) { onUploadMedia(ev, 'sticker'); setMediaPickerType(null); } }; input.click();
                  }} className="aspect-square rounded-xl border-2 border-dashed border-white/5 flex items-center justify-center text-white/20 hover:text-[#00FF85]"><Plus className="w-6 h-6" /></button>
                  {stickerTab === 'recent' && recentStickers.map((st: any) => (
                    <button key={st.id} type="button" onClick={() => { onSendMediaMessage(st.url, 'sticker'); addToRecents(st.url); setMediaPickerType(null); }} className="aspect-square hover:scale-110 transition-transform relative"><img src={st.url} className="w-full h-full object-contain relative z-10" /></button>
                  ))}
                  {stickerTab === 'global' && officialStickers.map((st: any) => (
                    <button key={st.id} type="button" onClick={() => { onSendMediaMessage(st.url, 'sticker'); addToRecents(st.url); setMediaPickerType(null); }} className="aspect-square hover:scale-110 transition-transform relative"><img src={st.url} className="w-full h-full object-contain relative z-10" /></button>
                  ))}
                  {stickerTab === 'personal' && myStickers.map((st: any) => (
                    <div key={st.id} className="relative group/stk aspect-square">
                      <button type="button" onClick={() => { onSendMediaMessage(st.url, 'sticker'); addToRecents(st.url); setMediaPickerType(null); }} onContextMenu={(e) => { e.preventDefault(); if(window.confirm('¿Eliminar sticker de favoritos?')) { if(onRemoveSticker) onRemoveSticker(st.id); } }} className="w-full h-full hover:scale-110 transition-transform relative"><img src={st.url} className="w-full h-full object-contain relative z-10 pointer-events-none" /></button>
                      <button onClick={(e) => { e.stopPropagation(); if (window.confirm('¿Eliminar sticker de favoritos?')) { if (onRemoveSticker) onRemoveSticker(st.id); } }} className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full hidden md:flex items-center justify-center opacity-0 group-hover/stk:opacity-100 transition-opacity z-30 shadow-lg"><Trash2 className="w-3 h-3 text-white pointer-events-none" /></button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showMentionMenu && (
              <motion.div initial={{ opacity: 0, y: 5, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5, scale: 0.98 }} transition={{ duration: 0.15 }} className="absolute bottom-full left-0 w-full mb-3 bg-[#111111] border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-50">
                <div className="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between"><span className="text-[8px] font-black uppercase text-white/40">Mencionar DT</span><AtSign className="w-3 h-3 text-[#00FF85]" /></div>
                <div className="max-h-48 overflow-y-auto">
                  {('@todos'.includes(mentionFilter.toLowerCase()) || mentionFilter === '') && (
                    <button type="button" onClick={() => { const words = inputText.split(' '); words[words.length - 1] = '@todos '; setInputText(words.join(' ')); setShowMentionMenu(false); }} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#00FF85]/10 border-b border-white/5 group">
                      <div className="w-8 h-8 rounded-lg bg-[#00FF85]/20 flex items-center justify-center"><Users className="w-4 h-4 text-[#00FF85]" /></div>
                      <div className="text-left"><p className="text-[10px] font-black text-white group-hover:text-[#00FF85]">@todos</p></div>
                    </button>
                  )}
                  {allDTs.filter((dt: any) => dt.club?.name?.toLowerCase().includes(mentionFilter.toLowerCase())).map((dt: any) => (
                    <button key={dt.id} type="button" onClick={() => { const words = inputText.split(' '); words[words.length - 1] = `@${dt.club?.name} `; setInputText(words.join(' ')); setShowMentionMenu(false); }} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#00FF85]/10 border-b border-white/5 last:border-0 group">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center p-1">{dt.club?.shield_url ? <img src={dt.club.shield_url} className="w-full h-full object-contain" /> : <Shield className="w-4 h-4 text-white/20" />}</div>
                      <div className="text-left"><p className="text-[10px] font-black text-white group-hover:text-[#00FF85]">@{dt.club?.name}</p></div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <input id="chat-message-input" type="text" value={inputText} onChange={(e) => {
            const val = e.target.value; setInputText(val);
            const words = val.split(' '); const lastWord = words[words.length - 1];
            if (lastWord.startsWith('@')) { setShowMentionMenu(true); setMentionFilter(lastWord.slice(1)); } else { setShowMentionMenu(false); }
            
            // Typing logic
            if (val.trim()) {
              onTyping(true)
              const timeoutId = (window as any).typingTimeout
              if (timeoutId) clearTimeout(timeoutId)
              ;(window as any).typingTimeout = setTimeout(() => onTyping(false), 2000)
            } else {
              onTyping(false)
            }
          }} placeholder="Envía un comunicado al vestuario..." className="w-full bg-[#141414]/90 backdrop-blur-xl border border-white/10 px-5 py-4 rounded-2xl text-[11px] font-bold text-white focus:outline-none focus:border-[#00FF85]/40 transition-all shadow-2xl" />
        </div>
        <button type="submit" disabled={!inputText.trim() || sending} className={`p-3.5 rounded-2xl transition-all active:scale-90 ${inputText.trim() && !sending ? 'bg-[#00FF85] text-[#0A0A0A] shadow-lg' : 'bg-white/5 text-white/10'}`}>
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 fill-current" />}
        </button>
      </form>
    </div>
  )
})

const PresenceIndicator = React.memo(({ onlineUsers, typingUsers }: any) => {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00FF85] animate-pulse" />
          <span className="text-[7.5px] font-black text-[#00FF85] uppercase tracking-widest">{onlineUsers.length} DTs</span>
        </div>
        {onlineUsers.length > 0 && (
          <div className="flex -space-x-1.5 items-center">
            {onlineUsers.slice(0, 4).map((u: any) => (
              <motion.div 
                initial={{ scale: 0, x: -10 }}
                animate={{ scale: 1, x: 0 }}
                key={u.user_id}
                className="w-4 h-4 rounded-full bg-[#0A0A0A] border border-white/10 p-0.5 shadow-lg overflow-hidden"
              >
                {u.shield_url ? (
                  <img src={u.shield_url} className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full bg-[#00FF85]/20 flex items-center justify-center text-[5px] text-[#00FF85] font-black">{u.full_name?.[0]}</div>
                )}
              </motion.div>
            ))}
            {onlineUsers.length > 4 && (
              <div className="w-4 h-4 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                <span className="text-[5px] font-black text-white/40">+{onlineUsers.length - 4}</span>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Indicador de escritura movido al input */}
    </div>
  )
})

export function GlobalChat({ user, club, onBack }: { user: User; club: Club | null; onBack?: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [readStatuses, setReadStatuses] = useState<ReadStatus[]>([])

  const [bgImage, setBgImage] = useState<string | null>(null)
  
  useEffect(() => {
    const savedBg = localStorage.getItem('pifa_chat_bg')
    if (savedBg !== null) setBgImage(savedBg)
  }, [])

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height
        const maxSize = 800
        
        if (width > height && width > maxSize) {
          height *= maxSize / width
          width = maxSize
        } else if (height > maxSize) {
          width *= maxSize / height
          height = maxSize
        }
        
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)
        
        const compressed = canvas.toDataURL('image/jpeg', 0.6)
        
        setBgImage(compressed)
        try {
          localStorage.setItem('pifa_chat_bg', compressed)
          toast.success('Fondo actualizado')
        } catch (err) {
          toast.error('La imagen es demasiado grande. Intenta con otra.')
        }
      }
      img.src = result
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleRemoveSticker = async (id: string) => {
    const { error } = await supabase.from('user_stickers').delete().eq('id', id)
    if (!error) {
      setMyStickers(prev => prev.filter(s => s.id !== id))
      toast.success('Sticker eliminado de favoritos')
    }
  }
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [newMessagesCount, setNewMessagesCount] = useState(0)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null)
  
  // -- ESTADOS MULTIMEDIA & STICKERS --
  const [myStickers, setMyStickers] = useState<{id: string, url: string}[]>([])
  const [pendingMedia, setPendingMedia] = useState<{url: string, type: 'image' | 'video'} | null>(null)
  const [activeMediaUrl, setActiveMediaUrl] = useState<string | null>(null)
  const [stickerToConfirm, setStickerToConfirm] = useState<string | null>(null)

  const officialStickers = [
    { id: 'st-cup', url: '/stickers/pifa_sticker_trophy_1775954266532.png' },
    { id: 'st-ball', url: '/stickers/pifa_sticker_ball_fire_1775954283937.png' },
    { id: 'st-red', url: '/stickers/pifa_sticker_red_card_1775954295329.png' },
    { id: 'st-dt', url: '/stickers/pifa_sticker_manager_celebrate_1775954306296.png' }
  ]
  
  const [allDTs, setAllDTs] = useState<User[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const bgInputRef = useRef<HTMLInputElement>(null)
  const [onlineUsers, setOnlineUsers] = useState<any[]>([])
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string, expiresAt: number }>>({})
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)


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
    
    const { error } = await supabase
      .from('global_chat_read_status')
      .upsert({
        user_id: user.id,
        club_id: club.id,
        last_read_message_id: targetId,
        last_read_at: now,
        updated_at: now
      }, { onConflict: 'user_id,club_id' })

    if (error) {
      console.error('❌ ERROR CRÍTICO AL GUARDAR VISTO:', error.message, error.details, error.hint)
    } else {
      console.log('✅ Visto guardado correctamente para:', user.id)
    }
    
    // Notificar localmente para limpiar el badge al instante
    window.dispatchEvent(new CustomEvent('pifa_chat_read'))
  }, [club?.id, user?.id])

  const fetchReadStatuses = useCallback(async () => {
    // Consulta ultra-simple y robusta. Ya no dependemos de joins para las fechas.
    const { data, error } = await supabase
      .from('global_chat_read_status')
      .select('*, club:clubs(shield_url)')
    
    if (error) {
      console.error('❌ ERROR AL RECUPERAR VISTOS:', error)
    } else if (data) {
      console.log('📡 Vistos recibidos del servidor:', data.length)
      if (data.length > 0) console.table(data.map(d => ({ user: d.user_id, club: d.club_id, msg: d.last_read_message_id })))
      setReadStatuses(data)
    }
  }, [])

  // -- PROCESAMIENTO DE ESTADOS DE LECTURA (Optimización para Receipts) --
  const clubReadStats = useMemo(() => {
    const stats: Record<string, { lastReadAt: number, shield_url: string | null }> = {}
    const msgMap = new Map(messages.map(m => [m.id, new Date(m.created_at).getTime()]))
    
    readStatuses.forEach(rs => {
      const msgTime = msgMap.get(rs.last_read_message_id)
      if (msgTime) {
        stats[rs.club_id] = {
          lastReadAt: msgTime,
          shield_url: rs.club?.shield_url || null
        }
      }
    })
    return stats
  }, [readStatuses, messages])


  // -- EFECTOS --

  const fetchMessagesPaginated = useCallback(async (beforeTimestamp?: string) => {
    let query = supabase
      .from('global_chat_messages')
      .select(`
        id, user_id, club_id, content, created_at, reply_to_id, media_url, media_type,
        user:user_id(full_name, username),
        club:club_id(name, shield_url),
        reply_to:reply_to_id(content, user:user_id(full_name))
      `)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (beforeTimestamp) {
      query = query.lt('created_at', beforeTimestamp)
    }

    const { data, error } = await query
    if (error) {
      console.error('❌ Error fetching chat messages:', error.message, error.details, error.hint)
      toast.error('Error de conexión al chat')
    }
    return (data || []).reverse()
  }, [])

  const handleCatchUp = useCallback(async () => {
    if (messages.length === 0) return

    const lastMsg = messages[messages.length - 1]
    const { data: missedMsgs, error } = await supabase
      .from('global_chat_messages')
      .select(`
        id, user_id, club_id, content, created_at, reply_to_id, media_url, media_type,
        user:user_id(full_name, username),
        club:club_id(name, shield_url),
        reply_to:reply_to_id(content, user:user_id(full_name))
      `)
      .gt('created_at', lastMsg.created_at)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('❌ Error al recuperar mensajes perdidos:', error.message, error.details)
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

    fetchReadStatuses()
  }, [messages, fetchReadStatuses, updateMyReadStatus])

  useEffect(() => {
    let isMounted = true
    const init = async () => {
      try {
        console.log('🏁 [Chat:Init] Iniciando carga de datos...')
        
        // Cargar mensajes con catch individual
        const initialMessages = await fetchMessagesPaginated().catch(err => {
          console.error('❌ [Chat:Init] Fallo crítico al cargar mensajes:', err)
          return []
        })

        if (!isMounted) return
        setMessages(initialMessages)
        
        // Cargar otros datos en paralelo pero sin bloquear el flujo principal si fallan
        Promise.all([
          supabase.from('users').select('*, club:clubs(name)').not('club_id', 'is', null),
          supabase.from('user_stickers').select('*').eq('user_id', user.id)
        ]).then(([{ data: usersData }, { data: stickersData }]) => {
          if (!isMounted) return
          if (usersData) setAllDTs(usersData as User[])
          if (stickersData) setMyStickers(stickersData)
          console.log('✅ [Chat:Init] Datos secundarios cargados')
        }).catch(err => console.warn('⚠️ [Chat:Init] Error en datos secundarios:', err))

        await fetchReadStatuses()
        setLoading(false)

        if (initialMessages.length < PAGE_SIZE) setHasMore(false)
        if (initialMessages.length > 0) {
          const lastMsgId = initialMessages[initialMessages.length - 1].id
          await updateMyReadStatus(lastMsgId)
        }
        
        setTimeout(() => scrollToBottom('auto'), 100)
      } catch (err) {
        console.error('❌ [Chat:Init] Error no controlado en init:', err)
        setLoading(false)
      }
    }

    init()
    return () => { isMounted = false }
  }, [user?.id, club?.id, fetchMessagesPaginated, fetchReadStatuses, updateMyReadStatus])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleCatchUp()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [handleCatchUp])

  useEffect(() => {
    const chatChannel = supabase
      .channel('chat-main')
      .on('presence', { event: 'sync' }, () => {
        const state = chatChannel.presenceState()
        const presences = Object.values(state).flat() as any[]
        
        // Dedupilar por user_id
        const uniqueUsers: any[] = []
        const seenIds = new Set()
        
        presences.forEach(p => {
          if (!seenIds.has(p.user_id)) {
            seenIds.add(p.user_id)
            uniqueUsers.push(p)
          }
        })
        
        setOnlineUsers(uniqueUsers)
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId === user.id) return
        setTypingUsers(prev => ({
          ...prev,
          [payload.userId]: { name: payload.name, expiresAt: Date.now() + 3000 }
        }))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_chat_messages' }, async (payload) => {
        console.log('✨ [Realtime] Nuevo mensaje detectado (INSERT):', payload.new.id)
        const { data: newMsg, error: newMsgError } = await supabase
          .from('global_chat_messages')
          .select('id, user_id, club_id, content, created_at, reply_to_id, media_url, media_type, user:user_id(full_name, username), club:club_id(name, shield_url), reply_to:reply_to_id(content, user:user_id(full_name))')
          .eq('id', payload.new.id)
          .single()

        if (newMsgError) {
          console.error('❌ [Realtime] Error al re-obtener mensaje insertado:', newMsgError)
          return
        }

        if (newMsg) {
          setMessages(prev => {
            if (prev.find(m => m.id === newMsg.id)) {
              console.log('ℹ️ [Realtime] Mensaje ya existe (de-duplicación aplicada)')
              return prev
            }
            
            if (!isAtBottomRef.current) {
              setNewMessagesCount(c => c + 1)
            } else {
              updateMyReadStatus(newMsg.id)
              requestAnimationFrame(() => scrollToBottom('smooth'))
            }
            return [...prev, newMsg]
          })
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'global_chat_messages' }, async (payload: any) => {
        console.log('🔄 [PAYLOAD_DEBUG] UPDATE:', payload)
        
        // Actualización inmediata del contenido basado en el payload para evitar lag de red
        if (payload.new && payload.new.id) {
          setMessages(prev => prev.map(m => {
            if (m.id === payload.new.id) {
              const isDeleted = payload.new.content === 'Este mensaje ha sido borrado'
              return { 
                ...m, 
                content: payload.new.content,
                _is_edited: !isDeleted && payload.new.content.includes('\u200B')
              }
            }
            return m
          }))
        }

        // Re-fetch como respaldo para garantizar metadatos completos (joins)
        const { data: updatedMsg } = await supabase
          .from('global_chat_messages')
          .select('id, user_id, club_id, content, created_at, reply_to_id, media_url, media_type, user:user_id(full_name, username), club:club_id(name, shield_url), reply_to:reply_to_id(content, user:user_id(full_name))')
          .eq('id', payload.new.id)
          .single()

        if (updatedMsg) {
          setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg, _is_edited: updatedMsg.content !== m.content } : m))
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'global_chat_messages' }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id))
      })
      .subscribe(async (status, err) => {
        console.log(`📡 [Realtime: chat-main] Estado: ${status}`, err || '')
        if (status === 'SUBSCRIBED') {
          console.log('✅ [Realtime] Suscrito con éxito al canal global')
          await chatChannel.track({
            user_id: user.id,
            full_name: user.full_name || user.username || 'DT',
            shield_url: club?.shield_url || null,
            online_at: new Date().toISOString()
          })
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('❌ [Realtime] Error de canal:', err)
        }
      })

    const readChannel = supabase
      .channel('chat-reads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'global_chat_read_status' }, () => {
        fetchReadStatuses()
      })
      .subscribe((status) => {
        console.log(`📡 [Realtime: chat-reads] Estado: ${status}`)
      })

    const stickersChannel = supabase
      .channel('user-stickers')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'user_stickers',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        setMyStickers(prev => {
          if (prev.find(s => s.id === payload.new.id)) return prev
          return [...prev, payload.new as any]
        })
      })
      .subscribe((status) => {
        console.log(`📡 [Realtime: stickers] Estado: ${status}`)
      })

    return () => {
      console.log('🔌 [Realtime] Limpiando canales...')
      supabase.removeChannel(chatChannel)
      supabase.removeChannel(readChannel)
      supabase.removeChannel(stickersChannel)
    }
  }, [fetchReadStatuses, updateMyReadStatus, user.id, club?.id])

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

    if (scrollTop < 100 && hasMore && !loadingMore) {
      handleLoadMore()
    }
  }

  // Limpiar usuarios escribiendo que han expirado
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setTypingUsers(prev => {
        const next = { ...prev }
        let changed = false
        Object.entries(next).forEach(([id, data]) => {
          if (data.expiresAt < now) {
            delete next[id]
            changed = true
          }
        })
        return changed ? next : prev
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  const handleTyping = (isTyping: boolean) => {
    const channel = supabase.channel('chat-main')
    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: user.id, name: user.full_name || user.username || 'DT', isTyping }
    })
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

  const handleFileUpload = async (e: any, type: 'image' | 'video' | 'sticker') => {
    const file = e.target?.files?.[0] || (e.type === 'custom' ? e.target?.files?.[0] : null)
    if (!file) return


    // setUploadingMedia(true) - Removido ya que se usa toast para feedback
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
        setPendingMedia({ url: publicUrl, type: type as any })
        toast.success('Archivo listo para enviar', { id: tid })
      }
    } catch (err) {
      console.error('Upload error:', err)
      toast.error('Error al subir archivo', { id: tid })
    } finally {
      // El estado del picker se maneja ahora en ChatInputArea
    }
  }

  const sendMediaMessage = async (url: string, type: 'image' | 'video' | 'sticker') => {
    const { data: newMsg, error } = await supabase
      .from('global_chat_messages')
      .insert({ 
        user_id: user.id, 
        club_id: club?.id || null, 
        content: type === 'sticker' ? 'Sent a sticker' : `Sent a ${type}`,
        media_url: url,
        media_type: type,
        reply_to_id: replyingTo?.id || null
      })
      .select('*, user:users(full_name, username), club:clubs(name, shield_url), reply_to:reply_to_id(content, user:users(full_name))')
      .single()
    
    if (newMsg) {
      setMessages(prev => {
        if (prev.find(m => m.id === newMsg.id)) return prev
        updateMyReadStatus(newMsg.id)
        requestAnimationFrame(() => scrollToBottom('smooth'))
        return [...prev, newMsg]
      })
    }
    setReplyingTo(null)

    sendPushToAll(
      `🖼️ ${club?.name || user.full_name}`,
      type === 'sticker' ? 'Envió un sticker' : `Envió una ${type === 'image' ? 'imagen' : 'video'}`,
      { type: 'chat_media' },
      [user.id, ...onlineUsers.map(u => u.user_id)]
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

  const handleEditMessage = async (id: string, newContent: string) => {
    // Truco: Usamos un marcador invisible (\u200B) para persistir el estado "Editado" sin columna extra
    const contentWithMarker = newContent.includes('\u200B') ? newContent : newContent + '\u200B'
    
    // -- ACTUALIZACION OPTIMISTA INMEDIATA --
    setMessages(prev => prev.map(m => m.id === id ? { ...m, content: contentWithMarker } : m))

    const { error } = await supabase
      .from('global_chat_messages')
      .update({ content: contentWithMarker })
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('❌ Error de Supabase al editar:', error.message)
      toast.error(`Error al editar: ${error.message}`)
    } else {
      toast.success('Mensaje editado')
    }
  }

  const handleDeleteMessage = async (id: string) => {
    // -- ACTUALIZACION OPTIMISTA INMEDIATA --
    const deletedPlaceholder = 'Este mensaje ha sido borrado'
    setMessages(prev => prev.map(m => m.id === id ? { ...m, content: deletedPlaceholder } : m))

    // Soft delete: reemplazamos contenido en lugar de eliminar registro
    const { error } = await supabase
      .from('global_chat_messages')
      .update({ content: deletedPlaceholder })
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('❌ Error al borrar:', error.message)
      toast.error('No se pudo borrar el mensaje')
    } else {
      toast.success('Mensaje borrado')
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

  const scrollToMessage = useCallback((id: string) => {
    const el = document.getElementById(`msg-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedMessageId(id)
      setTimeout(() => setHighlightedMessageId(null), 5000)
    }
  }, [])

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
    <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-black">
      <input 
        type="file" 
        accept="image/*" 
        className="hidden" 
        ref={bgInputRef} 
        onChange={handleBgUpload} 
      />
      <div className="absolute inset-0 bg-repeat bg-fixed pointer-events-none z-0" style={{ backgroundImage: bgImage ? `url(${bgImage})` : 'url(https://i.pinimg.com/originals/8c/98/99/8c98994518b575bfd8c949e91d20548b.jpg)', backgroundSize: bgImage ? 'cover' : '400px', opacity: bgImage ? 0.3 : 0.04 }} />
      
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#00FF85]/20 bg-[#0A0A0A]/80 backdrop-blur-xl z-20 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-2 text-[#6A6C6E] hover:text-[#00FF85] hover:bg-white/5 rounded-full transition-all active:scale-95 group">
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
            </button>
          )}
          <div className="relative">
            <div className="absolute inset-0 bg-[#00FF85] blur-[10px] opacity-20 rounded-xl" />
            <div className="w-11 h-11 bg-gradient-to-br from-[#1A1A1A] to-[#0A0A0A] rounded-[14px] border border-white/10 flex items-center justify-center shadow-inner relative z-10">
              <Users className="w-5 h-5 text-[#00FF85]" />
            </div>
          </div>
          <div className="flex flex-col justify-center ml-1">
            <h2 className="text-[15px] font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-[#A0A2A4] leading-tight mb-0.5 uppercase tracking-widest">
              Comunidad PIFA
            </h2>
            <PresenceIndicator onlineUsers={onlineUsers} typingUsers={typingUsers} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => {
              setLoading(true)
              fetchMessagesPaginated().then(msgs => {
                setMessages(msgs)
                setLoading(false)
                toast.success('Chat actualizado')
              }).catch(() => {
                setLoading(false)
                toast.error('Error al actualizar')
              })
            }} 
            className="p-2.5 text-[#6A6C6E] hover:text-[#00FF85] hover:bg-[#00FF85]/10 rounded-full transition-all active:scale-95 flex items-center justify-center group" 
            title="Refrescar Chat"
          >
             <History className="w-5 h-5 group-hover:rotate-[-45deg] transition-transform" />
          </button>
          {bgImage && (
            <button onClick={() => { setBgImage(null); localStorage.removeItem('pifa_chat_bg'); }} className="p-2 text-[#6A6C6E] hover:text-red-500 hover:bg-white/5 rounded-full transition-all active:scale-95 flex items-center justify-center group" title="Volver al fondo oscuro">
               <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </button>
          )}
          <button onClick={() => bgInputRef.current?.click()} className="p-2.5 text-[#6A6C6E] hover:text-[#00FF85] hover:bg-[#00FF85]/10 rounded-full transition-all active:scale-95 flex items-center justify-center group" title="Cambiar Fondo">
             <ImagePlus className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden pt-4 pb-24 px-4 custom-scrollbar flex flex-col"
      >
        {hasMore && loadingMore && (
           <div className="self-center py-4"><Loader2 className="w-5 h-5 text-[#00FF85] opacity-50 animate-spin" /></div>
        )}

        {messages.map((msg, idx) => {
          const isOwn = msg.user_id === user.id
          const prevMsg = messages[idx-1]
          const isFirstInGroup = !prevMsg || prevMsg.user_id !== msg.user_id
          
          const showFullDate = !prevMsg || 
            format(new Date(msg.created_at), 'yyyy-MM-dd') !== format(new Date(prevMsg.created_at), 'yyyy-MM-dd')

          const msgTime = new Date(msg.created_at).getTime()
          const readers = Object.entries(clubReadStats)
            .filter(([idClub, stat]) => 
              idClub !== club?.id && 
              idClub !== msg.club_id && 
              stat.lastReadAt >= msgTime
            )
            .map(([idClub, stat]) => ({
              club_id: idClub,
              shield_url: stat.shield_url
            }))

          return (
            <MessageItem
              key={msg.id}
              msg={msg}
              user={user}
              club={club}
              isOwn={isOwn}
              isFirstInGroup={isFirstInGroup}
              showFullDate={showFullDate}
              readers={readers}
              onReply={(msg) => { setReplyingTo(msg); setTimeout(() => document.getElementById('chat-message-input')?.focus(), 50); }}
              onImageClick={setActiveMediaUrl}
              onStickerClick={setStickerToConfirm}
              isHighlighted={highlightedMessageId === msg.id}
              onScrollToReply={scrollToMessage}
              onEdit={handleEditMessage}
              onDelete={handleDeleteMessage}
            />
          )
        })}
      </div>

      <AnimatePresence>
        {!isAtBottom && newMessagesCount > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            transition={{ duration: 0.15 }}
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
      
      <div className="px-4 pb-1">
        <AnimatePresence mode="wait">
          {Object.values(typingUsers).length > 0 && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-1.5 self-start px-1 inline-flex w-max"
            >
              <div className="flex gap-0.5 items-center mt-0.5">
                <span className="w-1 h-1 bg-[#00FF85] rounded-full animate-pulse" />
                <span className="w-1 h-1 bg-[#00FF85] rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-[#00FF85] rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-[10px] font-semibold text-white/50 italic capitalize">
                {Object.values(typingUsers).length === 1 
                  ? `${(Object.values(typingUsers)[0] as any).name?.toLowerCase()} está escribiendo...` 
                  : `${Object.values(typingUsers).length} personas escribiendo...`
                }
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ChatInputArea
        onSendMessage={async (text: string) => {
          const { data: newMsg } = await supabase
            .from('global_chat_messages')
            .insert({ 
              user_id: user.id, 
              club_id: club?.id || null, 
              content: text.trim(),
              reply_to_id: replyingTo?.id || null,
              media_url: pendingMedia?.url || null,
              media_type: pendingMedia?.type || null
            })
            .select('id, user_id, club_id, content, created_at, reply_to_id, media_url, media_type, user:user_id(full_name, username), club:club_id(name, shield_url), reply_to:reply_to_id(content, user:user_id(full_name))')
            .single()

          if (newMsg) {
            setMessages(prev => {
              if (prev.find(m => m.id === newMsg.id)) return prev
              updateMyReadStatus(newMsg.id)
              requestAnimationFrame(() => scrollToBottom('smooth'))
              return [...prev, newMsg]
            })
          }

          setReplyingTo(null)
          setPendingMedia(null)
          
          const pushTitle = pendingMedia ? `🖼️ ${club?.name || user.full_name}` : `💬 ${club?.name || user.full_name}`
          const pushBody = pendingMedia ? `Envió un archivo: ${text.trim() || ''}` : text.trim()
          const hasEveryone = text.trim().toLowerCase().includes('@todos')
          const mentionedClubs = allDTs.filter(dt => dt.club?.name && text.trim().toLowerCase().includes(`@${dt.club.name.toLowerCase()}`))

            if (hasEveryone) {
              sendPushToAll(`📢 @TODOS: Mensaje de ${club?.name || user.full_name}`, pushBody, { type: 'chat_mention_all' }, [user.id, ...onlineUsers.map(u => u.user_id)])
            } else if (mentionedClubs.length > 0) {
              const onlineIds = onlineUsers.map(u => u.user_id)
              mentionedClubs.forEach(dt => {
                if (dt.club_id && dt.club_id !== club?.id && !onlineIds.includes(dt.id)) {
                  sendPushToClub(dt.club_id, `🔔 ¡Has sido etiquetado!`, `${club?.name || user.full_name}: ${pushBody}`, { type: 'chat_mention_direct' })
                }
              })
              sendPushToAll(pushTitle, pushBody, { type: 'chat_message' }, [user.id, ...onlineIds])
            } else {
              sendPushToAll(pushTitle, pushBody, { type: 'chat_message' }, [user.id, ...onlineUsers.map(u => u.user_id)])
            }
          }}
          onUploadMedia={handleFileUpload}
          user={user}
          club={club}
          allDTs={allDTs}
          myStickers={myStickers}
          officialStickers={officialStickers}
          replyingTo={replyingTo}
          setReplyingTo={setReplyingTo}
          pendingMedia={pendingMedia}
          setPendingMedia={setPendingMedia}
          onSendMediaMessage={sendMediaMessage}
          onTyping={handleTyping}
          onRemoveSticker={handleRemoveSticker}
        />

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
