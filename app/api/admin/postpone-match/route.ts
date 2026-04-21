import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const { matchId } = await req.json()

    if (!matchId) {
      return NextResponse.json({ error: 'matchId is required' }, { status: 400 })
    }

    // Verify match exists and is scheduled
    const { data: match, error: fetchError } = await supabaseAdmin
      .from('matches')
      .select('id, status')
      .eq('id', matchId)
      .single()

    if (fetchError || !match) {
      return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 })
    }

    if (match.status === 'finished') {
      return NextResponse.json({ error: 'No se puede aplazar un partido ya finalizado' }, { status: 400 })
    }

    if (match.status === 'postponed') {
      return NextResponse.json({ error: 'El partido ya está aplazado' }, { status: 400 })
    }

    // Postpone: set status to 'postponed' and clear deadline
    const { error: updateError } = await (supabaseAdmin.from('matches') as any)
      .update({
        status: 'postponed',
        deadline: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId)

    if (updateError) {
      console.error('[postpone-match] Update error:', updateError)
      return NextResponse.json({ error: 'Error al aplazar el partido' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[postpone-match] Error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
