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

const INJURY_REASONS_MODERATE: string[] = [
  'Sobrecarga muscular en el isquiotibial',
  'Esguince de tobillo de grado I',
  'Contractura en el cuádriceps',
  'Contusión fuerte tras choque aéreo',
  'Sobrecarga en el aductor',
  'Molestias persistentes en el tendón rotuliano',
  'Elongación muscular tras carrera explosiva',
  'Lumbalgia mecánica por esfuerzo',
  'Microrrotura fibrilar en el gemelo',
  'Sinovitis post-traumática en la rodilla',
  'Distensión de ligamentos colaterales',
  'Fascitis plantar por sobrecarga',
  'Bursitis tras caída sobre el hombro',
  'Calambre severo con desequilibrio electrolítico',
  'Molestias cervicales por una mala postura en el bus del equipo',
  'Esguince fortuito al celebrar un gol con demasiada euforia',
  'Contractura abdominal tras un ataque de risa en el calentamiento',
  'Leve conmoción tras chocar accidentalmente con el poste',
]

const RED_CARD_REASONS: string[] = [
  'Juego brusco grave por entrada con los dos pies por delante',
  'Conducta violenta (agresión a un adversario sin balón)',
  'Malograr una oportunidad manifiesta de gol mediante falta',
  'Lenguaje ofensivo, grosero o abusivo hacía el equipo arbitral',
  'Doble amonestación por falta táctica reiterada',
  'Mano deliberada para evitar que el balón entre en la portería',
  'Escupir a un adversario tras una disputa',
  'Cabezazo intencionado tras un altercado',
  'Intento de agresión a un miembro del cuerpo técnico rival',
  'Protestas airadas y desconsideradas tras una decisión arbitral',
  'Entrada tardía e imprudente impactando en el tobillo del rival',
  'Gesto obsceno captado por las cámaras tras la celebración',
  'Expulsado por aplaudir irónicamente una decisión del árbitro',
  'Roja directa por lanzar el balón con furia hacia el banquillo rival',
  'Segunda amarilla tras quitarse la camiseta en una celebración',
  'Expulsado por encararse con un recogepelotas que no devolvía el balón',
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
  // Optimization: Only fetch players who actually need an update
  const { data: players } = await supabase
    .from('players')
    .select('id, injury_matches_left, injury_reason, red_card_matches_left, red_card_reason')
    .eq('club_id', clubId)
    .or('injury_matches_left.gt.0,red_card_matches_left.gt.0')

  if (!players || players.length === 0) return

  const updatePromises = (players as any[]).map(p => {
    const updates: any = {}
    let needsUpdate = false

    if (p.injury_matches_left > 0) {
      updates.injury_matches_left = Math.max(0, p.injury_matches_left - 1)
      if (updates.injury_matches_left === 0) {
        updates.injury_reason = null
      }
      needsUpdate = true
    }

    if (p.red_card_matches_left > 0) {
      updates.red_card_matches_left = Math.max(0, p.red_card_matches_left - 1)
      if (updates.red_card_matches_left === 0) {
        updates.red_card_reason = null
      }
      needsUpdate = true
    }

    if (needsUpdate) {
      return (supabase.from('players') as any)
        .update(updates)
        .eq('id', p.id)
    }
    return Promise.resolve()
  })

  await Promise.allSettled(updatePromises)
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
        // Full match: -10% (Campo) / -5% (GK se valida luego)
        staminaUpdates.set(playerId, (staminaUpdates.get(playerId) || 0) - 10)
      }
    }

    // Substitutes who came on: -5%
    for (const playerId of subsInPlayerIds) {
      staminaUpdates.set(playerId, (staminaUpdates.get(playerId) || 0) - 5)
    }
  }

  // Apply stamina changes in batches to optimize performance
  const playerIds = Array.from(staminaUpdates.keys())
  if (playerIds.length === 0) return

  const { data: players } = await supabase
    .from('players')
    .select('id, stamina, position')
    .in('id', playerIds)

  if (!players || players.length === 0) return

  const updatePromises = players.map(player => {
    let delta = staminaUpdates.get(player.id) || 0

    // GKs playing full match only lose 3% (instead of 10%)
    if (player.position === 'GK' && delta === -10) {
      delta = -3
    }

    const newStamina = Math.max(0, Math.min(100, (player.stamina ?? 100) + delta))
    
    if (newStamina === player.stamina) return Promise.resolve()
    
    return (supabase.from('players') as any)
      .update({ stamina: newStamina })
      .eq('id', player.id)
  })

  await Promise.allSettled(updatePromises)
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

  if (!match) {
    console.warn('[processRestRecovery] Match not found:', matchId)
    return
  }
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

  if (!allPlayers || allPlayers.length === 0) {
    console.warn('[processRestRecovery] No players found for clubs:', clubIds)
    return
  }

  const playersToRecover = (allPlayers as any[])
    .filter(p => !participatedIds.has(p.id) && (p.stamina ?? 100) < 100)

  if (playersToRecover.length === 0) return

  // Update each player's stamina to 100% and check for errors
  const results = await Promise.allSettled(
    playersToRecover.map(async (p) => {
      const { error } = await (supabase.from('players') as any)
        .update({ stamina: 100 })
        .eq('id', p.id)
      if (error) {
        console.error(`[processRestRecovery] Failed to recover player ${p.id}:`, error)
        throw error
      }
    })
  )

  const failed = results.filter(r => r.status === 'rejected').length
  if (failed > 0) {
    console.warn(`[processRestRecovery] ${failed}/${playersToRecover.length} recovery updates failed`)
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
    // Base 0.5% chance at 100 stamina, scaling up as stamina decreases
    // At 0 stamina: 0.5 + (100 * 0.08) = 8.5%
    const injuryChance = 0.5 + (100 - stamina) * 0.08

    const roll = Math.random() * 100
    if (roll < injuryChance) {
      // Player is injured!
      const duration = getWeightedInjuryDuration()
      const reason = duration >= 8
        ? INJURY_REASONS_SERIOUS[Math.floor(Math.random() * INJURY_REASONS_SERIOUS.length)]
        : INJURY_REASONS_MODERATE[Math.floor(Math.random() * INJURY_REASONS_MODERATE.length)]

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
  if (roll < 0.60) {
    // 1-3 matches (60% chance)
    return 1 + Math.floor(Math.random() * 3)
  } else if (roll < 0.90) {
    // 4-7 matches (30% chance)
    return 4 + Math.floor(Math.random() * 4)
  } else {
    // 8-15 matches (10% chance)
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

    // Check cooldown: only attempt red cards every 4 matches
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
          if (roll < 3) {
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

    // Update cooldown counter: (counter + 1) % 4
    // When counter=0 (check match) → becomes 1
    // ...
    // When counter=3 → becomes 0 (next match will be a check)
    const newCounter = (counter + 1) % 4
    await (supabase.from('clubs') as any).update({
      red_card_check_counter: newCounter,
    }).eq('id', clubId)
  }
}
