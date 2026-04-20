import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import {
  updateStandings,
  updatePlayerStats,
  revertStandings,
  revertPlayerStats,
} from '@/lib/match-engine'
import type { MatchAnnotation, Competition, Match, GoalEntry, AssistEntry } from '@/lib/types'

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

    if (homeScore < 0 || awayScore < 0) {
      return NextResponse.json({ error: 'Los scores no pueden ser negativos' }, { status: 400 })
    }

    // 1. Load match + competition
    const { data: matchData, error: matchError } = await supabase
      .from('matches')
      .select('*, competition:competitions(*)')
      .eq('id', matchId)
      .single() as any

    if (matchError || !matchData) {
      return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 })
    }

    const match = matchData as Match & { competition: Competition }

    if (match.status !== 'finished') {
      return NextResponse.json({ error: 'Solo se pueden editar partidos finalizados' }, { status: 400 })
    }

    const oldHomeScore = match.home_score ?? 0
    const oldAwayScore = match.away_score ?? 0
    const competition = match.competition

    // 2. Load old annotations
    const { data: oldAnnotations } = await supabase
      .from('match_annotations')
      .select('*')
      .eq('match_id', matchId)

    const oldAnnotationsList = (oldAnnotations || []) as MatchAnnotation[]

    // 3. Determine if standings need update (league or group stage)
    const isGroupStage = match.group_name !== null
    const hasStandings = competition.type === 'league' ||
      (competition.type === 'groups_knockout' && isGroupStage)

    // 4. Revert old standings
    if (hasStandings) {
      await revertStandings(match, oldHomeScore, oldAwayScore, competition)
    }

    // 5. Revert old player stats (only if we have annotations to update)
    const hasNewAnnotations = homeAnnotation && awayAnnotation
    if (hasNewAnnotations && oldAnnotationsList.length > 0) {
      await revertPlayerStats(oldAnnotationsList, match.competition_id)
    }

    // 6. Update annotations if provided
    if (hasNewAnnotations) {
      // Upsert home annotation
      await supabase
        .from('match_annotations')
        .upsert({
          match_id: matchId,
          club_id: match.home_club_id,
          goals: homeAnnotation.goals,
          assists: homeAnnotation.assists,
          mvp_player_id: homeAnnotation.mvp_player_id,
          starting_xi: homeAnnotation.starting_xi,
          substitutes_in: homeAnnotation.substitutes_in,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'match_id,club_id' })

      // Upsert away annotation
      await supabase
        .from('match_annotations')
        .upsert({
          match_id: matchId,
          club_id: match.away_club_id,
          goals: awayAnnotation.goals,
          assists: awayAnnotation.assists,
          mvp_player_id: awayAnnotation.mvp_player_id,
          starting_xi: awayAnnotation.starting_xi,
          substitutes_in: awayAnnotation.substitutes_in,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'match_id,club_id' })

      // 7. Apply new player stats
      const { data: newAnnotations } = await supabase
        .from('match_annotations')
        .select('*')
        .eq('match_id', matchId)

      if (newAnnotations && newAnnotations.length > 0) {
        await updatePlayerStats(
          newAnnotations as MatchAnnotation[],
          match.competition_id,
          matchId,
          true // skip idempotency check
        )
      }
    }

    // 8. Apply new standings
    if (hasStandings) {
      await updateStandings(match, homeScore, awayScore, competition)
    }

    // 9. Update match scores
    await (supabase.from('matches') as any)
      .update({
        home_score: homeScore,
        away_score: awayScore,
        notes: '[ADMIN-EDITED][STATS-DONE]',
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId)

    return NextResponse.json({
      success: true,
      oldResult: `${oldHomeScore}-${oldAwayScore}`,
      newResult: `${homeScore}-${awayScore}`,
    })
  } catch (err: any) {
    console.error('[admin/edit-match] Error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
