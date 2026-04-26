'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { 
  Shield, 
  Mail, 
  DollarSign, 
  Zap, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  ChevronLeft,
  ChevronRight,
  History, 
  Send,
  Loader2,
  Eye,
  Activity,
  User as UserIcon,
  TrendingDown,
  TrendingUp,
  Filter,
  Heart
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Player, Club, PlayerEmail } from '@/lib/types'

type Tab = 'mailbox' | 'audit' | 'terminal' | 'ocm'
const PAGE_SIZE = 10

export default function SuperDashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('mailbox')
  
  // Data States
  const [emails, setEmails] = useState<(PlayerEmail & { player: Player; club: Club })[]>([])
  const [clubs, setClubs] = useState<(Club & { players: Player[] })[]>([])
  const [players, setPlayers] = useState<(Player & { club: Club })[]>([])
  
  // Pagination States
  const [emailPage, setEmailPage] = useState(0)
  const [playerPage, setPlayerPage] = useState(0)
  const [totalEmails, setTotalEmails] = useState(0)
  const [totalPlayers, setTotalPlayers] = useState(0)
  
  // UI States
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedClubs, setExpandedClubs] = useState<Record<string, boolean>>({})
  const [isTriggering, setIsTriggering] = useState<string | null>(null)
  
  // Global Stats (fetched once)
  const [stats, setStats] = useState({ totalPayroll: 0, unreadCount: 0, criticalPlayers: 0, totalPlayersCount: 0 })

  useEffect(() => {
    fetchGlobalStats()
  }, [])

  useEffect(() => {
    if (activeTab === 'mailbox') fetchEmails()
    if (activeTab === 'audit' || activeTab === 'ocm') fetchClubs()
    if (activeTab === 'terminal') fetchPlayers()
  }, [activeTab, emailPage, playerPage, searchQuery])

  async function fetchGlobalStats() {
    try {
      const { data: pData } = await supabase.from('players').select('salary, morale')
      const { count: uCount } = await supabase.from('player_emails').select('*', { count: 'exact', head: true }).eq('is_read', false)
      
      if (pData) {
        setStats({
          totalPayroll: pData.reduce((sum, p) => sum + (p.salary || 0), 0),
          unreadCount: uCount || 0,
          criticalPlayers: pData.filter(p => p.morale <= 30).length,
          totalPlayersCount: pData.length
        })
      }
    } catch (e) {}
  }

  const fetchEmails = async () => {
    setLoading(true)
    const from = emailPage * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    
    let query = supabase.from('player_emails').select('*, player:players(*), club:clubs(*)', { count: 'exact' })
    
    if (searchQuery) {
      query = query.or(`subject.ilike.%${searchQuery}%,body.ilike.%${searchQuery}%`)
    }

    const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to)

    if (!error && data) {
      setEmails(data as any)
      setTotalEmails(count || 0)
    }
    setLoading(false)
  }

  const fetchPlayers = async () => {
    setLoading(true)
    const from = playerPage * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    
    let query = supabase.from('players').select('*, club:clubs(*)', { count: 'exact' })
    
    if (searchQuery) {
      query = query.ilike('name', `%${searchQuery}%`)
    }

    const { data, count, error } = await query.order('name', { ascending: true }).range(from, to)

    if (!error && data) {
      setPlayers(data as any)
      setTotalPlayers(count || 0)
    }
    setLoading(false)
  }

  const fetchClubs = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('clubs').select('*, players(*)').order('name', { ascending: true })
    if (!error && data) setClubs(data as any)
    setLoading(false)
  }

  const forceTrigger = async (playerId: string, type: string, payload: any) => {
    setIsTriggering(playerId)
    try {
      const res = await fetch('/api/admin/force-trigger-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, triggerType: type, ...payload })
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Trigger ejecutado correctamente')
        if (activeTab === 'mailbox') fetchEmails()
        fetchGlobalStats()
      } else {
        toast.error(data.error || 'Error en el trigger')
      }
    } catch (err) {
      toast.error('Error de conexión')
    } finally {
      setIsTriggering(null)
    }
  }

  const markAsRead = async (emailId: string) => {
    const { error } = await supabase.from('player_emails').update({ is_read: true }).eq('id', emailId)
    if (!error) {
      setEmails(prev => prev.map(e => e.id === emailId ? { ...e, is_read: true } : e))
      setStats(s => ({ ...s, unreadCount: Math.max(0, s.unreadCount - 1) }))
      toast.success('Atendido')
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6 md:p-10 font-sans selection:bg-[#00FF85]/30">
      {/* Background FX */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#00FF85]/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-[#00FF85]/3 rounded-full blur-[100px]" />
      </div>

      <header className="relative z-10 mb-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#00FF85] to-[#00A355] flex items-center justify-center shadow-[0_0_30px_rgba(0,255,133,0.3)] border border-white/20">
              <Zap className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase tracking-tighter leading-none italic">
                Terminal <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00FF85] to-[#00CC6A]">Maestra</span>
              </h1>
              <p className="text-[10px] text-[#6A6C6E] font-bold uppercase tracking-[0.4em] mt-1">Super Admin Control · Restricted Access</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <div className="h-2 w-2 rounded-full bg-[#00FF85] animate-pulse" />
             <span className="text-[10px] font-black uppercase tracking-widest text-[#00FF85]">Sistema Operativo</span>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Masa Salarial Global" value={`$${(stats.totalPayroll / 1000000).toFixed(1)}M`} icon={<DollarSign className="w-4 h-4" />} />
          <StatCard label="Correos Sin Leer" value={stats.unreadCount} icon={<Mail className="w-4 h-4" />} color="text-[#00FF85]" />
          <StatCard label="Jugadores en Crisis" value={stats.criticalPlayers} icon={<TrendingDown className="w-4 h-4" />} color="text-red-500" />
          <StatCard label="Jugadores Totales" value={stats.totalPlayersCount} icon={<UserIcon className="w-4 h-4" />} />
        </div>
      </header>

      {/* Tabs Menu */}
      <nav className="relative z-10 flex gap-1 bg-[#141414]/50 backdrop-blur-md p-1.5 rounded-2xl w-fit mb-8 border border-white/5 shadow-2xl">
        <TabButton active={activeTab === 'mailbox'} onClick={() => { setActiveTab('mailbox'); setSearchQuery(''); }} icon={<Mail className="w-3.5 h-3.5" />} label="Buzón Global" />
        <TabButton active={activeTab === 'audit'} onClick={() => { setActiveTab('audit'); setSearchQuery(''); }} icon={<Shield className="w-3.5 h-3.5" />} label="Auditoría Salarial" />
        <TabButton active={activeTab === 'terminal'} onClick={() => { setActiveTab('terminal'); setSearchQuery(''); }} icon={<Zap className="w-3.5 h-3.5" />} label="Controlador" />
        <TabButton active={activeTab === 'ocm'} onClick={() => { setActiveTab('ocm'); setSearchQuery(''); }} icon={<Heart className="w-3.5 h-3.5" />} label="One Club Man" />
      </nav>

      <main className="relative z-10">
        <div className="mb-6 flex flex-col md:flex-row gap-4 justify-between items-end md:items-center">
            {activeTab !== 'audit' && (
              <div className="relative w-full max-w-md group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6A6C6E] group-focus-within:text-[#00FF85] transition-colors" />
                <Input 
                  placeholder={activeTab === 'mailbox' ? "Buscar por contenido..." : "Buscar jugador por nombre..."} 
                  className="bg-[#141414] border-white/5 pl-11 h-12 text-xs rounded-xl focus:ring-[#00FF85]/20 focus:border-[#00FF85] transition-all"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    if (activeTab === 'mailbox') setEmailPage(0)
                    if (activeTab === 'terminal') setPlayerPage(0)
                  }}
                />
              </div>
            )}
            
            {/* Pagination Controls Top */}
            {(activeTab === 'mailbox' || activeTab === 'terminal') && (
              <div className="flex items-center gap-4 bg-[#141414] p-2 rounded-xl border border-white/5">
                <button 
                  disabled={loading || (activeTab === 'mailbox' ? emailPage === 0 : playerPage === 0)}
                  onClick={() => activeTab === 'mailbox' ? setEmailPage(p => p - 1) : setPlayerPage(p => p - 1)}
                  className="p-2 hover:bg-white/5 disabled:opacity-20 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                   Pág {activeTab === 'mailbox' ? emailPage + 1 : playerPage + 1} de {Math.ceil((activeTab === 'mailbox' ? totalEmails : totalPlayers) / PAGE_SIZE)}
                </span>
                <button 
                  disabled={loading || (activeTab === 'mailbox' ? (emailPage + 1) * PAGE_SIZE >= totalEmails : (playerPage + 1) * PAGE_SIZE >= totalPlayers)}
                  onClick={() => activeTab === 'mailbox' ? setEmailPage(p => p + 1) : setPlayerPage(p => p + 1)}
                  className="p-2 hover:bg-white/5 disabled:opacity-20 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
        </div>

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-40"
            >
              <Loader2 className="w-10 h-10 text-[#00FF85] animate-spin" />
              <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-zinc-500">Sincronizando con la red...</p>
            </motion.div>
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {activeTab === 'mailbox' && <MailboxDisplay emails={emails} onRead={markAsRead} />}
              {activeTab === 'audit' && <AuditDisplay clubs={clubs} expandedClubs={expandedClubs} onToggle={(id) => setExpandedClubs(p => ({...p, [id]: !p[id]}))} />}
              {activeTab === 'terminal' && <TerminalDisplay players={players} onTrigger={forceTrigger} isTriggering={isTriggering} />}
              {activeTab === 'ocm' && <OCMDisplay clubs={clubs} onUpdate={fetchClubs} />}
              
              {/* Pagination Controls Bottom */}
              {(activeTab === 'mailbox' || activeTab === 'terminal') && (
                <div className="mt-10 flex justify-center">
                   <div className="flex items-center gap-6 bg-[#141414] px-6 py-3 rounded-2xl border border-white/5 shadow-xl">
                      <Button 
                        disabled={activeTab === 'mailbox' ? emailPage === 0 : playerPage === 0}
                        onClick={() => activeTab === 'mailbox' ? setEmailPage(p => p - 1) : setPlayerPage(p => p - 1)}
                        variant="ghost" className="h-8 text-[9px] font-black uppercase tracking-widest hover:text-[#00FF85]"
                      >
                        Anterior
                      </Button>
                      <div className="h-4 w-px bg-white/10" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">Resultados: {activeTab === 'mailbox' ? totalEmails : totalPlayers}</span>
                      <div className="h-4 w-px bg-white/10" />
                      <Button 
                        disabled={activeTab === 'mailbox' ? (emailPage + 1) * PAGE_SIZE >= totalEmails : (playerPage + 1) * PAGE_SIZE >= totalPlayers}
                        onClick={() => activeTab === 'mailbox' ? setEmailPage(p => p + 1) : setPlayerPage(p => p + 1)}
                        variant="ghost" className="h-8 text-[9px] font-black uppercase tracking-widest hover:text-[#00FF85]"
                      >
                        Siguiente
                      </Button>
                   </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

function StatCard({ label, value, icon, color = 'text-white' }: { label: string, value: string | number, icon: any, color?: string }) {
  return (
    <div className="p-5 bg-gradient-to-br from-[#141414] to-[#0A0A0A] border border-white/5 rounded-2xl shadow-xl group hover:border-[#00FF85]/20 transition-all duration-300">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 rounded-xl bg-white/5 text-[#6A6C6E] group-hover:text-[#00FF85] transition-colors">{icon}</div>
        <span className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest">{label}</span>
      </div>
      <p className={`text-2xl font-black italic tracking-tighter ${color}`}>{value}</p>
    </div>
  )
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
        active 
          ? 'bg-[#00FF85] text-black shadow-[0_5px_20px_rgba(0,255,133,0.3)] scale-105' 
          : 'text-[#6A6C6E] hover:text-white hover:bg-white/5'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function MailboxDisplay({ emails, onRead }: { emails: any[], onRead: (id: string) => void }) {
  return (
    <div className="grid gap-3">
      {emails.length === 0 && <div className="py-20 text-center opacity-30 uppercase font-black tracking-widest text-[10px]">No se encontraron registros</div>}
      {emails.map(email => (
        <div 
          key={email.id} 
          className={`p-6 rounded-2xl border transition-all ${
            email.is_read ? 'bg-[#0A0A0A] border-white/5 opacity-50' : 'bg-[#141414] border-[#00FF85]/10 shadow-[0_5px_30px_rgba(0,0,0,0.5)]'
          }`}
        >
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#050505] border border-white/5 p-1 flex items-center justify-center">
                {email.player?.photo_url ? (
                  <img src={email.player.photo_url} className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-6 h-6 text-[#2D2D2D]" />
                )}
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-tighter leading-none">{email.player?.name}</h4>
                <p className="text-[9px] text-[#00FF85] font-black uppercase mt-1 tracking-widest">{email.club?.name}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2">
                <span className="text-[7px] font-black px-3 py-1 rounded-full bg-white/5 text-white/40 uppercase tracking-widest">
                  ID: {email.id.slice(0, 8)}
                </span>
                <span className={`text-[7px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${
                    email.email_type === 'demand' || email.email_type === 'promotion_demand' ? 'bg-red-500/20 text-red-500' : 'bg-emerald-500/20 text-[#00FF85]'
                }`}>
                    {email.email_type}
                </span>
              </div>
              <span className="text-[9px] text-[#2D2D2D] font-black tabular-nums">{new Date(email.created_at).toLocaleString()}</span>
            </div>
          </div>
          
          <div className="bg-[#050505] rounded-xl border border-white/5 p-5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-100 transition-opacity">
                <Mail className="w-4 h-4 text-[#00FF85]" />
            </div>
            <p className="text-[10px] font-black text-[#6A6C6E] uppercase mb-2 tracking-widest border-b border-white/5 pb-2">Asunto: <span className="text-white">{email.subject}</span></p>
            <p className="text-[11px] text-zinc-400 leading-relaxed italic font-medium">"{email.body}"</p>
          </div>

          {!email.is_read && (
            <Button 
              onClick={() => onRead(email.id)}
              variant="outline" 
              className="mt-4 w-full h-10 text-[9px] font-black uppercase border-[#00FF85]/20 text-[#00FF85] hover:bg-[#00FF85] hover:text-black transition-all rounded-xl"
            >
              Archivar Correo
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}

function AuditDisplay({ clubs, expandedClubs, onToggle }: { clubs: any[], expandedClubs: Record<string, boolean>, onToggle: (id: string) => void }) {
  return (
    <div className="space-y-4">
      {clubs.map(club => {
        const clubTotal = club.players.reduce((sum: number, p: any) => sum + (p.salary || 0), 0)
        return (
          <div key={club.id} className="bg-[#141414] rounded-[24px] border border-white/5 overflow-hidden transition-all hover:border-white/10 group">
            <div 
              onClick={() => onToggle(club.id)}
              className="p-6 flex items-center justify-between cursor-pointer group-hover:bg-white/[0.01] transition-colors"
            >
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-[#050505] border border-white/5 p-3 flex items-center justify-center group-hover:scale-105 transition-transform shadow-xl">
                  {club.shield_url ? (
                    <img src={club.shield_url} className="w-full h-full object-contain" />
                  ) : (
                    <Shield className="w-8 h-8 text-[#2D2D2D]" />
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter italic">{club.name}</h3>
                  <div className="flex items-center gap-4 mt-1.5">
                    <div className="flex items-center gap-1.5">
                        <UserIcon className="w-3 h-3 text-[#6A6C6E]" />
                        <span className="text-[9px] text-[#6A6C6E] font-black uppercase tracking-widest">{club.players.length} Atletas</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <DollarSign className="w-3 h-3 text-[#00FF85]" />
                        <span className="text-[9px] text-[#00FF85] font-black uppercase tracking-widest">Nómina: ${clubTotal.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                  {expandedClubs[club.id] ? <ChevronUp className="w-5 h-5 text-zinc-500" /> : <ChevronDown className="w-5 h-5 text-zinc-500" />}
              </div>
            </div>

            <AnimatePresence>
              {expandedClubs[club.id] && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }} 
                  animate={{ height: 'auto', opacity: 1 }} 
                  exit={{ height: 0, opacity: 0 }}
                  className="px-6 pb-6 overflow-hidden"
                >
                  <div className="w-full h-px bg-white/5 mb-6" />
                  <div className="grid gap-2">
                    <div className="grid grid-cols-4 px-4 py-2 text-[8px] font-black text-zinc-600 uppercase tracking-widest">
                        <span>Jugador</span>
                        <span className="text-center">Rol</span>
                        <span className="text-center">Moral</span>
                        <span className="text-right">Salario</span>
                    </div>
                    {club.players.sort((a:any, b:any) => (b.salary || 0) - (a.salary || 0)).map((player: any) => (
                      <div key={player.id} className="flex items-center grid grid-cols-4 p-4 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-all border border-white/[0.02]">
                        <div className="flex flex-col">
                            <span className="text-[11px] font-black text-white line-clamp-1">{player.name}</span>
                            <span className="text-[7px] font-bold text-zinc-500 uppercase tracking-widest">{player.position}</span>
                        </div>
                        <span className="text-center text-[9px] font-black uppercase text-zinc-400">{player.squad_role}</span>
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ color: player.morale > 60 ? '#00FF85' : player.morale > 30 ? '#FFB800' : '#FF3333', backgroundColor: 'currentColor' }} />
                          <span className="text-[10px] font-black tabular-nums">{player.morale}%</span>
                        </div>
                        <span className="text-right text-[10px] font-black text-[#00FF85] tracking-tight tabular-nums">${player.salary.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

function TerminalDisplay({ players, onTrigger, isTriggering }: { players: any[], onTrigger: (pId: string, type: string, payload: any) => void, isTriggering: string | null }) {
  const [inputs, setInputs] = useState<Record<string, { customText: string, salary: string, role: string }>>({})

  const updateInput = (pId: string, field: string, value: string) => {
    setInputs(prev => ({ ...prev, [pId]: { ...(prev[pId] || { customText: '', salary: '', role: 'important' }), [field]: value } }))
  }

  return (
    <div className="grid gap-6">
      {players.length === 0 && <div className="py-20 text-center opacity-30 uppercase font-black tracking-widest text-[10px]">No se encontraron jugadores</div>}
      {players.map(player => {
        const pInput = inputs[player.id] || { customText: '', salary: '', role: 'important' }
        return (
          <div key={player.id} className="bg-[#111] border border-white/5 p-8 rounded-[40px] relative overflow-hidden group transition-all hover:bg-[#141414]">
            <div className="flex flex-col lg:flex-row gap-8 relative z-10">
              
              {/* Info del Jugador */}
              <div className="lg:w-1/3 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-3xl bg-[#050505] border border-white/5 p-1 flex items-center justify-center">
                    {player.photo_url ? (
                      <img src={player.photo_url} className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="w-10 h-10 text-[#2D2D2D]" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tighter italic">{player.name}</h3>
                    <p className="text-[10px] text-[#00FF85] font-black uppercase tracking-widest">{player.club?.name || 'Agente Libre'}</p>
                    <div className="flex items-center gap-2 mt-2">
                       <Activity className="w-3 h-3 text-[#6A6C6E]" />
                       <span className="text-[10px] font-black">{player.morale}% Moral</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-white/5 rounded-2x border border-white/5">
                   <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1">Estado de Contrato</p>
                   <p className="text-[10px] font-bold text-zinc-300 italic">{player.squad_role} · ${player.salary.toLocaleString()} / año</p>
                </div>
              </div>

              {/* Acciones de Influencia */}
              <div className="flex-1 space-y-6">
                <div>
                  <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                    <Send className="w-3 h-3" />
                    Forzar Envío de Correo
                  </h4>

                  <div className="grid gap-4">
                    {/* Acción 1: Queja por minutos */}
                    <div className="flex items-center justify-between p-4 bg-[#050505] rounded-2xl border border-white/5 hover:border-red-500/30 transition-all group/action">
                      <div>
                        <p className="text-[10px] font-black text-white uppercase tracking-widest">Exigir Titularidad</p>
                        <p className="text-[8px] text-zinc-600 font-bold uppercase mt-0.5">El jugador enviará una queja por falta de minutos.</p>
                      </div>
                      <Button 
                        disabled={isTriggering === player.id}
                        onClick={() => onTrigger(player.id, 'demand', {})}
                        className="bg-white/5 hover:bg-red-500 text-white text-[9px] font-black uppercase px-6 h-10 rounded-xl transition-all"
                      >
                         Ejecutar Envío
                      </Button>
                    </div>

                    {/* Acción 2: Aumento Salarial */}
                    <div className="p-5 bg-[#050505] rounded-2xl border border-white/5 hover:border-[#00FF85]/30 transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-[10px] font-black text-white uppercase tracking-widest">Exigir Aumento de Sueldo</p>
                          <p className="text-[8px] text-zinc-600 font-bold uppercase mt-0.5">Define cuánto dinero pedirá el jugador en su mensaje.</p>
                        </div>
                        <span className="text-[8px] font-black text-[#00FF85] uppercase tracking-widest bg-[#00FF85]/5 px-2 py-1 rounded-md">Trigger: Promotion_Demand</span>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <div className="relative flex-1 min-w-[150px]">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#00FF85]" />
                            <Input 
                                type="number"
                                placeholder={`Sueldo (Auto: $${Math.round(player.salary * 1.5).toLocaleString()})`}
                                className="h-11 bg-[#111] border-white/5 pl-9 text-xs font-bold rounded-xl"
                                value={pInput.salary}
                                onChange={(e) => updateInput(player.id, 'salary', e.target.value)}
                            />
                        </div>
                        <select 
                            className="bg-[#111] border border-white/5 rounded-xl px-4 text-[10px] font-black uppercase text-zinc-500 outline-none focus:border-[#00FF85] transition-all"
                            value={pInput.role}
                            onChange={(e) => updateInput(player.id, 'role', e.target.value)}
                        >
                            <option value="important">ROL: IMPORTANTE</option>
                            <option value="essential">ROL: ESENCIAL</option>
                        </select>
                        <Button 
                            className="h-11 bg-[#00FF85] text-black hover:bg-[#00CC6A] text-[9px] font-black uppercase px-8 rounded-xl"
                            disabled={isTriggering === player.id}
                            onClick={() => onTrigger(player.id, 'promotion_demand', { requestedSalary: Number(pInput.salary) || null, requestedRole: pInput.role })}
                        >
                            {isTriggering === player.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Obligar al jugador'}
                        </Button>
                      </div>
                    </div>

                    {/* Acción 3: Mensaje Libre */}
                    <div className="p-5 bg-[#050505] rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all">
                      <p className="text-[10px] font-black text-white uppercase tracking-widest mb-3">Redactar Mensaje Personalizado</p>
                      <div className="relative">
                          <Input 
                              placeholder="Escribe lo que el jugador debe decir al manager..."
                              className="h-14 bg-[#111] border-white/5 text-[11px] rounded-xl pr-14 italic"
                              value={pInput.customText}
                              onChange={(e) => updateInput(player.id, 'customText', e.target.value)}
                          />
                          <button 
                              onClick={() => onTrigger(player.id, 'general', { customText: pInput.customText })}
                              disabled={!pInput.customText || isTriggering === player.id}
                              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#00FF85] text-black rounded-lg hover:scale-105 disabled:opacity-20 transition-all flex items-center justify-center"
                          >
                              {isTriggering === player.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function OCMDisplay({ clubs, onUpdate }: { clubs: any[], onUpdate: () => void }) {
  const [selectedClubId, setSelectedClubId] = useState<string>('')
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set())
  const [updating, setUpdating] = useState(false)

  const selectedClub = clubs.find(c => c.id === selectedClubId)

  const togglePlayer = (id: string) => {
    const next = new Set(selectedPlayerIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedPlayerIds(next)
  }

  const handleBulkUpdate = async (status: boolean) => {
    if (selectedPlayerIds.size === 0) return
    setUpdating(true)
    try {
      const { error } = await supabase
        .from('players')
        .update({ is_one_club_man: status })
        .in('id', Array.from(selectedPlayerIds))

      if (error) throw error
      toast.success(`Actualizados ${selectedPlayerIds.size} jugadores con éxito`)
      setSelectedPlayerIds(new Set())
      onUpdate()
    } catch (err) {
      toast.error('Error al actualizar jugadores')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#141414] border border-white/5 p-8 rounded-[32px] shadow-2xl">
        <h3 className="text-xl font-black uppercase tracking-tighter mb-6 italic">Gestor de <span className="text-[#00FF85]">One Club Man</span></h3>
        
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          <div className="flex-1 space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">1. Seleccionar Club</label>
            <select 
              className="w-full bg-[#0A0A0A] border border-white/10 rounded-xl px-4 h-12 text-xs font-bold text-white outline-none focus:border-[#00FF85] transition-all"
              value={selectedClubId}
              onChange={(e) => {
                setSelectedClubId(e.target.value)
                setSelectedPlayerIds(new Set())
              }}
            >
              <option value="">-- Selecciona un club --</option>
              {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          
          <div className="flex items-end gap-3">
             <Button 
              disabled={selectedPlayerIds.size === 0 || updating}
              onClick={() => handleBulkUpdate(true)}
              className="bg-[#00FF85] text-black hover:bg-[#00CC6A] text-[10px] font-black uppercase px-6 h-12 rounded-xl shadow-[0_0_20px_rgba(0,255,133,0.15)]"
             >
                Activar OCM ({selectedPlayerIds.size})
             </Button>
             <Button 
              disabled={selectedPlayerIds.size === 0 || updating}
              onClick={() => handleBulkUpdate(false)}
              className="bg-red-500 hover:bg-red-600 text-white text-[10px] font-black uppercase px-6 h-12 rounded-xl"
             >
                Desactivar OCM
             </Button>
          </div>
        </div>

        {selectedClub ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest border-b border-white/5 pb-3">
               <div className="flex items-center gap-4">
                  <button onClick={() => {
                    if (selectedPlayerIds.size === selectedClub.players.length) setSelectedPlayerIds(new Set())
                    else setSelectedPlayerIds(new Set(selectedClub.players.map((p:any) => p.id)))
                  }} className="text-[#00FF85] hover:underline">
                    {selectedPlayerIds.size === selectedClub.players.length ? 'Deseleccionar Todo' : 'Seleccionar Todo'}
                  </button>
                  <span>Jugador</span>
               </div>
               <span className="text-right">Estado Actual</span>
            </div>
            
            <div className="grid gap-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {selectedClub.players.sort((a:any, b:any) => a.name.localeCompare(b.name)).map((player: any) => (
                <div 
                  key={player.id} 
                  onClick={() => togglePlayer(player.id)}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer ${
                    selectedPlayerIds.has(player.id) 
                      ? 'bg-[#00FF85]/5 border-[#00FF85]/30 shadow-[0_0_15px_rgba(0,255,133,0.05)]' 
                      : 'bg-[#0A0A0A] border-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                      selectedPlayerIds.has(player.id) ? 'bg-[#00FF85] border-[#00FF85]' : 'bg-transparent border-white/10'
                    }`}>
                      {selectedPlayerIds.has(player.id) && <Zap className="w-3 h-3 text-black fill-current" />}
                    </div>
                    <div>
                      <p className="text-[11px] font-black text-white uppercase">{player.name}</p>
                      <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">{player.position}</p>
                    </div>
                  </div>
                  
                  {player.is_one_club_man ? (
                    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg">
                       <Shield className="w-3 h-3 text-amber-500" />
                       <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest">ONE CLUB MAN</span>
                    </div>
                  ) : (
                    <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest px-3">Estándar</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-20 text-center border border-dashed border-white/5 rounded-3xl">
             <UserIcon className="w-10 h-10 text-white/5 mx-auto mb-4" />
             <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Selecciona un club para empezar a gestionar blindajes</p>
          </div>
        )}
      </div>
      
      <div className="bg-amber-500/5 border border-amber-500/10 p-6 rounded-[24px]">
        <div className="flex items-start gap-4">
           <div className="p-2 bg-amber-500/20 rounded-xl">
              <Shield className="w-5 h-5 text-amber-500" />
           </div>
           <div>
              <h4 className="text-xs font-black text-amber-500 uppercase tracking-widest mb-1">Nota de Seguridad</h4>
              <p className="text-[10px] text-amber-500/60 font-bold leading-relaxed">
                El estado <span className="text-amber-500">One Club Man</span> hace que el jugador sea innegociable e impagable por cláusula. Úsalo para proteger leyendas o jugadores clave del club. Los jugadores con este estado NO aparecerán como opción de fichaje en el mercado.
              </p>
           </div>
        </div>
      </div>
    </div>
  )
}
