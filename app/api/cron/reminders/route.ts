import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { sendPushToClub } from '@/lib/push-notifications'

export const runtime = 'edge'

/**
 * Endpoint de Cron para enviar recordatorios de jornada.
 * Ejecutado por Vercel Cron — Horario: 0 [barra] 2 * * *
 */
export async function GET(req: Request) {
  try {
    // 1. Verificación de Seguridad
    const authHeader = req.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.error('[CRON] Unauthorized attempt to trigger reminders.')
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const now = new Date()
    const limitDate = new Date(now.getTime() + 24 * 60 * 60 * 1000) // Próximas 24 horas

    // 2. Obtener partidos pendientes próximos a vencer
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select(`
        *,
        home_club:clubs!matches_home_club_id_fkey(id, name),
        away_club:clubs!matches_away_club_id_fkey(id, name),
        competition:competitions(name)
      `)
      .eq('status', 'scheduled')
      .lt('deadline', limitDate.toISOString())
      .gt('deadline', now.toISOString())

    if (matchesError) throw matchesError
    if (!matches || matches.length === 0) {
      return NextResponse.json({ message: 'No hay partidos próximos a vencer' })
    }

    // 3. Obtener anotaciones ya realizadas para esos partidos
    const { data: annotations } = await supabase
      .from('match_annotations')
      .select('match_id, club_id')
      .in('match_id', matches.map(m => m.id))

    const remindersSent = []

    // 4. Analizar quién falta por anotar
    for (const match of matches) {
      const deadline = new Date(match.deadline!)
      const hoursLeft = Math.round((deadline.getTime() - now.getTime()) / (1000 * 60 * 60))
      
      const homeAnnotated = annotations?.some(a => a.match_id === match.id && a.club_id === match.home_club_id)
      const awayAnnotated = annotations?.some(a => a.match_id === match.id && a.club_id === match.away_club_id)

      // Recordatorio al Local
      if (!homeAnnotated) {
        await sendPushToClub(
          match.home_club_id,
          '⚠️ ¡Cierre de Jornada!',
          `Faltan ${hoursLeft}h para tu partido vs ${match.away_club?.name}. ¡Anota ya para evitar el walkover!`,
          { type: 'deadline_reminder', match_id: match.id }
        )
        remindersSent.push({ club: match.home_club?.name, match: match.id })
      }

      // Recordatorio al Visitante
      if (!awayAnnotated) {
        await sendPushToClub(
          match.away_club_id,
          '⚠️ ¡Cierre de Jornada!',
          `Faltan ${hoursLeft}h para tu partido vs ${match.home_club?.name}. ¡No olvides anotar!`,
          { type: 'deadline_reminder', match_id: match.id }
        )
        remindersSent.push({ club: match.away_club?.name, match: match.id })
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed: matches.length, 
      sent: remindersSent 
    })

  } catch (error: any) {
    console.error('Cron Reminders Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
