'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Bell, X, Check, XCircle, RefreshCw, Info, Trash2, DollarSign, Wallet, ShieldCheck, Activity, AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { Notification } from '@/lib/types'
import { handleOfferResponse } from '@/lib/market-engine'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface NotificationsDrawerProps {
  clubId: string
  isOpen: boolean
  onClose: () => void
  onActionComplete?: () => void
}

const getTypeStyle = (type: string) => {
  switch (type) {
    case 'offer_received': return { icon: <DollarSign className="w-4 h-4" />, color: 'text-amber-400', bg: 'bg-amber-400/10' }
    case 'offer_countered': return { icon: <RefreshCw className="w-4 h-4" />, color: 'text-blue-400', bg: 'bg-blue-400/10' }
    case 'transfer_complete': return { icon: <ShieldCheck className="w-4 h-4" />, color: 'text-[#00FF85]', bg: 'bg-[#00FF85]/10' }
    case 'offer_rejected': return { icon: <XCircle className="w-4 h-4" />, color: 'text-red-400', bg: 'bg-red-400/10' }
    case 'injury': return { icon: <Activity className="w-4 h-4" />, color: 'text-red-500', bg: 'bg-red-500/10' }
    case 'red_card': return { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-red-600', bg: 'bg-red-600/10' }
    case 'transfer_window': return { icon: <ShieldCheck className="w-4 h-4" />, color: 'text-emerald-400', bg: 'bg-emerald-400/10' }
    case 'contract_expired': return { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-amber-400', bg: 'bg-amber-400/10' }
    case 'player_email': return { icon: <Bell className="w-4 h-4" />, color: 'text-rose-400', bg: 'bg-rose-400/10' }
    case 'player_seeking_transfer': return { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-orange-400', bg: 'bg-orange-400/10' }
    case 'player_unhappy': return { icon: <Activity className="w-4 h-4" />, color: 'text-amber-500', bg: 'bg-amber-500/10' }
    default: return { icon: <Bell className="w-4 h-4" />, color: 'text-white/60', bg: 'bg-white/5' }
  }
}

// Sub-componente para cada notificación individual (Memoizado para rendimiento)
const NotificationItem = React.memo(({ 
  notif, 
  onAction, 
  onDelete, 
  onMarkRead,
  isProcessing,
  activeCounterId,
  setActiveCounterId,
  counterAmount,
  setCounterAmount
}: { 
  notif: Notification, 
  onAction: (n: Notification, r: 'accept' | 'reject' | 'counter') => void,
  onDelete: (id: string) => void,
  onMarkRead: (id: string) => void,
  isProcessing: boolean,
  activeCounterId: string | null,
  setActiveCounterId: (id: string | null) => void,
  counterAmount: string,
  setCounterAmount: (val: string) => void
}) => {
  const style = useMemo(() => getTypeStyle(notif.type), [notif.type])

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden group p-5 rounded-[24px] border transition-all duration-300 ${
        notif.is_read 
          ? 'bg-[#121212]/40 border-white/[0.03]' 
          : 'bg-[#141414] border-[#00FF85]/20 shadow-[0_0_30px_rgba(0,255,133,0.03)]'
      }`}
    >
      <div className={`absolute -right-4 -bottom-4 opacity-[0.03] transform group-hover:scale-110 transition-transform duration-700 ${style.color}`}>
        <div className="w-32 h-32">{style.icon}</div>
      </div>

      <div className="flex items-start justify-between relative z-10">
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2 rounded-lg ${style.bg} ${style.color}`}>{style.icon}</div>
          <span className={`text-[9px] font-black uppercase tracking-widest ${style.color}`}>{notif.title}</span>
        </div>
        <button 
          onClick={() => onDelete(notif.id)} 
          className="w-7 h-7 bg-[#1A1A1A] hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-all duration-300 flex items-center justify-center border border-white/[0.03]"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="relative z-10 mb-4">
        <p className={`text-xs leading-relaxed ${notif.is_read ? 'text-[#6A6C6E]' : 'text-white/90'}`}>{notif.message}</p>
        {notif.data?.amount && (
          <div className="mt-3 flex items-center gap-2">
            <div className="h-[1px] flex-1 bg-gradient-to-r from-white/[0.05] to-transparent" />
            <span className="text-lg font-black text-[#00FF85] tracking-tighter">${notif.data.amount.toLocaleString()}</span>
          </div>
        )}
      </div>

      {!notif.is_read && (notif.type === 'offer_received' || notif.type === 'offer_countered') && (
        <div className="relative z-10 space-y-3 pt-2">
          {activeCounterId === notif.id ? (
            <div className="space-y-3 bg-[#0A0A0A] p-4 rounded-2xl border border-white/[0.05]">
              <div className="relative">
                <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#00FF85]" />
                <Input 
                  type="number" 
                  placeholder="MONTO DE CONTRAOFERTA..." 
                  value={counterAmount}
                  onChange={(e) => setCounterAmount(e.target.value)}
                  className="bg-[#141414] border-white/[0.05] text-[10px] font-bold h-10 pl-10 rounded-xl focus:ring-[#00FF85]/20 focus:border-[#00FF85] uppercase tracking-widest"
                />
              </div>
              <div className="flex gap-2">
                <button 
                  className="flex-1 bg-[#00FF85] text-[#0A0A0A] text-[9px] font-black rounded-xl h-10 shadow-[0_5px_15px_rgba(0,255,133,0.3)] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
                  onClick={() => onAction(notif, 'counter')}
                  disabled={isProcessing}
                >
                  {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'ENVIAR'}
                </button>
                <button 
                  className="flex-1 bg-transparent text-[#6A6C6E] text-[9px] font-bold hover:text-white rounded-xl h-10 uppercase tracking-widest transition-all"
                  onClick={() => setActiveCounterId(null)}
                >
                  CANCELAR
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <button 
                className="bg-[#00FF85] text-[#0A0A0A] text-[9px] font-black h-11 rounded-xl flex items-center justify-center gap-2 shadow-[0_5px_15px_rgba(0,255,133,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-widest disabled:opacity-50"
                onClick={() => onAction(notif, 'accept')}
                disabled={isProcessing}
              >
                {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" /> ACEPTAR</>}
              </button>
              <button 
                className="bg-white/5 text-white hover:bg-red-500 hover:text-white text-[9px] font-black h-11 rounded-xl flex items-center justify-center gap-2 transition-all border border-white/[0.05] uppercase tracking-widest disabled:opacity-50"
                onClick={() => onAction(notif, 'reject')}
                disabled={isProcessing}
              >
                <XCircle className="w-3.5 h-3.5" /> NO
              </button>
              <button 
                className="bg-[#1A1A1A] text-white hover:bg-[#2D2D2D] text-[9px] font-black h-11 rounded-xl flex items-center justify-center gap-2 transition-all border border-white/[0.05] uppercase tracking-widest disabled:opacity-50"
                onClick={() => setActiveCounterId(notif.id)}
                disabled={isProcessing}
              >
                 CONTRAR
              </button>
            </div>
          )}
        </div>
      )}
      
      {!notif.is_read && notif.type !== 'offer_received' && notif.type !== 'offer_countered' && (
        <button 
          className="w-full mt-4 py-2.5 bg-[#1A1A1A] text-[#6A6C6E] hover:text-[#00FF85] hover:bg-[#00FF85]/5 text-[9px] font-black uppercase tracking-[0.2em] rounded-xl transition-all border border-transparent hover:border-[#00FF85]/20 disabled:opacity-50"
          onClick={() => onMarkRead(notif.id)}
          disabled={isProcessing}
        >
          MARCAR COMO VISTO
        </button>
      )}
    </motion.div>
  )
})

NotificationItem.displayName = 'NotificationItem'

export function NotificationsDrawer({ clubId, isOpen, onClose, onActionComplete }: NotificationsDrawerProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [counterAmount, setCounterAmount] = useState<string>('')
  const [activeCounterId, setActiveCounterId] = useState<string | null>(null)
  const [isActionProcessing, setIsActionProcessing] = useState(false)

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })

    if (!error && data) setNotifications(data)
    if (!silent) setLoading(false)
  }, [clubId])

  useEffect(() => {
    if (!clubId || !isOpen) return

    fetchNotifications()

    const channel = supabase
      .channel('notifications_changes')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications',
        filter: `club_id=eq.${clubId}`
      }, () => {
        fetchNotifications(true) // Silent re-fetch to avoid spinner during use
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clubId, isOpen, fetchNotifications])

  const deleteNotification = useCallback(async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
    await supabase.from('notifications').delete().eq('id', id)
  }, [])

  const markAsRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  }, [])

  const actionResponse = useCallback(async (notif: Notification, response: 'accept' | 'reject' | 'counter') => {
    if (isActionProcessing) return
    setIsActionProcessing(true)
    
    try {
      if (response === 'counter') {
        if (!counterAmount || isNaN(Number(counterAmount))) {
          toast.error('Monto inválido')
          setIsActionProcessing(false)
          return
        }
        await handleOfferResponse(notif.data.offer_id, 'counter', Number(counterAmount))
        toast.success('Contraoferta enviada')
        setActiveCounterId(null)
        setCounterAmount('')
      } else {
        await handleOfferResponse(notif.data.offer_id, response)
        toast.success(response === 'accept' ? '¡Traspaso completado!' : 'Oferta rechazada')
      }
      
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n))
      
      Promise.all([
        supabase.from('notifications').update({ is_read: true }).eq('id', notif.id),
        onActionComplete ? onActionComplete() : Promise.resolve()
      ]).catch(err => console.error(err))

    } catch (err: any) {
      toast.error(err.message || 'Error al procesar')
    } finally {
      setIsActionProcessing(false)
    }
  }, [isActionProcessing, counterAmount, onActionComplete])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[90]"
            onClick={onClose}
          />

          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 right-0 w-full md:w-[450px] bg-[#0A0A0A] z-[100] border-l border-white/[0.05] shadow-[0_0_100px_rgba(0,0,0,1)] flex flex-col"
          >
            <div className="flex items-center justify-between p-6 bg-[#0E0E0E] border-b border-white/[0.05] pt-[max(4.5rem,env(safe-area-inset-top))]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#1A1A1A] border border-white/[0.05] flex items-center justify-center">
                  <Bell className="w-6 h-6 text-[#00FF85]" />
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase tracking-tighter text-white">Notificaciones</h2>
                  <p className="text-[10px] text-[#6A6C6E] font-bold uppercase tracking-widest">{notifications.length} registros</p>
                </div>
              </div>
              <button onClick={onClose} className="p-3 bg-[#1A1A1A] hover:bg-[#252525] rounded-xl transition-all border border-white/[0.05]">
                <X className="w-5 h-5 text-[#6A6C6E]" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-4 bg-gradient-to-b from-[#0A0A0A] to-[#0E0E0E] custom-scrollbar">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-32 text-[#6A6C6E]">
                  <RefreshCw className="w-8 h-8 animate-spin text-[#00FF85]/40 mb-6" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 text-[#6A6C6E] opacity-20">
                  <Info className="w-10 h-10 mb-8" />
                  <p className="text-[11px] font-black uppercase tracking-widest">Sin Notificaciones</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {notifications.map((notif) => (
                    <NotificationItem 
                      key={notif.id}
                      notif={notif}
                      onAction={actionResponse}
                      onDelete={deleteNotification}
                      onMarkRead={markAsRead}
                      isProcessing={isActionProcessing}
                      activeCounterId={activeCounterId}
                      setActiveCounterId={setActiveCounterId}
                      counterAmount={counterAmount}
                      setCounterAmount={setCounterAmount}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
