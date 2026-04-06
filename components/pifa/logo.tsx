'use client'

import { cn } from '@/lib/utils'

interface PifaLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  className?: string
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-12 h-12',
  lg: 'w-20 h-20',
  xl: 'w-32 h-32',
}

const textSizeClasses = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-3xl',
  xl: 'text-5xl',
}

export function PifaLogo({ size = 'md', showText = true, className }: PifaLogoProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      {/* Phoenix Icon */}
      <div className={cn('relative', sizeClasses[size])}>
        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Phoenix body */}
          <defs>
            <linearGradient id="phoenixGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="oklch(0.85 0.15 80)" />
              <stop offset="50%" stopColor="oklch(0.65 0.2 45)" />
              <stop offset="100%" stopColor="oklch(0.55 0.22 25)" />
            </linearGradient>
            <linearGradient id="wingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="oklch(0.75 0.18 55)" />
              <stop offset="100%" stopColor="oklch(0.55 0.22 25)" />
            </linearGradient>
          </defs>
          
          {/* Main body */}
          <ellipse cx="50" cy="55" rx="15" ry="25" fill="url(#phoenixGradient)" />
          
          {/* Left wing */}
          <path
            d="M35 45 Q5 25 15 60 Q25 75 35 55"
            fill="url(#wingGradient)"
          />
          <path
            d="M30 40 Q10 20 8 50 Q15 65 30 50"
            fill="url(#phoenixGradient)"
            opacity="0.8"
          />
          
          {/* Right wing */}
          <path
            d="M65 45 Q95 25 85 60 Q75 75 65 55"
            fill="url(#wingGradient)"
          />
          <path
            d="M70 40 Q90 20 92 50 Q85 65 70 50"
            fill="url(#phoenixGradient)"
            opacity="0.8"
          />
          
          {/* Head */}
          <circle cx="50" cy="28" r="10" fill="url(#phoenixGradient)" />
          
          {/* Beak */}
          <path
            d="M50 32 L45 38 L50 36 L55 38 Z"
            fill="oklch(0.55 0.22 25)"
          />
          
          {/* Eyes */}
          <circle cx="46" cy="26" r="2" fill="oklch(0.15 0.02 30)" />
          <circle cx="54" cy="26" r="2" fill="oklch(0.15 0.02 30)" />
          
          {/* Tail feathers */}
          <path
            d="M50 80 Q45 95 40 98"
            stroke="url(#phoenixGradient)"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M50 80 Q50 95 50 99"
            stroke="url(#wingGradient)"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M50 80 Q55 95 60 98"
            stroke="url(#phoenixGradient)"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          
          {/* Crown flames */}
          <path
            d="M42 20 Q44 10 46 18"
            stroke="oklch(0.85 0.15 80)"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M48 18 Q50 6 52 18"
            stroke="oklch(0.65 0.2 45)"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M54 20 Q56 10 58 18"
            stroke="oklch(0.85 0.15 80)"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
      
      {showText && (
        <div className="flex flex-col items-center">
          <span className={cn(
            'font-bold tracking-wider text-pifa-gradient',
            textSizeClasses[size]
          )}>
            PIFA
          </span>
          {size !== 'sm' && (
            <span className="text-xs text-muted-foreground tracking-widest uppercase">
              Football Association
            </span>
          )}
        </div>
      )}
    </div>
  )
}
