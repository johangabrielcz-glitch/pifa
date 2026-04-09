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
      {/* Phoenix Logo Image */}
      <div className={cn('relative flex items-center justify-center', sizeClasses[size])}>
        <img 
          src="/logo-app.png" 
          alt="PIFA Logo" 
          className="w-full h-full object-contain logo-orange-glow animate-logo-pulse"
        />
      </div>
      
      {showText && (
        <div className="flex flex-col items-center">
          <span className={cn(
            'font-black tracking-tighter text-white italic',
            textSizeClasses[size]
          )}>
            PIFA <span className="text-[#00FF85]">DT</span>
          </span>
          {size !== 'sm' && (
            <span className="text-[10px] font-bold text-[#6A6C6E] uppercase tracking-[0.4em] mt-1">
              Football Management
            </span>
          )}
        </div>
      )}
    </div>
  )
}
