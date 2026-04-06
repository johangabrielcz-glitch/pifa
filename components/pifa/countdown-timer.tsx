'use client'

import { useEffect, useState } from 'react'
import { Timer, AlertTriangle } from 'lucide-react'

interface CountdownTimerProps {
  deadline: string // ISO timestamp
  onExpired?: () => void
  size?: 'sm' | 'md' | 'lg'
}

export function CountdownTimer({ deadline, onExpired, size = 'md' }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number
    minutes: number
    seconds: number
    totalMs: number
    expired: boolean
  }>({ hours: 0, minutes: 0, seconds: 0, totalMs: 0, expired: false })

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Date.now()
      const deadlineMs = new Date(deadline).getTime()
      const diff = deadlineMs - now

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, totalMs: 0, expired: true })
        onExpired?.()
        return true // expired
      }

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      setTimeLeft({ hours, minutes, seconds, totalMs: diff, expired: false })
      return false
    }

    // Initial calculation
    const isExpired = calculateTimeLeft()
    if (isExpired) return

    const interval = setInterval(() => {
      const expired = calculateTimeLeft()
      if (expired) clearInterval(interval)
    }, 1000)

    return () => clearInterval(interval)
  }, [deadline, onExpired])

  const pad = (n: number) => String(n).padStart(2, '0')

  // Color logic: > 6h green, 1-6h yellow, < 1h red
  const totalHours = timeLeft.totalMs / (1000 * 60 * 60)
  const colorClass = timeLeft.expired
    ? 'text-red-400'
    : totalHours > 6
    ? 'text-emerald-400'
    : totalHours > 1
    ? 'text-yellow-400'
    : 'text-red-400'

  const bgClass = timeLeft.expired
    ? 'bg-red-500/15 border-red-500/30'
    : totalHours > 6
    ? 'bg-emerald-500/10 border-emerald-500/20'
    : totalHours > 1
    ? 'bg-yellow-500/10 border-yellow-500/20'
    : 'bg-red-500/10 border-red-500/20'

  const pulseClass = !timeLeft.expired && totalHours < 1 ? 'animate-pulse' : ''

  if (size === 'sm') {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border ${bgClass} ${pulseClass}`}>
        <Timer className={`w-3 h-3 ${colorClass}`} />
        <span className={`text-xs font-mono font-semibold ${colorClass}`}>
          {timeLeft.expired ? 'Expirado' : `${pad(timeLeft.hours)}:${pad(timeLeft.minutes)}:${pad(timeLeft.seconds)}`}
        </span>
      </div>
    )
  }

  if (size === 'lg') {
    return (
      <div className={`flex flex-col items-center gap-2 p-4 rounded-2xl border ${bgClass} ${pulseClass}`}>
        {timeLeft.expired ? (
          <>
            <AlertTriangle className="w-6 h-6 text-red-400" />
            <span className="text-sm font-semibold text-red-400">Tiempo agotado</span>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1">
              <Timer className={`w-4 h-4 ${colorClass}`} />
              <span className={`text-xs font-medium ${colorClass} uppercase tracking-wider`}>Tiempo restante</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="flex flex-col items-center">
                <span className={`text-3xl font-bold font-mono ${colorClass}`}>{pad(timeLeft.hours)}</span>
                <span className="text-[9px] text-muted-foreground uppercase">hrs</span>
              </div>
              <span className={`text-3xl font-bold ${colorClass} -mt-3`}>:</span>
              <div className="flex flex-col items-center">
                <span className={`text-3xl font-bold font-mono ${colorClass}`}>{pad(timeLeft.minutes)}</span>
                <span className="text-[9px] text-muted-foreground uppercase">min</span>
              </div>
              <span className={`text-3xl font-bold ${colorClass} -mt-3`}>:</span>
              <div className="flex flex-col items-center">
                <span className={`text-3xl font-bold font-mono ${colorClass}`}>{pad(timeLeft.seconds)}</span>
                <span className="text-[9px] text-muted-foreground uppercase">seg</span>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // Default: md
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${bgClass} ${pulseClass}`}>
      <Timer className={`w-4 h-4 ${colorClass}`} />
      {timeLeft.expired ? (
        <span className="text-sm font-semibold text-red-400">⏰ Tiempo agotado</span>
      ) : (
        <>
          <span className={`text-xs font-medium ${colorClass}`}>Plazo:</span>
          <span className={`text-sm font-mono font-bold ${colorClass}`}>
            {pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}
          </span>
        </>
      )}
    </div>
  )
}
