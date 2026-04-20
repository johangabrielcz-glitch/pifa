import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

/**
 * Admin API: Manually edit the clubs assigned to a scheduled match.
 * Used for K.O. bracket corrections when a result edit changes the winner.
 */
export async function POST(req: NextRequest) {
  try {
    const { matchId, homeClubId, awayClubId } = await req.json()

    if (!matchId) {
      return NextResponse.json({ error: 'matchId es requerido' }, { status: 400 })
    }

    // Load the match
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('id, status')
      .eq('id', matchId)
      .single()

    if (matchError || !match) {
      return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 })
    }

    if (match.status === 'finished') {
      return NextResponse.json({ error: 'No se puede editar los clubs de un partido ya finalizado' }, { status: 400 })
    }

    // Update clubs
    const updates: any = { updated_at: new Date().toISOString() }
    if (homeClubId !== undefined) updates.home_club_id = homeClubId || null
    if (awayClubId !== undefined) updates.away_club_id = awayClubId || null

    const { error: updateError } = await (supabase.from('matches') as any)
      .update(updates)
      .eq('id', matchId)

    if (updateError) {
      return NextResponse.json({ error: 'Error al actualizar clubs' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[admin/edit-match-clubs] Error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
