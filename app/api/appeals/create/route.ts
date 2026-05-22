import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import type { AppealAnnotationPayload, GoalEntry } from '@/lib/types'

/**
 * DT API: Create a pending appeal for a finished match.
 * Body: { matchId, clubId, submittedBy?, proposedHomeScore, proposedAwayScore,
 *         proposedHomeAnnotation, proposedAwayAnnotation, reason }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      matchId,
      clubId,
      submittedBy,
      proposedHomeScore,
      proposedAwayScore,
      proposedHomeAnnotation,
      proposedAwayAnnotation,
      reason,
    } = body as {
      matchId: string
      clubId: string
      submittedBy?: string | null
      proposedHomeScore: number
      proposedAwayScore: number
      proposedHomeAnnotation: AppealAnnotationPayload
      proposedAwayAnnotation: AppealAnnotationPayload
      reason: string
    }

    if (!matchId || !clubId || proposedHomeScore === undefined || proposedAwayScore === undefined) {
      return NextResponse.json({ error: 'Campos requeridos faltantes' }, { status: 400 })
    }
    if (proposedHomeScore < 0 || proposedAwayScore < 0) {
      return NextResponse.json({ error: 'Los scores no pueden ser negativos' }, { status: 400 })
    }
    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: 'La razón es obligatoria' }, { status: 400 })
    }
    if (!proposedHomeAnnotation || !proposedAwayAnnotation) {
      return NextResponse.json({ error: 'Se requieren anotaciones para ambos clubes' }, { status: 400 })
    }

    // Load match
    const { data: matchData, error: matchError } = await supabase
      .from('matches')
      .select('id, status, home_club_id, away_club_id, home_score, away_score')
      .eq('id', matchId)
      .single() as any

    if (matchError || !matchData) {
      return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 })
    }
    if (matchData.status !== 'finished') {
      return NextResponse.json({ error: 'Solo se pueden apelar partidos finalizados' }, { status: 400 })
    }
    if (clubId !== matchData.home_club_id && clubId !== matchData.away_club_id) {
      return NextResponse.json({ error: 'Tu club no participa en este partido' }, { status: 403 })
    }

    // Validate goal totals match scores
    const homeGoalTotal = (proposedHomeAnnotation.goals || []).reduce(
      (s: number, g: GoalEntry) => s + (g?.count || 0), 0
    )
    const awayGoalTotal = (proposedAwayAnnotation.goals || []).reduce(
      (s: number, g: GoalEntry) => s + (g?.count || 0), 0
    )
    if (homeGoalTotal !== proposedHomeScore) {
      return NextResponse.json({
        error: `Los goles del local suman ${homeGoalTotal} pero el marcador propone ${proposedHomeScore}`,
      }, { status: 400 })
    }
    if (awayGoalTotal !== proposedAwayScore) {
      return NextResponse.json({
        error: `Los goles del visitante suman ${awayGoalTotal} pero el marcador propone ${proposedAwayScore}`,
      }, { status: 400 })
    }

    // Pre-check existing pending
    const { data: existing } = await supabase
      .from('match_appeals')
      .select('id')
      .eq('match_id', matchId)
      .eq('club_id', clubId)
      .eq('status', 'pending')
      .maybeSingle()
    if (existing) {
      return NextResponse.json({
        error: 'Ya tienes una apelación pendiente para este partido',
      }, { status: 409 })
    }

    // Snapshot current annotations
    const { data: currentAnnotations } = await supabase
      .from('match_annotations')
      .select('*')
      .eq('match_id', matchId)
    const annotations = (currentAnnotations || []) as any[]
    const homeAnn = annotations.find(a => a.club_id === matchData.home_club_id) || null
    const awayAnn = annotations.find(a => a.club_id === matchData.away_club_id) || null

    const { data: inserted, error: insertError } = await supabase
      .from('match_appeals')
      .insert({
        match_id: matchId,
        club_id: clubId,
        submitted_by: submittedBy || null,
        original_home_score: matchData.home_score ?? 0,
        original_away_score: matchData.away_score ?? 0,
        original_home_annotation: homeAnn,
        original_away_annotation: awayAnn,
        proposed_home_score: proposedHomeScore,
        proposed_away_score: proposedAwayScore,
        proposed_home_annotation: proposedHomeAnnotation,
        proposed_away_annotation: proposedAwayAnnotation,
        reason: reason.trim(),
        status: 'pending',
      } as any)
      .select('id')
      .single() as any

    if (insertError) {
      // Race with partial unique index
      if (insertError.code === '23505') {
        return NextResponse.json({
          error: 'Ya tienes una apelación pendiente para este partido',
        }, { status: 409 })
      }
      console.error('[appeals/create] Insert error:', insertError)
      return NextResponse.json({ error: 'Error al crear la apelación' }, { status: 500 })
    }

    return NextResponse.json({ success: true, appealId: inserted?.id })
  } catch (err: any) {
    console.error('[appeals/create] Error:', err)
    return NextResponse.json({ error: err?.message || 'Error interno' }, { status: 500 })
  }
}
