'use client'

import { useState, useEffect } from 'react'
import { Bell, X, Check, XCircle, RefreshCw, Info, Trash2, ArrowRight, DollarSign, Wallet, ShieldCheck, User as UserIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { Notification } from '@/lib/types'
import { handleOfferResponse } from '@/lib/market-engine'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface NotificationsDrawerProps {
  clubId: string
  isOpen: boolean
  onClose: () => void
  onActionComplete?: () => void
}

export function NotificationsDrawer({ clubId, isOpen, onClose, onActionComplete }: NotificationsDrawerProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [counterAmount, setCounterAmount] = useState<string>('')
  const [activeCounterId, setActiveCounterId] = useState<string | null>(null)

  useEffect(() => {
    if (!clubId) return

    fetchNotifications()

    // Realtime subscription
    const channel = supabase
      .channel('notifications_changes')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications',
        filter: `club_id=eq.${clubId}`
      }, () => {
        fetchNotifications()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clubId])

  async function fetchNotifications() {
    setLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })

    if (!error && data) setNotifications(data)
    setLoading(false)
  }

  async function markAsRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  async function deleteNotification(id: string) {
    await supabase.from('notifications').delete().eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  async function actionResponse(notif: Notification, response: 'accept' | 'reject' | 'counter') {
    try {
      if (response === 'counter') {
        if (!counterAmount || isNaN(Number(counterAmount))) {
          toast.error('Ingresa un monto vAAlido')
          return
        }
        await handleOfferResponse(notif.data.offer_id, 'counter', Number(counterAmount))
        toast.success('Contraoferta enviada')
        setActiveCounterId(null)
        setCounterAmount('')
      } else {
        await handleOfferResponse(notif.data.offer_id, response)
        toast.success(response === 'accept' ? 'A Traspaso completado!' : 'Oferta rechazada')
      }
      
      await markAsRead(notif.id)
      if (onActionComplete) onActionComplete()
    } catch (err: any) {
      toast.error(err.message || 'Error al procesar')
    }
  }

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'offer_received': return { icon: <DollarSign className="w-4 h-4" />, color: 'text-amber-400', bg: 'bg-amber-400/10' }
      case 'offer_countered': return { icon: <RefreshCw className="w-4 h-4" />, color: 'text-blue-400', bg: 'bg-blue-400/10' }
      case 'transfer_complete': return { icon: <ShieldCheck className="w-4 h-4" />, color: 'text-[#00FF85]', bg: 'bg-[#00FF85]/10' }
      case 'offer_rejected': return { icon: <XCircle className="w-4 h-4" />, color: 'text-red-400', bg: 'bg-red-400/10' }
      default: return { icon: <Bell className="w-4 h-4" />, color: 'text-white/60', bg: 'bg-white/5' }
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[90]"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 w-full md:w-[450px] bg-[#0A0A0A] z-[100] border-l border-white/[0.05] shadow-[0_0_100px_rgba(0,0,0,1)] flex flex-col"
          >
            
            {/* Header with Safe Area support */}
            <div className="flex items-center justify-between p-6 bg-[#0E0E0E] border-b border-white/[0.05] pt-[max(4.5rem,env(safe-area-inset-top))]">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-2xl bg-[#1A1A1A] border border-white/[0.05] flex items-center justify-center shadow-inner">
                    <Bell className="w-6 h-6 text-[#00FF85]" />
                  </div>
                  {notifications.filter(n => !n.is_read).length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#00FF85] rounded-full border-[3px] border-[#0E0E0E] shadow-[0_0_15px_rgba(0,255,133,0.5)]" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase tracking-tighter text-white">Notificaciones</h2>
                  <p className="text-[10px] text-[#6A6C6E] font-bold uppercase tracking-widest">
                    {notifications.length} registros en la terminal
                  </p>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className="p-3 bg-[#1A1A1A] hover:bg-[#252525] rounded-xl transition-all duration-300 group border border-white/[0.05] active:scale-90"
              >
                <X className="w-5 h-5 text-[#6A6C6E] group-hover:text-white transition-colors" />
              </button>
            </div>

            {/* List Content */}
            <div className="overflow-y-auto flex-1 p-6 space-y-4 bg-gradient-to-b from-[#0A0A0A] to-[#0E0E0E] custom-scrollbar">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-32 text-[#6A6C6E]">
                  <div className="w-16 h-16 rounded-3xl bg-[#141414] border border-white/[0.05] flex items-center justify-center mb-6 shadow-xl">
                    <RefreshCw className="w-8 h-8 animate-spin text-[#00FF85]/40" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">Analizando Sincronización...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 text-[#6A6C6E] animate-fade-in">
                  <div className="w-20 h-20 rounded-[40px] bg-[#141414] border border-white/[0.05] flex items-center justify-center mb-8 opacity-20">
                    <Info className="w-10 h-10" />
                  </div>
                  <p className="text-[11px] font-black uppercase tracking-[0.3em]">Bandeja de Entrada Vacía</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {notifications.map((notif, idx) => {
                    const style = getTypeStyle(notif.type)
                    return (
                      <motion.div 
                        key={notif.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className={`relative overflow-hidden group p-5 rounded-[24px] border transition-all duration-300 ${
                          notif.is_read 
                            ? 'bg-[#121212]/40 border-white/[0.03]' 
                            : 'bg-[#141414] border-[#00FF85]/20 shadow-[0_0_30px_rgba(0,255,133,0.03)]'
                        }`}
                      >
                        {/* Backdrop Type Icon */}
                        <div className={`absolute -right-4 -bottom-4 opacity-[0.03] transform group-hover:scale-110 transition-transform duration-700 ${style.color}`}>
                          <div className="w-32 h-32">
                            {style.icon}
                          </div>
                        </div>

                        <div className="flex items-start justify-between relative z-10">
                          <div className="flex items-center gap-3 mb-3">
                            <div className={`p-2 rounded-lg ${style.bg} ${style.color}`}>
                              {style.icon}
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-widest ${style.color}`}>
                              {notif.title}
                            </span>
                          </div>
                          <div className="flex gap-2">
                             <button 
                               onClick={() => deleteNotification(notif.id)} 
                               className="w-7 h-7 bg-[#1A1A1A] hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-all duration-300 flex items-center justify-center border border-white/[0.03]"
                             >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="relative z-10 mb-4">
                          <p className={`text-xs leading-relaxed ${notif.is_read ? 'text-[#6A6C6E]' : 'text-white/90'}`}>
                            {notif.message}
                          </p>
                          {notif.data?.amount && (
                            <div className="mt-3 flex items-center gap-2">
                              <div className="h-[1px] flex-1 bg-gradient-to-r from-white/[0.05] to-transparent" />
                              <span className="text-lg font-black text-[#00FF85] tracking-tighter shadow-[#00FF85]/20">
                                ${notif.data.amount.toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Actions Area */}
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
                                    className="flex-1 bg-[#00FF85] text-[#0A0A0A] text-[9px] font-black rounded-xl h-10 shadow-[0_5px_15px_rgba(0,255,133,0.3)] uppercase tracking-widest active:scale-95 transition-all"
                                    onClick={() => actionResponse(notif, 'counter')}
                                  >
                                    ENVIAR
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
                                  className="bg-[#00FF85] text-[#0A0A0A] text-[9px] font-black h-11 rounded-xl flex items-center justify-center gap-2 shadow-[0_5px_15px_rgba(0,255,133,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-widest"
                                  onClick={() => actionResponse(notif, 'accept')}
                                >
                                  <Check className="w-3.5 h-3.5" /> ACEPTAR
                                </button>
                                <button 
                                  className="bg-white/5 text-white hover:bg-red-500 hover:text-white text-[9px] font-black h-11 rounded-xl flex items-center justify-center gap-2 transition-all border border-white/[0.05] uppercase tracking-widest"
                                  onClick={() => actionResponse(notif, 'reject')}
                                >
                                  <XCircle className="w-3.5 h-3.5" /> NO
                                </button>
                                <button 
                                  className="bg-[#1A1A1A] text-white hover:bg-[#2D2D2D] text-[9px] font-black h-11 rounded-xl flex items-center justify-center gap-2 transition-all border border-white/[0.05] uppercase tracking-widest"
                                  onClick={() => setActiveCounterId(notif.id)}
                                >
                                   CONTRAR
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {!notif.is_read && notif.type !== 'offer_received' && notif.type !== 'offer_countered' && (
                          <button 
                            className="w-full mt-4 py-2.5 bg-[#1A1A1A] text-[#6A6C6E] hover:text-[#00FF85] hover:bg-[#00FF85]/5 text-[9px] font-black uppercase tracking-[0.2em] rounded-xl transition-all border border-transparent hover:border-[#00FF85]/20"
                            onClick={() => markAsRead(notif.id)}
                          >
                            MARCAR COMO VISTO
                          </button>
                        )}
                      </motion.div>
                    )
                  })}
                </div>
              )
            }  </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
