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
    <div className="min-h-dvh safe-area-top">
      {/* Background accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-pifa-gradient rounded-full blur-3xl opacity-8" />
        <div className="absolute top-40 -left-20 w-40 h-40 bg-blue-500 rounded-full blur-3xl opacity-5" />
      </div>

      {/* Header */}
      <header className="relative px-5 pt-6 pb-6">
        <div className="flex items-center gap-3 mb-6">
          <PifaLogo size="sm" showText={false} />
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Panel Admin</p>
            <p className="text-sm font-semibold text-foreground">{adminName}</p>
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-foreground">
          Bienvenido 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestiona la federación PIFA
        </p>
      </header>

      {/* Main Content */}
      <div className="relative px-5 space-y-5 pb-24">
        
        {/* Active Season Hero Card */}
        {activeSeason && (
          <Link href={`/admin/seasons/${activeSeason.id}`} className="block group">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/10 via-card to-primary/5 border border-emerald-500/20 p-4 transition-all duration-300 group-hover:border-emerald-400/40 group-hover:shadow-[0_0_30px_rgba(16,185,129,0.1)]">
              {/* Animated background */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-400/10 to-transparent rounded-full blur-2xl" />
              
              <div className="relative flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-emerald-400/30 rounded-xl blur-md animate-pulse" />
                  <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full animate-pulse">
                      ● LIVE
                    </span>
                  </div>
                  <h3 className="font-bold text-foreground mt-1">{activeSeason.name}</h3>
                  <p className="text-xs text-muted-foreground">{activeSeason.competitions_count} competiciones activas</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-emerald-400 transition-colors" />
              </div>
            </div>
          </Link>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2">
          {isLoading ? (
            <div className="col-span-4 flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            statCards.map((stat, i) => (
              <div 
                key={stat.label}
                className="bg-card/60 backdrop-blur-sm rounded-2xl p-3 border border-white/[0.06] text-center animate-fade-in-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className={`w-8 h-8 rounded-xl ${stat.bg} flex items-center justify-center mx-auto mb-1.5`}>
                  <div className={stat.color}>{stat.icon}</div>
                </div>
                <p className="text-xl font-bold text-foreground animate-count">{stat.value}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">{stat.label}</p>
              </div>
            ))
          )}
        </div>

        {/* Overview Card */}
        <div className="bg-gradient-to-br from-card via-card to-primary/5 rounded-2xl p-4 border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-pifa-red/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">Resumen PIFA</p>
              <p className="text-[10px] text-muted-foreground">Estadísticas generales</p>
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Promedio jugadores/club</span>
              <span className="font-bold text-foreground">
                {stats.clubs > 0 ? (stats.players / stats.clubs).toFixed(1) : '0'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Competiciones activas</span>
              <span className="font-bold text-foreground">{stats.competitions}</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">Acciones Rápidas</h2>
          <div className="space-y-2.5">
            {quickActions.map((action, i) => (
              <Link
                key={action.href}
                href={action.href}
                className="group flex items-center gap-4 bg-card/60 backdrop-blur-sm rounded-2xl p-4 border border-white/[0.06] transition-all duration-300 hover:bg-card/80 hover:border-white/[0.1] hover:shadow-lg active:scale-[0.98] animate-fade-in-up"
                style={{ animationDelay: `${(i + 4) * 60}ms` }}
              >
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center ring-1 ring-transparent transition-all duration-300 ${action.ring}`}>
                  <div className={action.iconColor}>{action.icon}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-foreground text-sm">{action.label}</p>
                    <span className="text-lg font-bold text-muted-foreground/60 tabular-nums">
                      {action.count}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground/60 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
