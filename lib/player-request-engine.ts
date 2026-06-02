import { supabaseAdmin as supabase } from './supabase'
import { sendPushToClub, sendPushToAll } from './push-notifications'
import type { PlayerCreationRequest, PlayerPosition, SquadRole } from './types'

// =============================================
// PLAYER CREATION REQUEST ENGINE
// =============================================
// A DT proposes creating a new player (identity only); an admin approves it
// (the player is actually created in the DT's club, free of charge) or rejects
// it. Each transition triggers: internal notification to the club + push to the
// club + GLOBAL push. Mirrors the appeals pattern (lib/appeal-notifications.ts).

// ---- Helpers ---------------------------------------------------------------
async function getClubName(clubId: string): Promise<string> {
  const { data } = await supabase.from('clubs').select('name').eq('id', clubId).single()
  return ((data as any)?.name as string) || 'Tu club'
}

async function notify(
  clubId: string,
  internalTitle: string,
  internalMessage: string,
  pushTitle: string,
  pushBody: string,
  globalTitle: string,
  globalBody: string,
  type: string,
  data?: any
) {
  // Internal notification (survives even when the user is offline)
  await (supabase.from('notifications') as any).insert({
    club_id: clubId,
    title: internalTitle,
    message: internalMessage,
    type,
    is_read: false,
    data: data ?? {},
  })
  // Best-effort push: per-club + global. Don't await individually so a failure
  // in one delivery doesn't block the other.
  await Promise.allSettled([
    sendPushToClub(clubId, pushTitle, pushBody, { type, ...(data || {}) }),
    sendPushToAll(globalTitle, globalBody, { type: `${type}_global`, ...(data || {}) }),
  ])
}

// ---- Submit ----------------------------------------------------------------
export interface SubmitPlayerRequestInput {
  clubId: string
  submittedBy: string | null
  name: string
  position: PlayerPosition | string
  number?: number | null
  age?: number | null
  nationality?: string | null
  photoUrl?: string | null
}

export interface SubmitResult {
  success: boolean
  requestId?: string
  error?: string
}

export async function submitPlayerRequest(input: SubmitPlayerRequestInput): Promise<SubmitResult> {
  try {
    const name = (input.name || '').trim()
    const position = (input.position || '').trim()
    if (!input.clubId) return { success: false, error: 'Club no especificado' }
    if (!name) return { success: false, error: 'El nombre es obligatorio' }
    if (!position) return { success: false, error: 'La posición es obligatoria' }

    const { data: inserted, error } = await (supabase.from('player_creation_requests') as any)
      .insert({
        club_id: input.clubId,
        submitted_by: input.submittedBy,
        name,
        position,
        number: input.number ?? null,
        age: input.age ?? null,
        nationality: input.nationality?.trim() || null,
        photo_url: input.photoUrl?.trim() || null,
        status: 'pending',
      })
      .select('id')
      .single()
    if (error) throw error

    const clubName = await getClubName(input.clubId)
    await notify(
      input.clubId,
      '📝 Solicitud enviada',
      `Tu solicitud para fichar a ${name} (${position}) está en revisión.`,
      '📝 Solicitud enviada',
      `${name} (${position}) — esperando aprobación del admin.`,
      '📝 Nueva solicitud de fichaje',
      `${clubName} propuso fichar a ${name} (${position}).`,
      'player_request_submitted',
      { request_id: (inserted as any)?.id, club_id: input.clubId, player_name: name }
    )

    return { success: true, requestId: (inserted as any)?.id }
  } catch (err: any) {
    console.error('[player-request] submit error:', err)
    return { success: false, error: err?.message || 'Error al enviar la solicitud' }
  }
}

// ---- Approve ---------------------------------------------------------------
export interface ApprovalTerms {
  salary: number
  contract_seasons_left: number
  squad_role: SquadRole
  release_clause: number
  is_one_club_man: boolean
}

export interface ApproveResult {
  success: boolean
  playerId?: string
  error?: string
}

export async function approvePlayerRequest(
  requestId: string,
  terms: ApprovalTerms,
  resolvedBy: string | null
): Promise<ApproveResult> {
  try {
    const { data: req, error: loadErr } = await supabase
      .from('player_creation_requests')
      .select('*')
      .eq('id', requestId)
      .single()
    if (loadErr || !req) return { success: false, error: 'Solicitud no encontrada' }
    const r = req as PlayerCreationRequest
    if (r.status !== 'pending') return { success: false, error: 'Esta solicitud ya fue resuelta' }

    // Create the actual player. Free of charge: no budget deduction. Salary
    // will be paid later in preseason like any other player.
    const now = new Date().toISOString()
    const { data: newPlayer, error: pErr } = await (supabase.from('players') as any)
      .insert({
        club_id: r.club_id,
        name: r.name,
        position: r.position,
        number: r.number,
        age: r.age,
        nationality: r.nationality,
        photo_url: r.photo_url,
        salary: terms.salary,
        contract_seasons_left: terms.contract_seasons_left,
        squad_role: terms.squad_role,
        release_clause: terms.release_clause,
        is_one_club_man: terms.is_one_club_man,
        contract_status: 'active',
        morale: 100,
        stamina: 100,
        salary_paid_this_season: false,
        wants_to_leave: false,
        is_on_sale: false,
        sale_price: null,
      })
      .select('id')
      .single()
    if (pErr || !newPlayer) throw pErr || new Error('Error al crear el jugador')
    const playerId = (newPlayer as any).id as string

    await (supabase.from('player_creation_requests') as any)
      .update({
        status: 'approved',
        player_id: playerId,
        resolved_by: resolvedBy,
        resolved_at: now,
        updated_at: now,
      })
      .eq('id', requestId)

    const clubName = await getClubName(r.club_id)
    await notify(
      r.club_id,
      '✅ Solicitud Aprobada',
      `${r.name} (${r.position}) se unió a tu club.`,
      '✅ Solicitud Aprobada',
      `${r.name} (${r.position}) ya es parte de tu plantilla.`,
      '🆕 Nuevo Fichaje',
      `${clubName} incorporó a ${r.name} (${r.position}).`,
      'player_request_approved',
      { request_id: r.id, player_id: playerId, club_id: r.club_id, player_name: r.name }
    )

    return { success: true, playerId }
  } catch (err: any) {
    console.error('[player-request] approve error:', err)
    return { success: false, error: err?.message || 'Error al aprobar la solicitud' }
  }
}

// ---- Reject ----------------------------------------------------------------
export interface RejectResult {
  success: boolean
  error?: string
}

export async function rejectPlayerRequest(
  requestId: string,
  adminNotes: string | null,
  resolvedBy: string | null
): Promise<RejectResult> {
  try {
    const { data: req, error: loadErr } = await supabase
      .from('player_creation_requests')
      .select('*')
      .eq('id', requestId)
      .single()
    if (loadErr || !req) return { success: false, error: 'Solicitud no encontrada' }
    const r = req as PlayerCreationRequest
    if (r.status !== 'pending') return { success: false, error: 'Esta solicitud ya fue resuelta' }

    const notes = adminNotes && adminNotes.trim() ? adminNotes.trim() : null
    const now = new Date().toISOString()
    await (supabase.from('player_creation_requests') as any)
      .update({
        status: 'rejected',
        admin_notes: notes,
        resolved_by: resolvedBy,
        resolved_at: now,
        updated_at: now,
      })
      .eq('id', requestId)

    const clubName = await getClubName(r.club_id)
    const reasonSuffix = notes ? ` Motivo: ${notes}` : ''
    await notify(
      r.club_id,
      '❌ Solicitud Rechazada',
      `Tu solicitud para fichar a ${r.name} fue rechazada.${reasonSuffix}`,
      '❌ Solicitud Rechazada',
      `${r.name} (${r.position}) — solicitud rechazada.${reasonSuffix}`,
      '📋 Solicitud Resuelta',
      `${clubName} — solicitud de ${r.name} rechazada.`,
      'player_request_rejected',
      { request_id: r.id, club_id: r.club_id, player_name: r.name, admin_notes: notes }
    )

    return { success: true }
  } catch (err: any) {
    console.error('[player-request] reject error:', err)
    return { success: false, error: err?.message || 'Error al rechazar la solicitud' }
  }
}
