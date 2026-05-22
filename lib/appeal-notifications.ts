import { supabaseAdmin as supabase } from './supabase'
import { sendPushToClub, sendPushToAll } from './push-notifications'
import type { MatchAppeal, Club } from './types'

interface MatchInfo {
  id: string
  home_club_id: string
  away_club_id: string
  home_club?: { name: string } | Club | null
  away_club?: { name: string } | Club | null
}

function clubName(c: any): string {
  return (c?.name as string) || 'Club'
}

/**
 * Fire push + in-app notifications when an appeal is ACCEPTED.
 * - appellant club: appeal_accepted
 * - rival club:     appeal_resolved (outcome: accepted)
 * - all DTs:        global push
 */
export async function notifyAppealAccepted(
  appeal: MatchAppeal,
  match: MatchInfo
) {
  const homeName = clubName(match.home_club)
  const awayName = clubName(match.away_club)
  const newH = appeal.proposed_home_score
  const newA = appeal.proposed_away_score
  const appellantIsHome = appeal.club_id === match.home_club_id
  const rivalClubId = appellantIsHome ? match.away_club_id : match.home_club_id
  const appellantName = appellantIsHome ? homeName : awayName

  // Appellant in-app + push
  await supabase.from('notifications').insert({
    club_id: appeal.club_id,
    title: 'Apelación Aceptada',
    message: `Tu apelación del partido ${homeName} vs ${awayName} fue aceptada. Nuevo resultado: ${newH}-${newA}.`,
    type: 'appeal_accepted',
    data: { appeal_id: appeal.id, match_id: match.id, new_home_score: newH, new_away_score: newA },
  } as any)
  sendPushToClub(
    appeal.club_id,
    '✅ Apelación Aceptada',
    `Tu apelación de ${homeName} vs ${awayName} fue aceptada. Nuevo resultado: ${newH}-${newA}.`,
    { type: 'appeal_accepted', appeal_id: appeal.id, match_id: match.id }
  )

  // Rival in-app + push
  await supabase.from('notifications').insert({
    club_id: rivalClubId,
    title: 'Apelación Resuelta',
    message: `${appellantName} apeló el partido vs ti — aceptada. Nuevo resultado: ${newH}-${newA}.`,
    type: 'appeal_resolved',
    data: { appeal_id: appeal.id, match_id: match.id, outcome: 'accepted', new_home_score: newH, new_away_score: newA },
  } as any)
  sendPushToClub(
    rivalClubId,
    '⚖️ Apelación Resuelta',
    `${appellantName} apeló el partido vs ti — aceptada. Nuevo resultado: ${newH}-${newA}.`,
    { type: 'appeal_resolved', appeal_id: appeal.id, match_id: match.id, outcome: 'accepted' }
  )

  // Global push
  sendPushToAll(
    '📋 Apelación Resuelta',
    `${homeName} vs ${awayName} — apelación aceptada. Nuevo marcador: ${newH}-${newA}.`,
    { type: 'appeal_resolved', appeal_id: appeal.id, match_id: match.id, outcome: 'accepted' }
  )
}

/**
 * Fire push + in-app notifications when an appeal is REJECTED.
 */
export async function notifyAppealRejected(
  appeal: MatchAppeal,
  match: MatchInfo,
  adminNotes?: string | null
) {
  const homeName = clubName(match.home_club)
  const awayName = clubName(match.away_club)
  const appellantIsHome = appeal.club_id === match.home_club_id
  const rivalClubId = appellantIsHome ? match.away_club_id : match.home_club_id
  const appellantName = appellantIsHome ? homeName : awayName
  const notesPayload = adminNotes ? { admin_notes: adminNotes } : {}

  // Appellant in-app + push
  await supabase.from('notifications').insert({
    club_id: appeal.club_id,
    title: 'Apelación Rechazada',
    message: `Tu apelación del partido ${homeName} vs ${awayName} fue rechazada.${adminNotes ? ` Motivo del admin: ${adminNotes}` : ''}`,
    type: 'appeal_rejected',
    data: { appeal_id: appeal.id, match_id: match.id, ...notesPayload },
  } as any)
  sendPushToClub(
    appeal.club_id,
    '❌ Apelación Rechazada',
    `Tu apelación de ${homeName} vs ${awayName} fue rechazada.`,
    { type: 'appeal_rejected', appeal_id: appeal.id, match_id: match.id, ...notesPayload }
  )

  // Rival in-app + push
  await supabase.from('notifications').insert({
    club_id: rivalClubId,
    title: 'Apelación Resuelta',
    message: `${appellantName} apeló el partido vs ti — rechazada.`,
    type: 'appeal_resolved',
    data: { appeal_id: appeal.id, match_id: match.id, outcome: 'rejected' },
  } as any)
  sendPushToClub(
    rivalClubId,
    '⚖️ Apelación Resuelta',
    `${appellantName} apeló el partido vs ti — rechazada.`,
    { type: 'appeal_resolved', appeal_id: appeal.id, match_id: match.id, outcome: 'rejected' }
  )

  // Global push
  sendPushToAll(
    '📋 Apelación Resuelta',
    `${homeName} vs ${awayName} — apelación rechazada.`,
    { type: 'appeal_resolved', appeal_id: appeal.id, match_id: match.id, outcome: 'rejected' }
  )
}
