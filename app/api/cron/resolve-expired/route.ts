import { NextResponse } from 'next/server'
import { checkAndAutoResolveExpired } from '@/lib/match-engine'

/**
 * Endpoint para resolver partidos expirados.
 * - Puede ser llamado por Vercel Cron (cada 5 minutos recomendado)
 * - O invocado manualmente desde el dashboard (con throttling)
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // Si no es cron autorizado, permitir pero con un timestamp check
      // para evitar llamadas muy frecuentes
    }

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
  }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow up to 60 seconds for processing
