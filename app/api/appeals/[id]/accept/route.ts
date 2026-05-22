import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { applyMatchEdit } from '@/lib/match-engine'
import { notifyAppealAccepted } from '@/lib/appeal-notifications'

/**
 * Admin API: Accept a pending appeal.
 * Runs the same revert + reapply logic as /api/admin/edit-match.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const resolvedBy: string | null = body?.resolvedBy || null

    // Load appeal + match relations
    const { data: appealData, error: loadError } = await supabase
      .from('match_appeals')
      .select(`
        *,
        match:matches(
          id, status, home_club_id, away_club_id, home_score, away_score,
          home_club:clubs!matches_home_club_id_fkey(id, name),
          away_club:clubs!matches_away_club_id_fkey(id, name),
          competition:competitions(*)
        )
      `)
      .eq('id', id)
      .single() as any

    if (loadError || !appealData) {
      return NextResponse.json({ error: 'Apelación no encontrada' }, { status: 404 })
    }
    if (appealData.status !== 'pending') {
      return NextResponse.json({ error: 'Esta apelación ya fue resuelta' }, { status: 409 })
    }
    const match = appealData.match
    if (!match) {
      return NextResponse.json({ error: 'Partido asociado no encontrado' }, { status: 404 })
    }
    if (match.status !== 'finished') {
      return NextResponse.json({
        error: 'El partido ya no está finalizado, no se puede aceptar',
      }, { status: 409 })
    }

    // Apply the edit (engine throws on errors — appeal stays pending so admin can retry)
    const { oldHomeScore, oldAwayScore } = await applyMatchEdit({
      matchId: match.id,
      homeScore: appealData.proposed_home_score,
      awayScore: appealData.proposed_away_score,
      homeAnnotation: appealData.proposed_home_annotation,
      awayAnnotation: appealData.proposed_away_annotation,
      notes: `[APPEAL-ACCEPTED:${new Date().toISOString()}][STATS-DONE]`,
    })

    // Mark appeal accepted
    await (supabase.from('match_appeals') as any)
      .update({
        status: 'accepted',
        resolved_by: resolvedBy,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    // Reload with new status for notifications
    const acceptedAppeal = { ...appealData, status: 'accepted' as const }

    await notifyAppealAccepted(acceptedAppeal, match)

    return NextResponse.json({
      success: true,
      oldResult: `${oldHomeScore}-${oldAwayScore}`,
      newResult: `${appealData.proposed_home_score}-${appealData.proposed_away_score}`,
    })
  } catch (err: any) {
    console.error('[appeals/accept] Error:', err)
    const message = err?.message || 'Error interno'
    const status = message.includes('no encontrado') ? 404
      : message.includes('finalizados') || message.includes('finalizado') ? 409
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}
