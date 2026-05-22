import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { notifyAppealRejected } from '@/lib/appeal-notifications'

/**
 * Admin API: Reject a pending appeal. The match stays untouched.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const resolvedBy: string | null = body?.resolvedBy || null
    const adminNotes: string | null = body?.adminNotes ? String(body.adminNotes).trim() || null : null

    const { data: appealData, error: loadError } = await supabase
      .from('match_appeals')
      .select(`
        *,
        match:matches(
          id, home_club_id, away_club_id,
          home_club:clubs!matches_home_club_id_fkey(id, name),
          away_club:clubs!matches_away_club_id_fkey(id, name)
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

    await (supabase.from('match_appeals') as any)
      .update({
        status: 'rejected',
        admin_notes: adminNotes,
        resolved_by: resolvedBy,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    const rejectedAppeal = { ...appealData, status: 'rejected' as const, admin_notes: adminNotes }
    await notifyAppealRejected(rejectedAppeal, appealData.match, adminNotes)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[appeals/reject] Error:', err)
    return NextResponse.json({ error: err?.message || 'Error interno' }, { status: 500 })
  }
}
