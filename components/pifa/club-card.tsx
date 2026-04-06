'use client'

import { Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Club } from '@/lib/types'

interface ClubCardProps {
  club: Club
  className?: string
  showBudget?: boolean
}

export function ClubCard({ club, className, showBudget = true }: ClubCardProps) {
  const formatBudget = (budget: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(budget)
  }

  return (
    <div className={cn(
      'bg-card rounded-2xl p-6 pifa-shadow border border-border/50',
      className
    )}>
      {/* Shield/Logo */}
      <div className="flex flex-col items-center mb-4">
        {club.shield_url ? (
          <div className="w-24 h-24 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
            <img
              src={club.shield_url}
              alt={`Escudo de ${club.name}`}
              className="w-full h-full object-contain"
            />
          </div>
        ) : (
          <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <Shield className="w-12 h-12 text-primary" />
          </div>
        )}
      </div>

      {/* Club Name */}
      <h2 className="text-xl font-bold text-center text-foreground mb-2">
        {club.name}
      </h2>

      {/* Budget */}
      {showBudget && (
        <div className="mt-4 p-4 bg-secondary/50 rounded-xl">
          <p className="text-xs text-muted-foreground text-center mb-1">Presupuesto</p>
          <p className="text-2xl font-bold text-center text-primary">
            {formatBudget(club.budget)}
          </p>
        </div>
      )}
    </div>
  )
}
