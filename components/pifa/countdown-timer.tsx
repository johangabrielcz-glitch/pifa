'use client'

import { useEffect, useState, useRef } from 'react'
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
  
  // Use ref to track if onExpired has been called to prevent multiple calls
  const hasExpiredRef = useRef(false)
  const onExpiredRef = useRef(onExpired)
  
  // Update ref when onExpired changes
  useEffect(() => {
    onExpiredRef.current = onExpired
  }, [onExpired])

  useEffect(() => {
    // Reset hasExpired when deadline changes
    hasExpiredRef.current = false
    
    const calculateTimeLeft = () => {
      const now = Date.now()
      const deadlineMs = new Date(deadline).getTime()
      const diff = deadlineMs - now

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, totalMs: 0, expired: true })
        // Only call onExpired once
        if (!hasExpiredRef.current) {
          hasExpiredRef.current = true
          onExpiredRef.current?.()
        }
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
  }, [deadline]) // Only depend on deadline, not onExpired

  const pad = (n: number) => String(n).padStart(2, '0')

  // Flat Color Logic
  const totalHours = timeLeft.totalMs / (1000 * 60 * 60)
  
  const textColor = timeLeft.expired
    ? 'text-[#F85149]'
    : totalHours > 6
    ? 'text-[#58A6FF]'
    : totalHours > 1
    ? 'text-[#D29922]'
    : 'text-[#F85149]'

  const bgBorder = timeLeft.expired
    ? 'bg-[#F85149]/10 border-[#F85149]/30'
    : totalHours > 6
    ? 'bg-[#58A6FF]/10 border-[#58A6FF]/30'
    : totalHours > 1
    ? 'bg-[#D29922]/10 border-[#D29922]/30'
    : 'bg-[#F85149]/10 border-[#F85149]/30'

  if (size === 'sm') {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${bgBorder}`}>
        <Timer className={`w-3 h-3 ${textColor}`} />
        <span className={`text-[10px] font-mono font-bold tracking-widest uppercase ${textColor}`}>
          {timeLeft.expired ? 'EXP' : `${pad(timeLeft.hours)}:${pad(timeLeft.minutes)}:${pad(timeLeft.seconds)}`}
        </span>
      </div>
    )
  }

  if (size === 'lg') {
    return (
      <div className={`flex flex-col items-center gap-3 p-4 rounded-xl border ${bgBorder}`}>
        {timeLeft.expired ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded bg-[#F85149]/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-[#F85149]" />
            </div>
            <span className="text-[11px] font-bold text-[#F85149] uppercase tracking-widest">Tiempo Agotado</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 mb-1">
              <Timer className={`w-3.5 h-3.5 ${textColor}`} />
              <span className={`text-[10px] font-bold ${textColor} uppercase tracking-[0.2em]`}>Restante</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex flex-col items-center bg-[#1A1C1E] px-3 py-1.5 rounded border border-[#2C2E30]">
                <span className={`text-xl font-bold font-mono ${textColor}`}>{pad(timeLeft.hours)}</span>
                <span className="text-[9px] text-[#8C8E90] uppercase font-bold mt-0.5">hrs</span>
              </div>
              <span className={`text-xl font-black ${textColor} opacity-30`}>:</span>
              <div className="flex flex-col items-center bg-[#1A1C1E] px-3 py-1.5 rounded border border-[#2C2E30]">
                <span className={`text-xl font-bold font-mono ${textColor}`}>{pad(timeLeft.minutes)}</span>
                <span className="text-[9px] text-[#8C8E90] uppercase font-bold mt-0.5">min</span>
              </div>
              <span className={`text-xl font-black ${textColor} opacity-30`}>:</span>
              <div className="flex flex-col items-center bg-[#1A1C1E] px-3 py-1.5 rounded border border-[#2C2E30]">
                <span className={`text-xl font-bold font-mono ${textColor}`}>{pad(timeLeft.seconds)}</span>
                <span className="text-[9px] text-[#8C8E90] uppercase font-bold mt-0.5">seg</span>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // Default: md
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${bgBorder}`}>
      <div className="flex items-center gap-2">
        <Timer className={`w-4 h-4 ${textColor}`} />
        <span className={`text-[11px] font-bold ${textColor} uppercase tracking-widest`}>Plazo</span>
      </div>
      {timeLeft.expired ? (
        <span className="text-[11px] font-bold text-[#F85149] uppercase tracking-widest">Expirado</span>
      ) : (
        <span className={`text-sm font-mono font-bold tracking-widest bg-[#1A1C1E] px-2.5 py-1 rounded border border-[#2C2E30] ${textColor}`}>
          {pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}
        </span>
      )}
    </div>
  )
}
