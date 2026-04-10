'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { 
  Users, 
  Shield, 
  UserCog, 
  Loader2, 
  ChevronRight, 
  Calendar, 
  Trophy, 
  Zap, 
  Activity,
  ArrowUpRight,
  Database,
  Globe,
  LayoutDashboard
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { syncPushToken } from '@/lib/push-notifications'
import { toast } from 'sonner'
import { PifaLogo } from '@/components/pifa/logo'
import type { AuthSession, Season, User } from '@/lib/types'

interface Stats {
  users: number
  clubs: number
  players: number
  seasons: number
  competitions: number
}

export default function AdminDashboardPage() {
  const [adminName, setAdminName] = useState('')
  const [stats, setStats] = useState<Stats>({ users: 0, clubs: 0, players: 0, seasons: 0, competitions: 0 })
  const [activeSeason, setActiveSeason] = useState<(Season & { competitions_count: number }) | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      const stored = localStorage.getItem('pifa_admin_user')
      if (stored) {
        const user = JSON.parse(stored)
        setAdminName(user.full_name || 'Admin')

        // Sincronizar token si existe
        const token = localStorage.getItem('expoPushToken')
        if (token) {
          syncPushToken(user.id, user.full_name || 'Admin', 'login')
            .then(res => {
              if (res.success) {
                toast.success('Token Admin Sincronizado ✅')
              } else {
                toast.error('Error token admin: ' + res.error)
              }
            })
        }
      }

      const [usersRes, clubsRes, playersRes, seasonsRes, compsRes] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('clubs').select('id', { count: 'exact', head: true }),
        supabase.from('players').select('id', { count: 'exact', head: true }),
        supabase.from('seasons').select('id', { count: 'exact', head: true }),
        supabase.from('competitions').select('id', { count: 'exact', head: true }),
      ])

      setStats({
        users: usersRes.count || 0,
        clubs: clubsRes.count || 0,
        players: playersRes.count || 0,
        seasons: seasonsRes.count || 0,
        competitions: compsRes.count || 0,
      })

      const { data: activeData } = await supabase
        .from('seasons')
        .select('*, competitions(id)')
        .eq('status', 'active')
        .single()

      if (activeData) {
        setActiveSeason({
          ...activeData,
          competitions_count: activeData.competitions?.length || 0,
          competitions: undefined as any,
        } as Season & { competitions_count: number })
      }

      setIsLoading(false)
    }

    loadData()
  }, [])

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Background Ambience */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[5%] -left-[5%] w-[30%] h-[30%] bg-[#FF3131]/5 rounded-full blur-[80px] animate-pulse" />
      </div>

      {/* Header Section */}
      <header className="relative px-6 pt-10 pb-5">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="relative group">
              <div className="absolute inset-0 bg-[#FF3131]/10 rounded-xl blur-lg" />
              <div className="relative w-10 h-10 rounded-xl bg-[#141414] border border-white/[0.05] flex items-center justify-center shadow-xl overflow-hidden">
                <PifaLogo size="xs" showText={false} />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[7px] text-[#6A6C6E] uppercase tracking-[0.4em] font-black">Authorized</p>
              </div>
              <p className="text-base font-black text-white uppercase tracking-tighter leading-none mt-0.5">
                Hola, <span className="text-[#FF3131]">{adminName.split(' ')[0]}</span>
              </p>
            </div>
          </div>

        </div>

        <div className="relative">
          <h1 className="text-2xl font-black text-white tracking-tighter uppercase leading-none mb-1.5">
            CONSOLA <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF3131] to-[#D32F2F]">FEDERAL</span>
          </h1>
          <div className="flex items-center gap-2">
            <div className="h-[1px] w-4 bg-[#FF3131]" />
            <p className="text-[8px] text-[#6A6C6E] font-black uppercase tracking-[0.3em]">Gestión de Red PIFA</p>
          </div>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="relative px-6 space-y-5 pb-32">
        
        {/* Active Season Highlight (HERO) */}
        <section>
          {activeSeason ? (
            <Link href={`/admin/seasons/${activeSeason.id}`} className="group relative block">
              <div className="relative overflow-hidden rounded-[24px] bg-[#141414] border border-white/[0.05] p-5 transition-all duration-300 group-hover:border-[#FF3131]/40 shadow-xl">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF3131]/5 rounded-full blur-2xl -mr-10 -mt-10" />
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#FF3131] to-[#A30000] flex items-center justify-center shadow-lg border border-white/10">
                      <Zap className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="px-1.5 py-0.5 rounded-full bg-[#FF3131]/10 border border-[#FF3131]/20 w-fit mb-0.5">
                        <p className="text-[6px] font-black text-[#FF3131] uppercase tracking-[0.2em]">En Curso</p>
                      </div>
                      <h2 className="text-lg font-black text-white uppercase tracking-tighter group-hover:text-[#FF3131] transition-colors line-clamp-1">{activeSeason.name}</h2>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-[#2D2D2D] group-hover:text-white transition-all" />
                </div>
              </div>
            </Link>
          ) : (
            <div className="rounded-[24px] bg-[#141414]/30 border border-dashed border-white/[0.08] p-6 text-center">
              <p className="text-[7px] text-[#2D2D2D] font-black uppercase tracking-[0.4em] mb-3">Sin fase activa</p>
              <Link href="/admin/seasons" className="inline-flex items-center gap-2 px-4 py-2 bg-white/[0.03] hover:bg-[#FF3131]/10 rounded-lg border border-white/[0.05] transition-all">
                <span className="text-[7px] font-black text-white uppercase tracking-widest">Iniciar Nueva</span>
              </Link>
            </div>
          )}
        </section>

        {/* Stats Grid */}
        <section className="grid grid-cols-2 gap-3">
          {[
            { label: 'Clubes', value: stats.clubs, icon: <Shield className="w-4 h-4" />, color: 'text-primary' },
            { label: 'Atletas', value: stats.players, icon: <UserCog className="w-4 h-4" />, color: 'text-emerald-400' },
            { label: 'Usuarios', value: stats.users, icon: <Users className="w-4 h-4" />, color: 'text-blue-400' },
            { label: 'Eventos', value: stats.competitions, icon: <Trophy className="w-4 h-4" />, color: 'text-amber-400' },
          ].map((item) => (
            <div 
              key={item.label}
              className="group bg-[#141414] rounded-[20px] p-4 border border-white/[0.04] transition-all"
            >
              <div className={`${item.color} mb-2.5 opacity-40`}>{item.icon}</div>
              <p className="text-2xl font-black text-white tracking-tighter leading-none mb-0.5">{item.value}</p>
              <p className="text-[7px] text-[#6A6C6E] font-black uppercase tracking-widest leading-none">{item.label}</p>
            </div>
          ))}
        </section>

        {/* Global Infrastructure Status */}
        <section className="bg-[#141414] rounded-[24px] p-5 border border-white/[0.04]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-[#FF3131]/5 border border-[#FF3131]/20 flex items-center justify-center">
              <Activity className="w-4 h-4 text-[#FF3131]" />
            </div>
            <div>
              <p className="text-[10px] font-black text-white uppercase tracking-widest leading-none">Status Operativo</p>
              <p className="text-[7px] text-[#6A6C6E] font-black uppercase tracking-[0.2em] mt-0.5">Infraestructure Monitoring</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <div className="flex items-center gap-2">
                <Database className="w-3 h-3 text-[#2D2D2D]" />
                <span className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-widest">PostgreSQL</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <div className="flex items-center gap-2">
                <Globe className="w-3 h-3 text-[#2D2D2D]" />
                <span className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-widest">Mercado</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-[#FF3131] shadow-[0_0_5px_rgba(255,49,49,0.5)]" />
            </div>
          </div>
        </section>

      </main>
    </div>
  )
}

function StatusRow({ icon, label, status, color }: { icon: any, label: string, status: string, color: string }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] group hover:bg-white/[0.05] transition-all">
      <div className="flex items-center gap-4">
        <div className="p-2.5 rounded-xl bg-[#0A0A0A] border border-[#202020] text-[#6A6C6E] group-hover:text-white transition-colors">
          {icon}
        </div>
        <p className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-widest group-hover:text-white transition-colors">{label}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${color.replace('text-', 'bg-')}`} />
        <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${color}`}>{status}</p>
      </div>
    </div>
  )
}

function Plus({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
  )
}
