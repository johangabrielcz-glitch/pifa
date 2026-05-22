import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import type { MatchAppealStatus } from '@/lib/types'

/**
 * GET /api/appeals?status=pending|accepted|rejected|all&clubId=&limit=
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const clubId = url.searchParams.get('clubId')
    const limitParam = url.searchParams.get('limit')
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50

    let query = supabase
      .from('match_appeals')
      .select(`
        *,
        match:matches(
          id, matchday, round_name, group_name, home_score, away_score, status,
          home_club:clubs!matches_home_club_id_fkey(id, name, shield_url),
          away_club:clubs!matches_away_club_id_fkey(id, name, shield_url),
          competition:competitions(id, name, type)
        ),
        club:clubs(id, name, shield_url)
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status && status !== 'all') {
      query = query.eq('status', status as MatchAppealStatus)
    }
    if (clubId) {
      query = query.eq('club_id', clubId)
    }

    const { data, error } = await query
    if (error) {
      console.error('[appeals/list] Error:', error)
      return NextResponse.json({ error: 'Error al cargar apelaciones' }, { status: 500 })
    }

    return NextResponse.json({ appeals: data || [] })
  } catch (err: any) {
    console.error('[appeals/list] Error:', err)
    return NextResponse.json({ error: err?.message || 'Error interno' }, { status: 500 })
  }
}
