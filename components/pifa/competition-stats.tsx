'use client'

import { Goal, HandHelping, Star, User } from 'lucide-react'
import type { PlayerCompetitionStats, Player } from '@/lib/types'

interface CompetitionStatsProps {
  stats: (PlayerCompetitionStats & { player?: Player })[]
  highlightClubId?: string
  limit?: number
}

export function TopScorers({ stats, highlightClubId, limit = 5 }: CompetitionStatsProps) {
  const sorted = [...stats]
    .filter(s => s.goals > 0)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, limit)

  if (sorted.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-xs">
        Sin goleadores registrados
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Goal className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wider">Goleadores</span>
      </div>
      {sorted.map((stat, index) => {
        const isHighlighted = stat.club_id === highlightClubId
        return (
          <div 
            key={stat.id} 
            className={`flex items-center gap-3 p-2 rounded-lg ${isHighlighted ? 'bg-primary/10' : 'bg-muted/30'}`}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              index === 0 ? 'bg-pifa-gold/20 text-pifa-gold' :
              index === 1 ? 'bg-zinc-400/20 text-zinc-400' :
              index === 2 ? 'bg-amber-700/20 text-amber-600' :
              'bg-muted text-muted-foreground'
            }`}>
              {index + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${isHighlighted ? 'text-primary' : 'text-foreground'}`}>
                {stat.player?.name}
              </p>
              <p className="text-[10px] text-muted-foreground">{stat.player?.position}</p>
            </div>
            <div className="flex items-center gap-1 text-primary font-bold">
              <Goal className="w-3.5 h-3.5" />
              <span>{stat.goals}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function TopAssists({ stats, highlightClubId, limit = 5 }: CompetitionStatsProps) {
  const sorted = [...stats]
    .filter(s => s.assists > 0)
    .sort((a, b) => b.assists - a.assists)
    .slice(0, limit)

  if (sorted.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-xs">
        Sin asistentes registrados
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <HandHelping className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wider">Asistencias</span>
      </div>
      {sorted.map((stat, index) => {
        const isHighlighted = stat.club_id === highlightClubId
        return (
          <div 
            key={stat.id} 
            className={`flex items-center gap-3 p-2 rounded-lg ${isHighlighted ? 'bg-primary/10' : 'bg-muted/30'}`}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              index === 0 ? 'bg-blue-500/20 text-blue-400' :
              index === 1 ? 'bg-zinc-400/20 text-zinc-400' :
              index === 2 ? 'bg-amber-700/20 text-amber-600' :
              'bg-muted text-muted-foreground'
            }`}>
              {index + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${isHighlighted ? 'text-primary' : 'text-foreground'}`}>
                {stat.player?.name}
              </p>
              <p className="text-[10px] text-muted-foreground">{stat.player?.position}</p>
            </div>
            <div className="flex items-center gap-1 text-blue-400 font-bold">
              <HandHelping className="w-3.5 h-3.5" />
              <span>{stat.assists}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function TopMVPs({ stats, highlightClubId, limit = 5 }: CompetitionStatsProps) {
  const sorted = [...stats]
    .filter(s => s.mvp_count > 0)
    .sort((a, b) => b.mvp_count - a.mvp_count)
    .slice(0, limit)

  if (sorted.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-xs">
        Sin MVPs registrados
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Star className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wider">MVPs</span>
      </div>
      {sorted.map((stat, index) => {
        const isHighlighted = stat.club_id === highlightClubId
        return (
          <div 
            key={stat.id} 
            className={`flex items-center gap-3 p-2 rounded-lg ${isHighlighted ? 'bg-primary/10' : 'bg-muted/30'}`}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              index === 0 ? 'bg-pifa-gold/20 text-pifa-gold' :
              index === 1 ? 'bg-zinc-400/20 text-zinc-400' :
              index === 2 ? 'bg-amber-700/20 text-amber-600' :
              'bg-muted text-muted-foreground'
            }`}>
              {index + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${isHighlighted ? 'text-primary' : 'text-foreground'}`}>
                {stat.player?.name}
              </p>
              <p className="text-[10px] text-muted-foreground">{stat.player?.position}</p>
            </div>
            <div className="flex items-center gap-1 text-pifa-gold font-bold">
              <Star className="w-3.5 h-3.5" />
              <span>{stat.mvp_count}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
