import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { sendPushToAll } from '@/lib/push-notifications'

export async function POST(req: Request) {
  try {
    const { token, text, replyToId } = await req.json()

    if (!token || !text) {
      return NextResponse.json({ error: 'Faltan parámetros: token o text' }, { status: 400 })
    }

    // Buscar a qué usuario le pertenece este token
    const { data: pushData, error: pushError } = await supabase
      .from('user_push_tokens')
      .select('user_id')
      .eq('expo_push_token', token)
      .single()

    if (pushError || !pushData) {
      console.error('Push token no encontrado:', token)
      return NextResponse.json({ error: 'Dispositivo no reconocido' }, { status: 404 })
    }

    const userId = pushData.user_id

    // Obtener información del club de este usuario
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, full_name, club_id')
      .eq('id', userId)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const clubId = userData.club_id

    // Obtener detalles del club para la notificación
    let clubName = userData.full_name
    if (clubId) {
      const { data: clubData } = await supabase
        .from('clubs')
        .select('name')
        .eq('id', clubId)
        .single()
      if (clubData?.name) {
        clubName = clubData.name
      }
    }

    // Insertar el mensaje en el global_chat
    const { data: newMsg, error: insertError } = await supabase
      .from('global_chat_messages')
      .insert({
        user_id: userId,
        club_id: clubId || null,
        content: text.trim(),
        reply_to_id: replyToId || null
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Error insertando mensaje:', insertError)
      return NextResponse.json({ error: 'Error interno guardando tu mensaje' }, { status: 500 })
    }

    // Enviar notificación a todos los demás DTs
    await sendPushToAll(
      `💬 ${clubName}`,
      text.trim(),
      { type: 'chat', messageId: newMsg.id },
      userId // Excluir a quien acaba de enviar el mensaje
    )

    return NextResponse.json({ success: true, message: 'Mensaje enviado interactivamente' })

  } catch (error: any) {
    console.error('Error en API chat reply background:', error)
    return NextResponse.json({ error: 'Error del servidor: ' + error.message }, { status: 500 })
  }
}
