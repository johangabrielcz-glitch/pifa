'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, Shield, UserCog, Loader2, ChevronRight, TrendingUp, Calendar, Trophy, Zap, Activity } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PifaLogo } from '@/components/pifa/logo'
import type { AuthSession, Season } from '@/lib/types'

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
      const stored = localStorage.getItem('pifa_auth_session')
      if (stored) {
        const session: AuthSession = JSON.parse(stored)
        setAdminName(session.user?.full_name || 'Admin')
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

      // Fetch active season
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

  const quickActions = [
    {
      href: '/admin/seasons',
      icon: <Calendar className="w-5 h-5" />,
      label: 'Temporadas',
      count: stats.seasons,
      description: 'Gestionar temporadas y competiciones',
      gradient: 'from-amber-500/20 to-yellow-600/10',
      iconColor: 'text-amber-400',
      ring: 'group-hover:ring-amber-400/30',
    },
    {
      href: '/admin/clubs',
      icon: <Shield className="w-5 h-5" />,
      label: 'Clubes',
      count: stats.clubs,
      description: 'Gestionar clubes y escudos',
      gradient: 'from-primary/20 to-orange-600/10',
      iconColor: 'text-primary',
      ring: 'group-hover:ring-primary/30',
    },
    {
      href: '/admin/players',
      icon: <UserCog className="w-5 h-5" />,
      label: 'Jugadores',
      count: stats.players,
      description: 'Gestionar plantillas',
      gradient: 'from-emerald-500/20 to-green-600/10',
      iconColor: 'text-emerald-400',
      ring: 'group-hover:ring-emerald-400/30',
    },
    {
      href: '/admin/users',
      icon: <Users className="w-5 h-5" />,
      label: 'Usuarios',
      count: stats.users,
      description: 'Gestionar DTs y admins',
      gradient: 'from-blue-500/20 to-indigo-600/10',
      iconColor: 'text-blue-400',
      ring: 'group-hover:ring-blue-400/30',
    },
  ]

  const statCards = [
    { icon: <Calendar className="w-4 h-4" />, value: stats.seasons, label: 'Temporadas', color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { icon: <Trophy className="w-4 h-4" />, value: stats.competitions, label: 'Compet.', color: 'text-purple-400', bg: 'bg-purple-400/10' },
    { icon: <Shield className="w-4 h-4" />, value: stats.clubs, label: 'Clubes', color: 'text-primary', bg: 'bg-primary/10' },
    { icon: <Users className="w-4 h-4" />, value: stats.users, label: 'Usuarios', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  ]

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="px-6 pt-10 pb-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-[#FF3131]/20 rounded-xl blur-lg animate-pulse" />
            <div className="relative w-12 h-12 rounded-2xl bg-[#141414] border border-[#202020] flex items-center justify-center shadow-2xl">
              <PifaLogo size="md" showText={false} />
            </div>
          </div>
          <div>
            <p className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.4em] font-black">Admin Access</p>
            <p className="text-xl font-black text-white uppercase tracking-tight">{adminName}</p>
          </div>
        </div>
        
        <div className="space-y-1">
          <h1 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">
            CENTRO DE <span className="text-[#FF3131]">MANDO</span>
          </h1>
          <p className="text-xs text-[#6A6C6E] font-bold uppercase tracking-widest mt-2 bg-[#141414] w-fit px-3 py-1 rounded-lg border border-white/[0.04]">
            PIFA Federation Management
          </p>
        </div>
      </header>

      {/* Main Content */}
      <div className="px-6 space-y-8 pb-32">
        
        {/* Active Season Hero Card */}
        {activeSeason && (
          <Link href={`/admin/seasons/${activeSeason.id}`} className="block group">
            <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#FF3131]/10 via-[#141414] to-[#0A0A0A] border border-[#FF3131]/20 p-6 transition-all duration-500 group-hover:border-[#FF3131]/40 group-hover:shadow-[0_0_40px_rgba(255,49,49,0.15)] group-active:scale-[0.98]">
              {/* Animated background glow */}
              <div className="absolute -top-20 -right-20 w-60 h-60 bg-[#FF3131]/10 rounded-full blur-[100px] group-hover:bg-[#FF3131]/20 transition-all duration-700" />
              
              <div className="relative flex items-center gap-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-[#FF3131]/30 rounded-2xl blur-xl animate-pulse" />
                  <div className="relative w-16 h-16 rounded-[22px] bg-gradient-to-br from-[#FF3131] to-[#D32F2F] flex items-center justify-center shadow-2xl border border-white/10">
                    <Zap className="w-8 h-8 text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#FF3131] bg-[#FF3131]/10 px-3 py-1 rounded-full border border-[#FF3131]/20 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF3131] animate-ping" />
                      Season Active
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-white mt-2 uppercase tracking-tight leading-none">{activeSeason.name}</h3>
                  <p className="text-[10px] text-[#6A6C6E] font-bold uppercase tracking-widest mt-1">{activeSeason.competitions_count} COMPETICIONES EN CURSO</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E] group-hover:text-white group-hover:border-[#FF3131]/40 transition-all">
                  <ChevronRight className="w-6 h-6" />
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* Overview Stats */}
        <div className="grid grid-cols-2 gap-3">
          {isLoading ? (
            <div className="col-span-2 flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#FF3131]" />
            </div>
          ) : (
            statCards.map((stat, i) => (
              <div 
                key={stat.label}
                className="relative group bg-[#141414]/50 backdrop-blur-xl rounded-[24px] p-5 border border-white/[0.04] overflow-hidden transition-all duration-300 hover:border-[#FF3131]/30"
              >
                <div className="absolute -top-10 -right-10 w-24 h-24 bg-[#FF3131]/5 rounded-full blur-2xl group-hover:bg-[#FF3131]/10 transition-all" />
                <div className={`w-10 h-10 rounded-[14px] ${stat.bg.replace('bg-', 'bg-[#141414] border border-')} flex items-center justify-center mb-4 shadow-lg`}>
                  <div className={stat.color}>{stat.icon}</div>
                </div>
                <p className="text-3xl font-black text-white tracking-tighter leading-none">{stat.value}</p>
                <p className="text-[9px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black mt-2">{stat.label}</p>
              </div>
            ))
          )}
        </div>

        {/* Global Activity Summary */}
        <div className="relative overflow-hidden bg-[#141414]/50 backdrop-blur-xl rounded-[32px] p-6 border border-white/[0.04]">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center shadow-xl">
              <Activity className="w-6 h-6 text-[#FF3131]" />
            </div>
            <div>
              <p className="text-sm font-black text-white uppercase tracking-widest">Resumen de Actividad</p>
              <p className="text-[10px] text-[#6A6C6E] font-bold uppercase tracking-tight">Estadísticas globales de la liga</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between group">
              <span className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-[0.15em] group-hover:text-white transition-colors">Jugadores por Club</span>
              <div className="flex items-center gap-4 flex-1 mx-6">
                <div className="h-1.5 flex-1 bg-white/[0.05] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#FF3131] to-orange-500 w-[65%]" />
                </div>
              </div>
              <span className="text-sm font-black text-white tabular-nums">
                {stats.clubs > 0 ? (stats.players / stats.clubs).toFixed(1) : '0'}
              </span>
            </div>
            <div className="flex items-center justify-between group">
              <span className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-[0.15em] group-hover:text-white transition-colors">Tasa de Competitividad</span>
              <div className="flex items-center gap-4 flex-1 mx-6">
                <div className="h-1.5 flex-1 bg-white/[0.05] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#FF3131] to-purple-600 w-[42%]" />
                </div>
              </div>
              <span className="text-sm font-black text-white tabular-nums">{stats.competitions}</span>
            </div>
          </div>
        </div>

        {/* Admin Navigation Options */}
        <div className="space-y-4 pt-2">
          <h2 className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-[0.3em] ml-2">Terminal de Aplicaciones</h2>
          <div className="grid gap-3">
            {quickActions.map((action, i) => (
              <Link
                key={action.href}
                href={action.href}
                className="group relative flex items-center gap-5 bg-[#141414] rounded-[24px] p-5 border border-white/[0.04] transition-all duration-300 hover:bg-[#1A1A1A] hover:border-[#FF3131]/20 active:scale-[0.98] shadow-xl overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-[#FF3131]/0 via-[#FF3131]/0 to-[#FF3131]/0 group-hover:from-[#FF3131]/5 transition-all duration-700" />
                
                <div className={`relative w-14 h-14 rounded-[18px] bg-[#0A0A0A] border border-[#202020] flex items-center justify-center transition-all duration-500 group-hover:rotate-6 group-hover:scale-110 shadow-lg`}>
                  <div className={action.iconColor}>{action.icon}</div>
                </div>
                
                <div className="relative flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-sm font-black text-white uppercase tracking-widest leading-none">{action.label}</p>
                    <span className="text-[11px] font-black text-[#FF3131] tabular-nums bg-[#FF3131]/10 px-2 py-0.5 rounded-md border border-[#FF3131]/10">
                      {action.count}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#6A6C6E] font-bold uppercase tracking-tight">{action.description}</p>
                </div>
                <div className="relative w-8 h-8 rounded-full bg-[#0A0A0A] border border-[#202020] flex items-center justify-center text-[#2D2D2D] group-hover:text-white group-hover:border-[#FF3131]/30 transition-all">
                  <ChevronRight size={18} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
