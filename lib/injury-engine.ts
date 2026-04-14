import { supabaseAdmin as supabase } from './supabase'
import type { SubstitutionEntry } from './types'
import { sendPushToAll } from './push-notifications'

// =============================================
// SUBSTITUTION HELPERS (backward-compatible)
// =============================================

/**
 * Normalize substitutes_in data from either legacy string[] or new SubstitutionEntry[] format.
 */
export function normalizeSubstitutions(subsData: any): SubstitutionEntry[] {
  if (!subsData || !Array.isArray(subsData) || subsData.length === 0) return []

  // New format: array of objects with player_in/player_out
  if (typeof subsData[0] === 'object' && 'player_in' in subsData[0]) {
    return subsData as SubstitutionEntry[]
  }

  // Legacy format: string[] — player IDs that came on, no info about who they replaced
  return (subsData as string[]).map(id => ({ player_in: id, player_out: '' }))
}

/**
 * Extract just the player_in IDs from substitution data (backward-compatible).
 */
export function getSubsInPlayerIds(subsData: any): string[] {
  return normalizeSubstitutions(subsData).map(s => s.player_in)
}

/**
 * Defensive parser for Postgres array columns (like UUID[]) that might return as strings
 * like "{uuid1, uuid2}" if PostgREST schema cache is stale.
 */
export function parseStringArray(data: any): string[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (typeof data === 'string') {
    return data.replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean)
  }
  return []
}

// =============================================
// INJURY REASON CATALOGS
// =============================================

const INJURY_REASONS_SERIOUS: string[] = [
  'Rotura del ligamento cruzado anterior',
  'Fractura de metatarso',
  'Rotura fibrilar severa en el isquiotibial',
  'Lesión del menisco con intervención quirúrgica',
  'Fractura de tibia por entrada criminal',
  'Rotura del tendón de Aquiles',
  'Hernia discal lumbar aguda',
  'Desgarro muscular de grado III en el cuádriceps',
  'Esguince de tobillo de grado III con ligamento roto',
  'Luxación de hombro tras caída aparatosa',
]

const INJURY_REASONS_FUNNY: string[] = [
  'Se lesionó celebrando un gol que no metió',
  'Tropezó con la mascota del equipo en el túnel',
  'Contractura por dormir en mala posición la noche anterior',
  'Se resbaló con una cáscara de banana camino al vestuario',
  'Calambre severo por comer churrasco en el entretiempo',
  'Lesión en el ego tras ser regateado 7 veces seguidas',
  'Tirantez muscular por un exceso de celebraciones prematuras',
  'Se torció el tobillo evitando pisar una hormiga en el césped',
  'Esguince de muñeca por lanzar la botella de agua con rabia',
  'Dolor lumbar tras cargar la mochila del utilero',
  'Se contracturó intentando hacer un baile viral de TikTok',
  'Lesión por reír demasiado fuerte de un chiste del árbitro',
  'Lesión en la mandíbula por mascar chicle con demasiada furia',
  'Se mareó mirando al dron de la transmisión',
  'Dolor cervical por girar la cabeza demasiado rápido a ver la repetición',
  'Calambre en el dedo por señalar demasiado al árbitro',
  'Desgarro emocional tras enterarse del marcador del rival',
  'Contractura abdominal por ataque de risa en el calentamiento',
]

const RED_CARD_REASONS: string[] = [
  'Le mostró el dedo medio al árbitro equivocado',
  'Quitó el banderín del corner y lo usó como espada',
  'Intentó sobornar al árbitro con empanadas',
  'Celebró un gol ajeno con danza ritual prohibida por la FIFA',
  'Le pegó un pelotazo intencional al recogepelotas',
  'Insultó al técnico rival en 3 idiomas distintos',
  'Pateó el monitor del VAR',
  'Se quitó la camiseta... dos veces en un minuto',
  'Mordió al rival durante un tiro de esquina',
  'Lanzó una botella de agua al banquillo rival',
  'Hizo gestos obscenos a la cámara de TV',
  'Fingió una lesión tan mala que el árbitro se ofendió',
  'Le robó las tarjetas al árbitro y las escondió',
  'Se sentó en el centro del campo en protesta',
  'Simuló un penal tan exagerado que rompió las leyes de la física',
  'Escupió chicle en el zapato del árbitro',
  'Le echó agua al cuarto árbitro desde la banca',
  'Hizo una falta tan brutal que el balón explotó',
  'Intentó marcar gol con la mano... y presumió de ello',
  'Agresión verbal al recogepelotas por no devolver la pelota rápido',
]

// =============================================
// CORE PROCESSING FUNCTIONS
// =============================================

/**
 * Decrement existing injury and red card counters for all players of a club.
 * Called at the START of match finalization processing (before new injuries are assigned).
 * This way, "injury_matches_left = 3" means the player misses 3 future matches.
 */
export async function decrementSuspensionsAndInjuries(clubId: string): Promise<void> {
  // Decrement injuries
  try {
    await supabase.rpc('decrement_player_counters', { p_club_id: clubId })
  } catch (err) {
    // Fallback: manual update if RPC doesn't exist
  }

  // Manual fallback approach since we may not have RPC
  const { data: players } = await supabase
    .from('players')
    .select('id, injury_matches_left, injury_reason, red_card_matches_left, red_card_reason')
    .eq('club_id', clubId)

  if (!players) return

  for (const p of players as any[]) {
    const updates: any = {}
    let needsUpdate = false

    if (p.injury_matches_left > 0) {
      updates.injury_matches_left = p.injury_matches_left - 1
      if (updates.injury_matches_left === 0) {
        updates.injury_reason = null
      }
      needsUpdate = true
    }

    if (p.red_card_matches_left > 0) {
      updates.red_card_matches_left = p.red_card_matches_left - 1
      if (updates.red_card_matches_left === 0) {
        updates.red_card_reason = null
      }
      needsUpdate = true
    }

    if (needsUpdate) {
      await (supabase.from('players') as any).update(updates).eq('id', p.id)
    }
  }
}

/**
 * Process stamina changes (fatigue) for players who participated in a match.
 * - Starter who played full match (not substituted out): -15%
 * - Starter who was substituted out: -5%
 * - Substitute who came on: -5%
 */
export async function processMatchFatigue(matchId: string): Promise<void> {
  const { data: annotations } = await supabase
    .from('match_annotations')
    .select('*')
    .eq('match_id', matchId)

  if (!annotations || annotations.length === 0) return

  const staminaUpdates = new Map<string, number>() // player_id -> delta

  for (const ann of annotations as any[]) {
    const startingXi = parseStringArray(ann.starting_xi)
    const subs = normalizeSubstitutions(ann.substitutes_in)
    const replacedPlayerIds = new Set(subs.map(s => s.player_out).filter(Boolean))
    const subsInPlayerIds = subs.map(s => s.player_in)

    // Starters who completed the full match
    for (const playerId of startingXi) {
      if (replacedPlayerIds.has(playerId)) {
        // Substituted out: -5%
        staminaUpdates.set(playerId, (staminaUpdates.get(playerId) || 0) - 5)
      } else {
        // Full match: -15%
        staminaUpdates.set(playerId, (staminaUpdates.get(playerId) || 0) - 15)
      }
    }

    // Substitutes who came on: -5%
    for (const playerId of subsInPlayerIds) {
      staminaUpdates.set(playerId, (staminaUpdates.get(playerId) || 0) - 5)
    }
  }

  // Apply stamina changes
  for (const [playerId, delta] of staminaUpdates) {
    const { data: player } = await supabase
      .from('players')
      .select('stamina')
      .eq('id', playerId)
      .single()

    if (player) {
      const newStamina = Math.max(0, Math.min(100, ((player as any).stamina ?? 100) + delta))
      await (supabase.from('players') as any).update({ stamina: newStamina }).eq('id', playerId)
    }
  }
}

/**
 * Process stamina recovery for players of both clubs who did NOT participate in the match.
 * +15% stamina for each non-participating player.
 */
export async function processRestRecovery(matchId: string): Promise<void> {
  const { data: match } = await supabase
    .from('matches')
    .select('home_club_id, away_club_id')
    .eq('id', matchId)
    .single()

  if (!match) return
  const m = match as any

  const { data: annotations } = await supabase
    .from('match_annotations')
    .select('*')
    .eq('match_id', matchId)

  // Collect all player IDs who participated
  const participatedIds = new Set<string>()
  for (const ann of (annotations || []) as any[]) {
    const startingXi = parseStringArray(ann.starting_xi)
    const subsIn = getSubsInPlayerIds(ann.substitutes_in)
    startingXi.forEach(id => participatedIds.add(id))
    subsIn.forEach(id => participatedIds.add(id))
  }

  // Get ALL players from both clubs
  const clubIds = [m.home_club_id, m.away_club_id].filter(Boolean)
  const { data: allPlayers } = await supabase
    .from('players')
    .select('id, stamina')
    .in('club_id', clubIds)

  if (!allPlayers) return

  for (const p of allPlayers as any[]) {
    if (!participatedIds.has(p.id)) {
      const newStamina = Math.min(100, (p.stamina ?? 100) + 15)
      if (newStamina !== (p.stamina ?? 100)) {
        await (supabase.from('players') as any).update({ stamina: newStamina }).eq('id', p.id)
      }
    }
  }
}

/**
 * Process potential injuries for players who participated in a match.
 * Probability scales with fatigue: base 3% at 100 stamina, up to ~43% at 0 stamina.
 * Injury duration: 1-15 matches (weighted toward shorter injuries).
 */
export async function processInjuries(matchId: string): Promise<void> {
  const { data: annotations } = await supabase
    .from('match_annotations')
    .select('*')
    .eq('match_id', matchId)

  if (!annotations || annotations.length === 0) return

  const { data: match } = await supabase
    .from('matches')
    .select('home_club_id, away_club_id')
    .eq('id', matchId)
    .single()

  if (!match) return

  // Collect all participating player IDs with their club
  const participatingPlayers: { playerId: string; clubId: string }[] = []

  for (const ann of annotations as any[]) {
    const startingXi = parseStringArray(ann.starting_xi)
    const subsIn = getSubsInPlayerIds(ann.substitutes_in)
    const allPlayed = [...new Set([...startingXi, ...subsIn])]
    allPlayed.forEach(pid => participatingPlayers.push({ playerId: pid, clubId: ann.club_id }))
  }

  // Load current stamina for all participating players
  const playerIds = participatingPlayers.map(p => p.playerId)
  if (playerIds.length === 0) return

  const { data: playersData } = await supabase
    .from('players')
    .select('id, name, stamina, injury_matches_left, club_id, club:clubs(name)')
    .in('id', playerIds)

  if (!playersData) return

  for (const player of playersData as any[]) {
    // Skip if already injured
    if (player.injury_matches_left > 0) continue

    const stamina = player.stamina ?? 100
    // Base 3% chance at 100 stamina, scaling up as stamina decreases
    // At 0 stamina: 3 + (100 * 0.4) = 43%
    const injuryChance = 3 + (100 - stamina) * 0.4

    const roll = Math.random() * 100
    if (roll < injuryChance) {
      // Player is injured!
      const duration = getWeightedInjuryDuration()
      const reason = duration >= 8
        ? INJURY_REASONS_SERIOUS[Math.floor(Math.random() * INJURY_REASONS_SERIOUS.length)]
        : INJURY_REASONS_FUNNY[Math.floor(Math.random() * INJURY_REASONS_FUNNY.length)]

      await (supabase.from('players') as any).update({
        injury_matches_left: duration,
        injury_reason: reason,
      }).eq('id', player.id)

      // Create notification for the club
      await supabase.from('notifications').insert({
        club_id: player.club_id,
        title: '🏥 Lesión',
        message: `${player.name} se ha lesionado: "${reason}". Estará fuera ${duration} partido${duration > 1 ? 's' : ''}.`,
        type: 'injury' as any,
        data: { player_id: player.id, duration, reason },
        is_read: false,
      } as any)

      // --- GLOBAL PUSH NOTIFICATION ---
      const clubName = (player.club as any)?.name || 'su club'
      await sendPushToAll(
        '🏥 Lesión en la Liga',
        `${player.name} (${clubName}) se ha lesionado: "${reason}". Estará fuera ${duration} partido${duration > 1 ? 's' : ''}.`,
        { type: 'injury', player_id: player.id }
      )
    }
  }
}

/**
 * Generate a weighted injury duration (1-15). Shorter injuries are much more likely.
 * Distribution: ~50% chance 1-3, ~30% chance 4-7, ~20% chance 8-15
 */
function getWeightedInjuryDuration(): number {
  const roll = Math.random()
  if (roll < 0.50) {
    // 1-3 matches (50% chance)
    return 1 + Math.floor(Math.random() * 3)
  } else if (roll < 0.80) {
    // 4-7 matches (30% chance)
    return 4 + Math.floor(Math.random() * 4)
  } else {
    // 8-15 matches (20% chance)
    return 8 + Math.floor(Math.random() * 8)
  }
}

/**
 * Process potential red cards for players who played a full match (not substituted out).
 * Only checked every 3 matches per club (cooldown system).
 * Probability: 5% per eligible player.
 * Suspension: 1-5 matches.
 */
export async function processRedCards(matchId: string): Promise<void> {
  const { data: annotations } = await supabase
    .from('match_annotations')
    .select('*')
    .eq('match_id', matchId)

  if (!annotations || annotations.length === 0) return

  for (const ann of annotations as any[]) {
    const clubId = ann.club_id

    // Check cooldown: only attempt red cards every 3 matches
    const { data: clubData } = await supabase
      .from('clubs')
      .select('red_card_check_counter')
      .eq('id', clubId)
      .single()

    if (!clubData) continue

    const counter = (clubData as any).red_card_check_counter ?? 0

    if (counter === 0) {
      // This is a check match — roll for red cards
      const startingXi = parseStringArray(ann.starting_xi)
      const subs = normalizeSubstitutions(ann.substitutes_in)
      const replacedPlayerIds = new Set(subs.map(s => s.player_out).filter(Boolean))

      // Only players who played the full match are eligible
      const fullMatchPlayers = startingXi.filter(id => !replacedPlayerIds.has(id))

      // Load player data
      const { data: playersData } = await supabase
        .from('players')
        .select('id, name, red_card_matches_left, club_id, club:clubs(name)')
        .in('id', fullMatchPlayers)

      if (playersData) {
        for (const player of playersData as any[]) {
          // Skip already suspended
          if (player.red_card_matches_left > 0) continue

          const roll = Math.random() * 100
          if (roll < 5) {
            // RED CARD!
            const duration = 1 + Math.floor(Math.random() * 5) // 1-5 matches
            const reason = RED_CARD_REASONS[Math.floor(Math.random() * RED_CARD_REASONS.length)]

            await (supabase.from('players') as any).update({
              red_card_matches_left: duration,
              red_card_reason: reason,
            }).eq('id', player.id)

            // Create notification
            await supabase.from('notifications').insert({
              club_id: player.club_id,
              title: '🟥 Tarjeta Roja',
              message: `${player.name} ha sido expulsado: "${reason}". Suspendido ${duration} partido${duration > 1 ? 's' : ''}.`,
              type: 'red_card' as any,
              data: { player_id: player.id, duration, reason },
              is_read: false,
            } as any)

            // --- GLOBAL PUSH NOTIFICATION ---
            const clubName = (player.club as any)?.name || 'su club'
            await sendPushToAll(
              '🟥 Expulsión en la Liga',
              `${player.name} (${clubName}) ha recibido una Tarjeta Roja Directa: "${reason}". Suspendido ${duration} partidos.`,
              { type: 'red_card', player_id: player.id }
            )

            // Only one red card per club per check (to keep it rare)
            break
          }
        }
      }
    }

    // Update cooldown counter: (counter + 1) % 3
    // When counter=0 (check match) → becomes 1
    // When counter=1 → becomes 2
    // When counter=2 → becomes 0 (next match will be a check)
    const newCounter = (counter + 1) % 3
    await (supabase.from('clubs') as any).update({
      red_card_check_counter: newCounter,
    }).eq('id', clubId)
  }
}
