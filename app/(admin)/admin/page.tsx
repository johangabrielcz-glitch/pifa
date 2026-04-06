'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, Shield, UserCog, Loader2, ChevronRight, TrendingUp, Calendar, Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PifaLogo } from '@/components/pifa/logo'
import type { AuthSession } from '@/lib/types'

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

      setIsLoading(false)
    }

    loadData()
  }, [])

  const quickActions = [
    {
      href: '/admin/seasons',
      icon: <Calendar className="w-6 h-6" />,
      label: 'Temporadas',
      count: stats.seasons,
      description: 'Gestionar temporadas y competiciones',
      iconBg: 'bg-pifa-gold/20',
      iconColor: 'text-pifa-gold',
    },
    {
      href: '/admin/clubs',
      icon: <Shield className="w-6 h-6" />,
      label: 'Clubes',
      count: stats.clubs,
      description: 'Gestionar clubes',
      iconBg: 'bg-primary/20',
      iconColor: 'text-primary',
    },
    {
      href: '/admin/players',
      icon: <UserCog className="w-6 h-6" />,
      label: 'Jugadores',
      count: stats.players,
      description: 'Gestionar plantillas',
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-400',
    },
    {
      href: '/admin/users',
      icon: <Users className="w-6 h-6" />,
      label: 'Usuarios',
      count: stats.users,
      description: 'Gestionar DTs y admins',
      iconBg: 'bg-blue-500/20',
      iconColor: 'text-blue-400',
    },
  ]

  return (
    <div className="min-h-dvh safe-area-top">
      {/* Background accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-pifa-gradient rounded-full blur-3xl opacity-10" />
      </div>

      {/* Header */}
      <header className="relative px-5 pt-6 pb-8">
        <div className="flex items-center gap-3 mb-8">
          <PifaLogo size="sm" showText={false} />
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Panel Admin</p>
            <p className="text-sm font-medium text-foreground">{adminName}</p>
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-foreground">
          Bienvenido
        </h1>
        <p className="text-muted-foreground mt-1">
          Gestiona la federación PIFA
        </p>
      </header>

      {/* Main Content */}
      <div className="relative px-5 space-y-6 pb-24">
        
        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2">
          {isLoading ? (
            <div className="col-span-4 flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="bg-card rounded-2xl p-3 pifa-shadow border border-border text-center">
                <div className="w-7 h-7 rounded-lg bg-pifa-gold/20 flex items-center justify-center mx-auto mb-1.5">
                  <Calendar className="w-3.5 h-3.5 text-pifa-gold" />
                </div>
                <p className="text-xl font-bold text-foreground">{stats.seasons}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Temporadas</p>
              </div>
              <div className="bg-card rounded-2xl p-3 pifa-shadow border border-border text-center">
                <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center mx-auto mb-1.5">
                  <Trophy className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <p className="text-xl font-bold text-foreground">{stats.competitions}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Compet.</p>
              </div>
              <div className="bg-card rounded-2xl p-3 pifa-shadow border border-border text-center">
                <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center mx-auto mb-1.5">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                </div>
                <p className="text-xl font-bold text-foreground">{stats.clubs}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Clubes</p>
              </div>
              <div className="bg-card rounded-2xl p-3 pifa-shadow border border-border text-center">
                <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center mx-auto mb-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <p className="text-xl font-bold text-foreground">{stats.users}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Usuarios</p>
              </div>
            </>
          )}
        </div>

        {/* Overview Card */}
        <div className="bg-gradient-to-br from-card to-pifa-surface-elevated rounded-2xl p-5 border border-border pifa-shadow">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-pifa-gold/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-pifa-gold" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Resumen PIFA</p>
              <p className="text-xs text-muted-foreground">Estadísticas generales</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Promedio jugadores/club</span>
            <span className="font-semibold text-foreground">
              {stats.clubs > 0 ? (stats.players / stats.clubs).toFixed(1) : '0'}
            </span>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-bold mb-4">Acciones Rápidas</h2>
          <div className="space-y-3">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="group flex items-center gap-4 bg-card rounded-2xl p-4 pifa-shadow border border-border touch-active hover:border-primary/30 transition-colors"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${action.iconBg}`}>
                  <div className={action.iconColor}>{action.icon}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-foreground">{action.label}</p>
                    <span className="text-lg font-bold text-muted-foreground">
                      {action.count}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
