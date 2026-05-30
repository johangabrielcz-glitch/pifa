import { supabaseAdmin as supabase } from './supabase'
import { sendPushToClub, sendPushToAll } from './push-notifications'

// =============================================
// ADMIN MONEY BONUSES
// =============================================
// Send a money bonus to one or several clubs: credits clubs.budget, drops an
// internal notification, and fires a push to each club plus a global push.

function fmtMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('es')
}

export interface SendBonusResult {
  success: boolean
  count?: number // clubs credited
  total?: number // total amount distributed
  error?: string
}

/**
 * Credits `amount` to each selected club and notifies them (internal + push)
 * plus a global push. `concept` is an optional reason shown to the clubs.
 */
export async function sendClubBonus(clubIds: string[], amount: number, concept?: string): Promise<SendBonusResult> {
  try {
    if (!clubIds || clubIds.length === 0) return { success: false, error: 'Selecciona al menos un club' }
    if (!amount || amount <= 0) return { success: false, error: 'El monto debe ser mayor a 0' }

    const now = new Date().toISOString()
    const reason = concept && concept.trim() ? concept.trim() : 'Bono de la federación'

    const { data: clubs } = await supabase.from('clubs').select('id, name, budget').in('id', clubIds)
    const list = (clubs as any[]) || []
    if (list.length === 0) return { success: false, error: 'Clubes no encontrados' }

    const notifs: any[] = []
    const audit: any[] = []
    for (const c of list) {
      await (supabase.from('clubs') as any)
        .update({ budget: (c.budget ?? 0) + amount, updated_at: now })
        .eq('id', c.id)
      notifs.push({
        club_id: c.id,
        title: '💰 Bono Recibido',
        message: `Tu club recibió ${fmtMoney(amount)} — ${reason}.`,
        type: 'bonus',
        is_read: false,
      })
      audit.push({ club_id: c.id, amount, concept: reason })
    }

    if (notifs.length > 0) await (supabase.from('notifications') as any).insert(notifs)
    // Audit is best-effort: if the table isn't migrated yet, ignore the error.
    await (supabase.from('club_bonuses') as any).insert(audit).then(
      () => {},
      () => {}
    )

    // Push: per club + a single global announcement (best-effort)
    const pushes: Promise<any>[] = list.map((c) =>
      sendPushToClub(c.id, '💰 Bono Recibido', `Tu club recibió ${fmtMoney(amount)} — ${reason}.`, { type: 'bonus' })
    )
    pushes.push(
      sendPushToAll(
        '💰 Movimiento Económico',
        'La federación ha enviado bonos económicos. ¡Revisa tu tesorería!',
        { type: 'bonus_global' }
      )
    )
    await Promise.allSettled(pushes)

    return { success: true, count: list.length, total: amount * list.length }
  } catch (err: any) {
    console.error('Error sending club bonus:', err)
    return { success: false, error: err?.message || 'Error al enviar el bono' }
  }
}
