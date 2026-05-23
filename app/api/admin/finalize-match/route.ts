import { NextRequest, NextResponse } from 'next/server'
import { finalizePendingMatch } from '@/lib/match-engine'
import type { GoalEntry, AssistEntry } from '@/lib/types'

/**
 * Admin API: finaliza manualmente un partido pendiente (scheduled/postponed).
 * Aplica standings + player stats + K.O. advancement.
 * NO dispara morale, lesiones, fatiga, news ni push.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      matchId,
      homeScore,
      awayScore,
      homeAnnotation,
      awayAnnotation,
    } = body as {
      matchId: string
      homeScore: number
      awayScore: number
      homeAnnotation: {
        goals: GoalEntry[]
        assists: AssistEntry[]
        mvp_player_id: string | null
        starting_xi: string[]
        substitutes_in: any[]
      }
      awayAnnotation: {
        goals: GoalEntry[]
        assists: AssistEntry[]
        mvp_player_id: string | null
        starting_xi: string[]
        substitutes_in: any[]
      }
    }

    if (!matchId || homeScore === undefined || awayScore === undefined || !homeAnnotation || !awayAnnotation) {
      return NextResponse.json(
        { error: 'matchId, scores y annotations son requeridos' },
        { status: 400 }
      )
    }

    await finalizePendingMatch({ matchId, homeScore, awayScore, homeAnnotation, awayAnnotation })

    return NextResponse.json({
      success: true,
      result: `${homeScore}-${awayScore}`,
    })
  } catch (err: any) {
    console.error('[admin/finalize-match] Error:', err)
    const message = err?.message || 'Error interno'
    const status = message.includes('no encontrado') ? 404
      : message.includes('ya está finalizado') ? 400
      : message.includes('clubes asignados') ? 400
      : message.includes('negativos') ? 400
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}
