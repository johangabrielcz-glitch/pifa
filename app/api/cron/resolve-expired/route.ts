import { NextResponse } from 'next/server'
import { checkAndAutoResolveExpired } from '@/lib/match-engine'

// Simple in-memory lock to prevent concurrent executions
let isProcessing = false
let lastProcessedAt = 0
const MIN_INTERVAL_MS = 10000 // Minimum 10 seconds between executions

/**
 * Endpoint para resolver partidos expirados.
 * - Puede ser llamado por Vercel Cron (cada minuto)
 * - O invocado manualmente desde el dashboard (con throttling)
 */
export async function GET() {
  // Check if already processing or too soon since last run
  const now = Date.now()
  if (isProcessing) {
    return NextResponse.json({ 
      success: false, 
      reason: 'already_processing',
      timestamp: new Date().toISOString()
    })
  }
  
  if (now - lastProcessedAt < MIN_INTERVAL_MS) {
    return NextResponse.json({ 
      success: false, 
      reason: 'too_soon',
      nextAvailable: new Date(lastProcessedAt + MIN_INTERVAL_MS).toISOString(),
      timestamp: new Date().toISOString()
    })
  }

  try {
    isProcessing = true
    lastProcessedAt = now

    const resolved = await checkAndAutoResolveExpired()
    
    return NextResponse.json({ 
      success: true, 
      resolved,
      timestamp: new Date().toISOString()
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Resolve Expired Error:', error)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  } finally {
    isProcessing = false
  }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60
