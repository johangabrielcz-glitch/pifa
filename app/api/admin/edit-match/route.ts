import { NextRequest, NextResponse } from 'next/server'
import { applyMatchEdit } from '@/lib/match-engine'
import type { GoalEntry, AssistEntry } from '@/lib/types'

/**
 * Admin API: Edit the result & stats of a finished match.
 * Reverts old standings + player stats, applies new ones.
 * Does NOT re-run morale, injuries, stamina, red cards.
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
      homeAnnotation?: {
        goals: GoalEntry[]
        assists: AssistEntry[]
        mvp_player_id: string | null
        starting_xi: string[]
        substitutes_in: any[]
      }
      awayAnnotation?: {
        goals: GoalEntry[]
        assists: AssistEntry[]
        mvp_player_id: string | null
        starting_xi: string[]
        substitutes_in: any[]
      }
    }

    if (!matchId || homeScore === undefined || awayScore === undefined) {
      return NextResponse.json({ error: 'matchId, homeScore y awayScore son requeridos' }, { status: 400 })
    }

    const { oldHomeScore, oldAwayScore } = await applyMatchEdit({
      matchId,
      homeScore,
      awayScore,
      homeAnnotation,
      awayAnnotation,
      notes: '[ADMIN-EDITED][STATS-DONE]',
    })

    return NextResponse.json({
      success: true,
      oldResult: `${oldHomeScore}-${oldAwayScore}`,
      newResult: `${homeScore}-${awayScore}`,
    })
  } catch (err: any) {
    console.error('[admin/edit-match] Error:', err)
    const message = err?.message || 'Error interno'
    const status = message.includes('no encontrado') ? 404
      : message.includes('finalizados') ? 400
      : message.includes('negativos') ? 400
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}
