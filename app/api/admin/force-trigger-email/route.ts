import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { generatePlayerEmailDirect } from '@/lib/morale-engine'
import { sendPushToClub } from '@/lib/push-notifications'

/**
 * API Maestra para forzar disparadores de correos de jugadores desde el panel admin.
 * Permite simular quejas, exigencias y peticiones de forma controlada.
 */
export async function POST(req: NextRequest) {
  try {
    const { playerId, triggerType, customText, requestedSalary: rSalary, requestedRole: rRole } = await req.json()

    if (!playerId || !triggerType) {
      return NextResponse.json({ error: 'Faltan datos requeridos (playerId, triggerType)' }, { status: 400 })
    }

    // 1. Obtener datos del jugador
    const { data: player, error: pError } = await supabase
      .from('players')
      .select('name, club_id, salary, squad_role')
      .eq('id', playerId)
      .single()

    if (pError || !player) {
      return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 })
    }

    // 2. Manejar disparadores especiales
    if (triggerType === 'promotion_demand') {
      // Lógica específica para exigencia de aumento salarial (personalizable)
      const requestedRole = rRole || (player.squad_role === 'rotation' ? 'important' : 'essential')
      const requestedSalary = rSalary || Math.round(player.salary * 1.5)
      const roleLabel = requestedRole === 'essential' ? 'Esencial' : 'Importante'
      
      const subject = `Exijo ser ${roleLabel}`
      const body = customText || `Míster, mis números demuestran mi valor. Actualmente soy jugador de ${player.squad_role} con $${player.salary.toLocaleString()} de sueldo, pero exijo ser reconocido como ${roleLabel} con un salario de $${requestedSalary.toLocaleString()}. Espero su respuesta pronto.`

      const { data: newEmail, error: eError } = await supabase.from('player_emails').insert({
        player_id: playerId,
        club_id: player.club_id,
        subject,
        body,
        email_type: 'promotion_demand',
        action_data: { requested_role: requestedRole, requested_salary: requestedSalary },
        action_taken: false,
        is_read: false
      }).select().single()

      if (eError) throw eError

      // Notificar al club (DB e interna)
      await supabase.from('notifications').insert({
        club_id: player.club_id,
        title: `📈 ${player.name} exige promoción`,
        message: `${player.name} quiere ser ${roleLabel}. Revisa tu buzón.`,
        type: 'player_email',
        data: { player_id: playerId, email_type: 'promotion_demand' }
      })

      // NOTIFICACION PUSH
      await sendPushToClub(player.club_id, `📈 ${player.name} exige promoción`, `Quiere ser ${roleLabel}. Revisa tu buzón.`, { type: 'player_email', player_id: playerId })

      return NextResponse.json({ success: true, email: newEmail })
    }

    // 3. Usar el motor de moral para disparadores estándar
    // Si hay customText, podemos inyectarlo directamente en lugar de usar la plantilla
    if (customText) {
      const subjectMap: Record<string, string> = {
        complaint: 'Falta de minutos',
        apology: 'Disculpas por el resultado',
        demand: 'Exigencia de titularidad',
        farewell: 'Me marcho del club',
        plea: 'Petición de oportunidad'
      }

      const subject = subjectMap[triggerType] || 'Mensaje del jugador'

      const { data: newEmail, error: eError } = await supabase.from('player_emails').insert({
        player_id: playerId,
        club_id: player.club_id,
        subject,
        body: customText,
        email_type: triggerType,
        is_read: false
      }).select().single()

      if (eError) throw eError

      // Notificar (DB e interna)
      await supabase.from('notifications').insert({
        club_id: player.club_id,
        title: `📩 Correo de ${player.name}`,
        message: subject,
        type: 'player_email',
        data: { player_id: playerId, player_name: player.name, email_type: triggerType }
      })

      // NOTIFICACION PUSH
      await sendPushToClub(player.club_id, `📩 Correo de ${player.name}`, subject, { type: 'player_email', player_id: playerId })

      return NextResponse.json({ success: true, email: newEmail })
    }

    // Disparador estándar usando plantillas del motor
    await generatePlayerEmailDirect(playerId, player.club_id, triggerType, '', player.name)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Error in force-trigger-email:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
