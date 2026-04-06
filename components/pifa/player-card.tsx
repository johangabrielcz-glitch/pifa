'use client'

import { User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Player } from '@/lib/types'

interface PlayerCardProps {
  player: Player
  className?: string
  compact?: boolean
}

const positionColors: Record<string, string> = {
  GK: 'bg-yellow-500/20 text-yellow-700',
  CB: 'bg-blue-500/20 text-blue-700',
  LB: 'bg-blue-500/20 text-blue-700',
  RB: 'bg-blue-500/20 text-blue-700',
  CDM: 'bg-green-500/20 text-green-700',
  CM: 'bg-green-500/20 text-green-700',
  CAM: 'bg-green-500/20 text-green-700',
  LM: 'bg-green-500/20 text-green-700',
  RM: 'bg-green-500/20 text-green-700',
  LW: 'bg-red-500/20 text-red-700',
  RW: 'bg-red-500/20 text-red-700',
  ST: 'bg-red-500/20 text-red-700',
  CF: 'bg-red-500/20 text-red-700',
}

export function PlayerCard({ player, className, compact = false }: PlayerCardProps) {
  const positionClass = positionColors[player.position] || 'bg-muted text-muted-foreground'

  if (compact) {
    return (
      <div className={cn(
        'flex items-center gap-3 p-3 bg-card rounded-xl border border-border/50',
        className
      )}>
        {/* Number */}
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-primary">
            {player.number || '-'}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{player.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', positionClass)}>
              {player.position}
            </span>
            {player.nationality && (
              <span className="text-[10px] text-muted-foreground truncate">
                {player.nationality}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      'bg-card rounded-2xl p-4 pifa-shadow border border-border/50',
      className
    )}>
      {/* Header with number and position */}
      <div className="flex items-start justify-between mb-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <span className="text-lg font-bold text-primary">
            {player.number || '-'}
          </span>
        </div>
        <span className={cn('text-xs px-3 py-1 rounded-full font-medium', positionClass)}>
          {player.position}
        </span>
      </div>

      {/* Photo */}
      <div className="flex justify-center mb-3">
        {player.photo_url ? (
          <div className="w-20 h-20 rounded-full overflow-hidden bg-muted">
            <img
              src={player.photo_url}
              alt={player.name}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center">
            <User className="w-10 h-10 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Name */}
      <h3 className="font-bold text-center text-foreground mb-1">
        {player.name}
      </h3>

      {/* Details */}
      <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
        {player.age && <span>{player.age} años</span>}
        {player.nationality && (
          <>
            {player.age && <span>•</span>}
            <span>{player.nationality}</span>
          </>
        )}
      </div>
    </div>
  )
}
