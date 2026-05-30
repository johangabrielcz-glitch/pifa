'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Loader2, Shield, Coins, Check, Users } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { sendClubBonus } from '@/lib/bonus-engine'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

interface ClubRow {
  id: string
  name: string
  shield_url: string | null
  budget: number
}

export default function AdminBonusesPage() {
  const router = useRouter()
  const [clubs, setClubs] = useState<ClubRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [amountK, setAmountK] = useState('') // amount in thousands (K)
  const [concept, setConcept] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)

  // Admin-only (moderators are also redirected by the layout guard)
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('pifa_auth_session') || '{}')
      if (s?.user?.role === 'admin') setAllowed(true)
      else router.replace('/admin')
    } catch {
      router.replace('/admin')
    }
  }, [router])

  useEffect(() => {
    if (!allowed) return
    ;(async () => {
      setIsLoading(true)
      const { data } = await supabase.from('clubs').select('id, name, shield_url, budget').order('name')
      setClubs((data as ClubRow[]) || [])
      setIsLoading(false)
    })()
  }, [allowed])

  const amount = Math.max(0, Math.round(parseFloat(amountK) || 0)) * 1000
  const fmtMoney = (n: number) => '$' + Math.round(n).toLocaleString('es')

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const allSelected = clubs.length > 0 && selected.size === clubs.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(clubs.map((c) => c.id)))

  const canSend = selected.size > 0 && amount > 0 && !isSending

  const handleSend = async () => {
    setIsSending(true)
    try {
      const res = await sendClubBonus(Array.from(selected), amount, concept)
      if (!res.success) throw new Error(res.error || 'Error al enviar el bono')
      toast.success(`Bono de ${fmtMoney(amount)} enviado a ${res.count} club(es) · Total ${fmtMoney(res.total || 0)}`)
      setSelected(new Set())
      setAmountK('')
      setConcept('')
      // refresh budgets
      const { data } = await supabase.from('clubs').select('id, name, shield_url, budget').order('name')
      setClubs((data as ClubRow[]) || [])
    } catch (e: any) {
      toast.error(e.message || 'Error al enviar el bono')
    } finally {
      setIsSending(false)
      setConfirmOpen(false)
    }
  }

  if (!allowed) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#FF3131]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0A0A0A]/90 backdrop-blur-2xl border-b border-white/[0.04]">
        <div className="flex items-center gap-3 px-6 py-3.5">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-xl bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white transition-all active:scale-95"
          >
            <ChevronLeft className="w-4.5 h-4.5" />
          </button>
          <div>
            <h1 className="text-base font-black text-white uppercase tracking-tight">BONOS <span className="text-[#00FF85]">ECONÓMICOS</span></h1>
            <p className="text-[7px] text-[#2D2D2D] font-black uppercase tracking-[0.3em]">Enviar dinero a clubes</p>
          </div>
        </div>
      </header>

      <div className="px-6 py-6 space-y-5 pb-40">
        {/* Amount + concept */}
        <div className="bg-[#141414]/50 backdrop-blur-xl rounded-[24px] border border-white/[0.04] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Coins size={14} className="text-[#00FF85]" />
            <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">CONFIGURACIÓN DEL BONO</h3>
          </div>
          <div>
            <label className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest">Monto por club (en miles, K)</label>
            <input
              type="number"
              inputMode="numeric"
              value={amountK}
              onChange={(e) => setAmountK(e.target.value)}
              placeholder="Ej. 50"
              className="mt-1.5 w-full h-11 bg-black border border-[#202020] rounded-xl px-3 text-[14px] font-black text-white focus:border-[#00FF85]/40 outline-none placeholder:text-[#2D2D2D]"
            />
            <p className="text-[8px] text-[#00FF85] font-black uppercase tracking-widest mt-1">{amount > 0 ? `= ${fmtMoney(amount)} a cada club` : 'Ingresa un monto'}</p>
          </div>
          <div>
            <label className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest">Concepto (opcional)</label>
            <input
              type="text"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Ej. Bono de bienvenida"
              maxLength={120}
              className="mt-1.5 w-full h-11 bg-black border border-[#202020] rounded-xl px-3 text-[12px] font-bold text-white focus:border-[#00FF85]/40 outline-none placeholder:text-[#2D2D2D]"
            />
          </div>
        </div>

        {/* Club selector */}
        <div className="bg-[#141414]/30 backdrop-blur-xl rounded-[24px] border border-white/[0.04] overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-white/[0.04] bg-[#0A0A0A]/30">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-[#00FF85]" />
              <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">CLUBES ({selected.size}/{clubs.length})</h3>
            </div>
            <button
              onClick={toggleAll}
              className="h-8 px-3 bg-white/5 hover:bg-white/10 text-[#6A6C6E] hover:text-white border border-white/10 rounded-lg font-black uppercase tracking-widest text-[8px] transition-all"
            >
              {allSelected ? 'Limpiar' : 'Todos'}
            </button>
          </div>

          <div className="p-4 space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#00FF85]" /></div>
            ) : clubs.length === 0 ? (
              <p className="text-center text-[10px] text-[#6A6C6E] font-bold uppercase tracking-widest py-12">No hay clubes registrados.</p>
            ) : (
              clubs.map((c) => {
                const sel = selected.has(c.id)
                return (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-left ${
                      sel ? 'border-[#00FF85]/40 bg-[#00FF85]/10' : 'border-white/[0.04] bg-black/40 hover:bg-black/60'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${sel ? 'bg-[#00FF85] border-[#00FF85]' : 'border-white/20'}`}>
                      {sel && <Check className="w-3.5 h-3.5 text-[#0A0A0A]" strokeWidth={3} />}
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-black border border-[#202020] flex items-center justify-center p-1.5 shrink-0">
                      {c.shield_url ? <img src={c.shield_url} className="w-full h-full object-contain" /> : <Shield size={16} className="text-[#2D2D2D]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black text-white uppercase tracking-tight truncate">{c.name}</p>
                      <p className="text-[8px] text-[#6A6C6E] font-bold uppercase tracking-widest">Tesorería: {fmtMoney(c.budget ?? 0)}</p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Sticky send bar */}
      <div className="fixed bottom-16 left-0 right-0 z-40 px-6 pb-4">
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!canSend}
          className="w-full max-w-screen-sm mx-auto h-13 py-3.5 bg-[#00FF85] hover:bg-[#00e077] text-[#0A0A0A] rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-[0_0_30px_rgba(0,255,133,0.3)] transition-all active:scale-95 disabled:opacity-30 disabled:shadow-none flex items-center justify-center gap-2"
        >
          <Coins className="w-4 h-4" />
          {selected.size > 0 && amount > 0
            ? `Enviar ${fmtMoney(amount)} a ${selected.size} club(es) · Total ${fmtMoney(amount * selected.size)}`
            : 'Enviar Bono'}
        </button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => { if (!isSending) setConfirmOpen(o) }}>
        <AlertDialogContent className="max-w-sm w-full rounded-[24px] bg-[#141414] border-white/[0.08] p-6 shadow-2xl fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <AlertDialogHeader className="mb-4">
            <div className="w-12 h-12 rounded-xl bg-[#00FF85]/10 border border-[#00FF85]/20 flex items-center justify-center mx-auto mb-4 text-[#00FF85]">
              <Coins className="w-6 h-6" />
            </div>
            <AlertDialogTitle className="text-base font-black text-white uppercase tracking-tighter text-center">CONFIRMAR <span className="text-[#00FF85]">BONO</span></AlertDialogTitle>
            <AlertDialogDescription className="text-center text-[10px] text-[#6A6C6E] font-bold mt-2 leading-relaxed">
              Se acreditará <span className="text-[#00FF85] font-black">{fmtMoney(amount)}</span> a <span className="text-white font-black">{selected.size}</span> club(es)
              {' '}(total <span className="text-white font-black">{fmtMoney(amount * selected.size)}</span>). Se enviará push a cada club y un push global.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2">
            <AlertDialogCancel disabled={isSending} className="flex-1 h-11 bg-[#0A0A0A] border border-[#202020] text-[#2D2D2D] hover:text-white rounded-xl font-black uppercase tracking-widest text-[9px] m-0 disabled:opacity-50">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSending}
              onClick={(e) => { e.preventDefault(); handleSend() }}
              className="flex-1 h-11 bg-[#00FF85] hover:bg-[#00e077] text-[#0A0A0A] rounded-xl font-black uppercase tracking-widest text-[9px] shadow-[0_0_20px_rgba(0,255,133,0.25)] m-0 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
