import { NextRequest, NextResponse } from 'next/server'
import { revertFinishedMatch } from '@/lib/match-engine'

/**
 * Admin API: revierte un partido finalizado, restaurando standings y stats,
 * borrando annotations y dejándolo en estado `postponed`. Si es K.O., aplica
 * cascada recursiva sobre el bracket dependiente.
 */
export async function POST(req: NextRequest) {
  try {
    const { matchId } = await req.json()
    if (!matchId) {
      return NextResponse.json({ error: 'matchId requerido' }, { status: 400 })
    }
    const result = await revertFinishedMatch(matchId)
    return NextResponse.json({
      success: true,
      cascadedCount: result.cascadedMatchIds.length,
    })
  } catch (err: any) {
    console.error('[admin/revert-match] Error:', err)
    const message = err?.message || 'Error interno'
    const status = message.includes('no encontrado') ? 404
      : message.includes('finalizados') ? 400
      : message.includes('límite') ? 400
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}
