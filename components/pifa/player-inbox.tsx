'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { acceptPromotionDemand } from '@/lib/contract-engine'
import type { PlayerEmail } from '@/lib/types'
import { Mail, MailOpen, X, AlertTriangle, Heart, HandshakeIcon, DoorOpen, MessageCircle, CheckCircle, TrendingUp, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface PlayerInboxProps {
  clubId: string
}

const emailTypeConfig: Record<string, { emoji: string; color: string; label: string }> = {
  complaint: { emoji: '😤', color: 'text-amber-400', label: 'Queja' },
  apology: { emoji: '😔', color: 'text-blue-400', label: 'Disculpa' },
  demand: { emoji: '💢', color: 'text-red-400', label: 'Exigencia' },
  farewell: { emoji: '👋', color: 'text-rose-400', label: 'Despedida' },
  promotion_demand: { emoji: '📈', color: 'text-emerald-400', label: 'Promoción' },
  plea: { emoji: '🙏', color: 'text-cyan-400', label: 'Petición' },
  general: { emoji: '💬', color: 'text-white/60', label: 'Mensaje' },
}

export function PlayerInbox({ clubId }: PlayerInboxProps) {
  const [emails, setEmails] = useState<(PlayerEmail & { player?: { name: string; position: string; photo_url: string | null } })[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEmail, setSelectedEmail] = useState<PlayerEmail | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [acceptingDemand, setAcceptingDemand] = useState(false)

  useEffect(() => {
    loadEmails()

    // Realtime subscription for new emails
    const channel = supabase
      .channel('player_emails_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'player_emails', filter: `club_id=eq.${clubId}` }, (payload) => {
        const newEmail = payload.new as PlayerEmail
        setEmails(prev => [newEmail, ...prev])
        setUnreadCount(prev => prev + 1)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [clubId])

  async function loadEmails() {
    setLoading(true)
    const { data } = await supabase
      .from('player_emails')
      .select('*, player:players(name, position, photo_url)')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (data) {
      setEmails(data as any[])
      setUnreadCount((data as any[]).filter(e => !e.is_read).length)
    }
    setLoading(false)
  }

  async function markAsRead(emailId: string) {
    await supabase
      .from('player_emails')
      .update({ is_read: true })
      .eq('id', emailId)

    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, is_read: true } : e))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  function openEmail(email: PlayerEmail) {
    setSelectedEmail(email)
    if (!email.is_read) {
      markAsRead(email.id)
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-[#FF3131]" />
          <h3 className="text-xs font-black text-white uppercase tracking-wider">Bandeja de Entrada</h3>
          {unreadCount > 0 && (
            <div className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF3131] flex items-center justify-center">
              <span className="text-[8px] font-black text-white">{unreadCount}</span>
            </div>
          )}
        </div>
        <span className="text-[8px] font-bold text-[#6A6C6E] uppercase tracking-widest">{emails.length} correos</span>
      </div>

      {/* Email List */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {loading ? (
          <div className="py-6 text-center">
            <div className="w-6 h-6 border-2 border-[#FF3131] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : emails.length === 0 ? (
          <div className="py-8 text-center border border-white/[0.04] rounded-xl bg-[#141414]/30">
            <MailOpen className="w-8 h-8 text-[#2D2D2D] mx-auto mb-3" />
            <p className="text-[10px] font-black text-[#2D2D2D] uppercase tracking-widest mb-1">Sin correos</p>
            <p className="text-[8px] font-bold text-[#1A1A1A] uppercase tracking-wider px-8">
              Aquí llegarán los mensajes de tus jugadores — quejas, exigencias o despedidas según su moral
            </p>
          </div>
        ) : (
          emails.map(email => {
            const config = emailTypeConfig[email.email_type] || emailTypeConfig.general
            const timeAgo = getTimeAgo(email.created_at)
            
            return (
              <button
                key={email.id}
                onClick={() => openEmail(email)}
                className={`w-full text-left p-3 rounded-xl border transition-all group ${
                  email.is_read 
                    ? 'bg-[#141414]/50 border-white/[0.04] hover:border-white/10' 
                    : 'bg-[#141414] border-[#FF3131]/20 hover:border-[#FF3131]/40 shadow-[0_0_10px_rgba(255,49,49,0.05)]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#202020] flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-sm">{config.emoji}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-black uppercase tracking-wider ${email.is_read ? 'text-[#6A6C6E]' : 'text-white'}`}>
                        {(email as any).player?.name || 'Jugador'}
                      </span>
                      <span className={`text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${config.color} bg-white/5`}>
                        {config.label}
                      </span>
                      {!email.is_read && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#FF3131] animate-pulse" />
                      )}
                    </div>
                    <p className={`text-[10px] font-bold truncate ${email.is_read ? 'text-[#2D2D2D]' : 'text-[#6A6C6E]'}`}>
                      {email.subject}
                    </p>
                    <span className="text-[7px] font-bold text-[#2D2D2D] uppercase tracking-widest mt-1 block">{timeAgo}</span>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Email Detail Modal */}
      {selectedEmail && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedEmail(null)} />
          <div className="relative w-full max-w-md bg-[#0A0A0A] border border-[#202020] rounded-[24px] p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
            {/* Close */}
            <button 
              onClick={() => setSelectedEmail(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#141414] border border-[#202020] flex items-center justify-center">
                  <span className="text-lg">{(emailTypeConfig[selectedEmail.email_type] || emailTypeConfig.general).emoji}</span>
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-tight">{(selectedEmail as any).player?.name || 'Jugador'}</h3>
                  <span className={`text-[8px] font-black uppercase tracking-widest ${(emailTypeConfig[selectedEmail.email_type] || emailTypeConfig.general).color}`}>
                    {(emailTypeConfig[selectedEmail.email_type] || emailTypeConfig.general).label}
                  </span>
                </div>
              </div>
              <h4 className="text-xs font-black text-[#FF3131] uppercase tracking-wider">{selectedEmail.subject}</h4>
              <span className="text-[7px] font-bold text-[#2D2D2D] uppercase tracking-widest">
                {new Date(selectedEmail.created_at).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>

            {/* Body */}
            <div className="bg-[#141414] rounded-xl border border-[#202020] p-4">
              <p className="text-sm text-[#A0A2A4] font-medium leading-relaxed whitespace-pre-wrap">
                {selectedEmail.body}
              </p>
            </div>

            {/* Promotion Demand Action Button */}
            {selectedEmail.email_type === 'promotion_demand' && (
              <div className="mt-4">
                {(selectedEmail as any).action_taken ? (
                  <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Demanda Aceptada ✓</span>
                  </div>
                ) : (
                  <>
                    {(selectedEmail as any).action_data && (
                      <div className="mb-3 p-3 rounded-xl bg-[#141414] border border-emerald-500/20">
                        <p className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest mb-2">Solicita:</p>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 text-center">
                            <span className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-wider block">Rol</span>
                            <span className="text-xs font-black text-emerald-400 uppercase">
                              {(selectedEmail as any).action_data.requested_role === 'essential' ? '⭐ Esencial' : '🔵 Importante'}
                            </span>
                          </div>
                          <div className="w-px h-8 bg-[#202020]" />
                          <div className="flex-1 text-center">
                            <span className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-wider block">Salario</span>
                            <span className="text-xs font-black text-[#00FF85]">
                              ${(selectedEmail as any).action_data.requested_salary?.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={async () => {
                        setAcceptingDemand(true)
                        try {
                          const result = await acceptPromotionDemand(selectedEmail.id)
                          if (result.success) {
                            toast.success('Demanda aceptada — Rol y salario actualizados')
                            setEmails(prev => prev.map(e => e.id === selectedEmail.id ? { ...e, action_taken: true } as any : e))
                            setSelectedEmail({ ...selectedEmail, action_taken: true } as any)
                          } else {
                            toast.error(result.error || 'Error al aceptar demanda')
                          }
                        } catch (err: any) {
                          toast.error('Error al aceptar demanda')
                        } finally {
                          setAcceptingDemand(false)
                        }
                      }}
                      disabled={acceptingDemand}
                      className="w-full py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {acceptingDemand ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <TrendingUp className="w-4 h-4" />
                          Aceptar Demanda
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Ahora'
  if (minutes < 60) return `Hace ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Hace ${hours}h`
  const days = Math.floor(hours / 24)
  return `Hace ${days}d`
}
