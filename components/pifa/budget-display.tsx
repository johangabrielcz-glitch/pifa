'use client'

import { DollarSign, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BudgetDisplayProps {
  budget: number
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function BudgetDisplay({ budget, className, size = 'md' }: BudgetDisplayProps) {
  const formatBudget = (amount: number) => {
    if (amount >= 1_000_000) {
      return `$${(amount / 1_000_000).toFixed(1)}M`
    }
    if (amount >= 1_000) {
      return `$${(amount / 1_000).toFixed(0)}K`
    }
    return `$${amount}`
  }

  const formatFullBudget = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const sizeClasses = {
    sm: {
      container: 'p-3',
      icon: 'w-8 h-8',
      iconSize: 'w-4 h-4',
      label: 'text-[10px]',
      value: 'text-lg',
    },
    md: {
      container: 'p-4',
      icon: 'w-10 h-10',
      iconSize: 'w-5 h-5',
      label: 'text-xs',
      value: 'text-2xl',
    },
    lg: {
      container: 'p-6',
      icon: 'w-12 h-12',
      iconSize: 'w-6 h-6',
      label: 'text-sm',
      value: 'text-3xl',
    },
  }

  const classes = sizeClasses[size]

  return (
    <div className={cn(
      'bg-gradient-to-br from-primary/10 to-accent/10 rounded-2xl border border-primary/20',
      classes.container,
      className
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          'rounded-xl bg-primary/20 flex items-center justify-center',
          classes.icon
        )}>
          <DollarSign className={cn('text-primary', classes.iconSize)} />
        </div>
        <div className="flex-1">
          <p className={cn('text-muted-foreground font-medium', classes.label)}>
            Presupuesto disponible
          </p>
          <p className={cn('font-bold text-foreground', classes.value)}>
            {formatBudget(budget)}
          </p>
          {size !== 'sm' && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {formatFullBudget(budget)}
            </p>
          )}
        </div>
        <TrendingUp className="w-5 h-5 text-green-500" />
      </div>
    </div>
  )
}
