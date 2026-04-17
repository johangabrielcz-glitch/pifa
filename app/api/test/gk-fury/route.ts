import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { generatePlayerEmailDirect } from '@/lib/morale-engine'

export const runtime = 'edge'

export async function GET() {
  try {
    // 1. Obtener todos los clubes
    const { data: clubs } = await supabase.from('clubs').select('id, name')
    if (!clubs) return NextResponse.json({ error: 'No clubs found' }, { status: 404 })

    const emailsTriggered: string[] = []

    // 2. Por cada club, buscar un portero
    for (const club of clubs) {
      const { data: gk } = await supabase
        .from('players')
        .select('id, name')
        .eq('club_id', club.id)
        .eq('position', 'GK')
        .limit(1)
        .maybeSingle()

      if (gk) {
        // 3. Disparar el correo de "Ansias por iniciar temporada"
        await generatePlayerEmailDirect(
          gk.id,
          club.id,
          'general',
          'El portero está extremadamente ansioso por empezar la temporada. Quiere demostrar sus reflejos, su liderazgo y que será una muralla en el arco este año. Tono motivado y decidido.',
          gk.name
        )
        emailsTriggered.push(`Correo enviado de ${gk.name} (${club.name})`)
      }
    }

    return NextResponse.json({ 
      message: 'Operación "Ansias en el Arco" completada',
      triggered: emailsTriggered 
    })

  } catch (err: any) {
    console.error('Error triggering GK emails:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
