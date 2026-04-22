import { supabaseAdmin as supabase } from './supabase'
import { Player, MatchAnnotation } from './types'
import { markPlayerSeeking } from './contract-engine'
import { sendPushToClub } from './push-notifications'

// =============================================
// MORALE ENGINE — Moral de jugadores + Sistema de Mensajería
// =============================================

const MORALE_MIN = 0
const MORALE_MAX = 100
const MORALE_WANTING_TO_LEAVE_THRESHOLD = 30 // <=30% → quiere irse
const BENCH_STREAK_TRIGGER = 3 // 3+ partidos sin jugar → trigger de queja

/**
 * Clamps morale between 0 and 100
 */
function clampMorale(value: number): number {
  return Math.max(MORALE_MIN, Math.min(MORALE_MAX, value))
}

/**
 * Procesa la moral de todos los jugadores de un club después de un partido.
 */
export async function processEndOfMatchMorale(
  matchId: string,
  clubId: string,
  isWin: boolean,
  isDraw: boolean,
  isLoss: boolean,
  annotation: MatchAnnotation | null
): Promise<void> {
  try {
    const { data: allPlayers } = await supabase
      .from('players')
      .select('*')
      .eq('club_id', clubId)
      .in('contract_status', ['active', 'renewal_pending'])

    if (!allPlayers || allPlayers.length === 0) return

    const startingXi = annotation?.starting_xi || []
    const subsIn = Array.isArray(annotation?.substitutes_in)
      ? (annotation!.substitutes_in as any[]).map((s: any) => typeof s === 'string' ? s : s.player_in).filter(Boolean)
      : []

    const goalsArray = annotation?.goals || []
    const mvpId = annotation?.mvp_player_id

    const participantIds = new Set([...startingXi, ...subsIn])

    const { data: recentMatches } = await supabase
      .from('matches')
      .select('id')
      .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
      .eq('status', 'finished')
      .order('played_at', { ascending: false })
      .limit(BENCH_STREAK_TRIGGER + 1)

    const recentMatchIds = (recentMatches || []).map(m => m.id)

    let recentAnnotations: any[] = []
    if (recentMatchIds.length > 0) {
      const { data: annotations } = await supabase
        .from('match_annotations')
        .select('starting_xi, substitutes_in')
        .eq('club_id', clubId)
        .in('match_id', recentMatchIds)
      recentAnnotations = annotations || []
    }

    const emailTriggers: { playerId: string; playerName: string; triggerType: string; context: string }[] = []

    for (const player of allPlayers as Player[]) {
      if (
        player.wants_to_leave || 
        player.contract_status === 'free_agent' ||
        (player.injury_matches_left && player.injury_matches_left > 0) ||
        (player.red_card_matches_left && player.red_card_matches_left > 0)
      ) continue

      let moraleDelta = 0
      const wasParticipant = participantIds.has(player.id)
      const wasStarter = startingXi.includes(player.id)
      const wasMvp = mvpId === player.id

      if (wasParticipant) {
        if (isWin) {
          moraleDelta += 5
          if (wasMvp) moraleDelta += 5
        } else if (isLoss) {
          moraleDelta -= 5
          if (wasStarter && Math.random() < 0.2) {
            emailTriggers.push({
              playerId: player.id,
              playerName: player.name,
              triggerType: 'apology',
              context: ``
            })
          }
        }
      } else {
        let benchStreak = 0
        for (const ann of recentAnnotations) {
          const annStarting = ann.starting_xi || []
          const annSubs = Array.isArray(ann.substitutes_in) ? (ann.substitutes_in as any[]).map((s: any) => typeof s === 'string' ? s : s.player_in).filter(Boolean) : []
          if (!annStarting.includes(player.id) && !annSubs.includes(player.id)) benchStreak++
          else break
        }

        if (benchStreak >= BENCH_STREAK_TRIGGER) {
          moraleDelta -= 10
          if (player.squad_role === 'essential') {
            moraleDelta -= 15
            emailTriggers.push({ playerId: player.id, playerName: player.name, triggerType: 'demand', context: '' })
          } else if (player.squad_role === 'important') {
            moraleDelta -= 8
            emailTriggers.push({ playerId: player.id, playerName: player.name, triggerType: 'complaint', context: '' })
          } else {
            moraleDelta -= 3
            if (benchStreak >= BENCH_STREAK_TRIGGER + 2) {
              emailTriggers.push({ playerId: player.id, playerName: player.name, triggerType: 'complaint', context: '' })
            }
          }
        } else if (benchStreak === 2 && Math.random() < 0.3) {
          emailTriggers.push({ playerId: player.id, playerName: player.name, triggerType: 'plea', context: '' })
        }
      }

      const newMorale = clampMorale((player.morale ?? 75) + moraleDelta)
      if (newMorale !== player.morale) {
        await supabase.from('players').update({ morale: newMorale, updated_at: new Date().toISOString() }).eq('id', player.id)
      }

      if (newMorale <= MORALE_WANTING_TO_LEAVE_THRESHOLD && !(player.wants_to_leave)) {
        emailTriggers.push({ playerId: player.id, playerName: player.name, triggerType: 'farewell', context: '' })
        await markPlayerSeeking(player.id)
      }
    }

    for (const trigger of emailTriggers) {
      try {
        generatePlayerEmailDirect(trigger.playerId, clubId, trigger.triggerType, trigger.context, trigger.playerName)
      } catch (e) {}
    }

    await detectPromotionDemands(clubId, allPlayers as Player[])
    await penalizeIgnoredDemands(clubId)

  } catch (err) {
    console.error('Error processing end-of-match morale:', err)
  }
}

/**
 * Genera un correo de jugador usando PLANTILLAS HARDCODEADAS (Alta Calidad).
 * Ya no usa IA para garantizar consistencia y formato de un solo párrafo.
 */
export async function generatePlayerEmailDirect(
  playerId: string,
  clubId: string,
  triggerType: string,
  context: string,
  playerName: string
): Promise<void> {
  try {
    let subject = ''
    let body = ''

    switch (triggerType) {
      case 'complaint':
        subject = 'Falta de minutos'
        body = `Míster, no estoy nada contento con mi falta de minutos últimamente. Siento que mi progresión se está estancando en el banco y necesito volver a jugar para recuperar mi mejor nivel.`
        break
      case 'apology':
        subject = 'Disculpas por el resultado'
        body = `Jefe, me siento responsable por el resultado negativo del último partido. Sé que debí dar más y estoy trabajando extra para compensar mi rendimiento y devolverle la confianza al grupo.`
        break
      case 'demand':
        subject = 'Exigencia de titularidad'
        body = `Entrenador, mi contrato dice que soy un jugador esencial para este proyecto y mi suplencia actual es inaceptable. Exijo que se respete mi rol pactado o tendremos que buscar una salida para mi carrera.`
        break
      case 'farewell':
        subject = 'Me marcho del club'
        body = `Míster, he llegado al límite y mi ciclo aquí ha terminado. La situación es insostenible para mí y he decidido buscar un nuevo destino donde pueda ser valorado; a partir de ahora me declaro en busca de equipo.`
        break
      case 'plea':
        subject = 'Petición de oportunidad'
        body = `Míster, llevo varios partidos sin jugar y me muero de ganas por ayudar al equipo. Le pido humildemente una oportunidad en el próximo encuentro para demostrarle que estoy listo para aportar al grupo.`
        break
      case 'general':
      default:
        subject = 'Ansias por iniciar'
        body = `Míster, estoy extremadamente motivado con este inicio de temporada. Voy a dejarme la piel en cada entrenamiento para demostrar que puedo ser una muralla en el arco y ayudar al club a ganar títulos.`
        break
    }

    await supabase.from('player_emails').insert({
      player_id: playerId,
      club_id: clubId,
      subject,
      body,
      email_type: triggerType as any,
      is_read: false
    })

    await supabase.from('notifications').insert({
      club_id: clubId,
      title: `📩 Correo de ${playerName}`,
      message: subject,
      type: 'player_email',
      data: { player_id: playerId, player_name: playerName, email_type: triggerType }
    })

    sendPushToClub(clubId, `📩 Correo de ${playerName}`, subject, { type: 'player_email', player_id: playerId })

  } catch (err) {
    console.error('Error in generatePlayerEmailDirect:', err)
  }
}

// REST OF THE FILE (detectPromotionDemands, etc.) remains hardcoded as before
async function detectPromotionDemands(clubId: string, players: Player[]): Promise<void> {
  try {
    const { data: recentMatches } = await supabase
      .from('matches')
      .select('id')
      .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
      .eq('status', 'finished')
      .order('played_at', { ascending: false })
      .limit(PROMOTION_LOOKBACK_MATCHES)

    if (!recentMatches || recentMatches.length < PROMOTION_LOOKBACK_MATCHES) return

    const matchIds = recentMatches.map(m => m.id)
    const { data: annotations } = await supabase.from('match_annotations').select('goals, assists, mvp_player_id').eq('club_id', clubId).in('match_id', matchIds)
    if (!annotations || annotations.length === 0) return

    const playerStats: Record<string, { goals: number; assists: number; mvps: number }> = {}
    for (const ann of annotations) {
      const goals = (ann as any).goals || []; const assists = (ann as any).assists || []; const mvpId = (ann as any).mvp_player_id
      for (const g of goals) { if (!playerStats[g.player_id]) playerStats[g.player_id] = { goals: 0, assists: 0, mvps: 0 }; playerStats[g.player_id].goals += g.count || 1 }
      for (const a of assists) { if (!playerStats[a.player_id]) playerStats[a.player_id] = { goals: 0, assists: 0, mvps: 0 }; playerStats[a.player_id].assists += a.count || 1 }
      if (mvpId) { if (!playerStats[mvpId]) playerStats[mvpId] = { goals: 0, assists: 0, mvps: 0 }; playerStats[mvpId].mvps++ }
    }

    for (const player of players) {
      if (player.wants_to_leave || player.contract_status !== 'active' || player.squad_role === 'essential' || !player.squad_role) continue
      const stats = playerStats[player.id]; if (!stats) continue
      const contributions = stats.goals + stats.assists
      let requestedRole: string | null = null
      if (player.squad_role === 'rotation') { if (stats.goals >= ROTATION_TO_IMPORTANT_GOALS || contributions >= ROTATION_TO_IMPORTANT_CONTRIBUTIONS) requestedRole = 'important' }
      else if (player.squad_role === 'important') { if (stats.goals >= IMPORTANT_TO_ESSENTIAL_GOALS || contributions >= IMPORTANT_TO_ESSENTIAL_CONTRIBUTIONS || stats.mvps >= IMPORTANT_TO_ESSENTIAL_MVPS) requestedRole = 'essential' }
      if (!requestedRole) continue

      const { data: existingDemand } = await supabase.from('player_emails').select('id').eq('player_id', player.id).eq('email_type', 'promotion_demand').eq('action_taken', false).limit(1)
      if (existingDemand && existingDemand.length > 0) continue

      const requestedSalary = Math.round(player.salary * 1.5)
      const roleLabel = requestedRole === 'essential' ? 'Esencial' : 'Importante'
      const currentRoleLabel = player.squad_role === 'rotation' ? 'Rotación' : 'Importante'

      const subject = `Exijo ser ${roleLabel}`
      const body = `Míster, mis números en los últimos ${PROMOTION_LOOKBACK_MATCHES} partidos (${stats.goals} goles y ${stats.assists} asistencias) demuestran mi valor. Actualmente soy jugador de ${currentRoleLabel} con $${player.salary.toLocaleString()} de sueldo, pero exijo ser reconocido como ${roleLabel} con un salario de $${requestedSalary.toLocaleString()}. Espero su respuesta pronto.`

      await supabase.from('player_emails').insert({
        player_id: player.id,
        club_id: clubId,
        subject,
        body,
        email_type: 'promotion_demand',
        action_data: { requested_role: requestedRole, requested_salary: requestedSalary },
        action_taken: false
      })

      await supabase.from('notifications').insert({
        club_id: clubId,
        title: `📈 ${player.name} exige promoción`,
        message: `${player.name} quiere ser ${roleLabel}. Revisa tu buzón.`,
        type: 'player_email',
        data: { player_id: player.id, email_type: 'promotion_demand' }
      })

      sendPushToClub(clubId, `📈 ${player.name} exige promoción`, `Quiere ser ${roleLabel}.`, { type: 'player_email', player_id: player.id })
    }
  } catch (err) { console.error('Error detecting promotion demands:', err) }
}

async function penalizeIgnoredDemands(clubId: string): Promise<void> {
  try {
    const { data: pendingDemands } = await supabase.from('player_emails').select('id, player_id, created_at').eq('club_id', clubId).eq('email_type', 'promotion_demand').eq('action_taken', false)
    if (!pendingDemands || pendingDemands.length === 0) return
    for (const demand of pendingDemands) {
      const { count } = await supabase.from('matches').select('id', { count: 'exact', head: true }).or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`).eq('status', 'finished').gt('played_at', demand.created_at)
      if ((count || 0) >= IGNORED_DEMAND_MATCH_THRESHOLD) {
        const { data: player } = await supabase.from('players').select('morale, wants_to_leave').eq('id', demand.player_id).single()
        if (player && !player.wants_to_leave) {
          const newMorale = clampMorale((player.morale ?? 75) - 5)
          await supabase.from('players').update({ morale: newMorale, updated_at: new Date().toISOString() }).eq('id', demand.player_id)
          if (newMorale <= MORALE_WANTING_TO_LEAVE_THRESHOLD) await markPlayerSeeking(demand.player_id)
        }
      }
    }
  } catch (err) { console.error('Error penalizing ignored demands:', err) }
}

const PROMOTION_LOOKBACK_MATCHES = 5
const ROTATION_TO_IMPORTANT_GOALS = 3
const ROTATION_TO_IMPORTANT_CONTRIBUTIONS = 4
const IMPORTANT_TO_ESSENTIAL_GOALS = 5
const IMPORTANT_TO_ESSENTIAL_CONTRIBUTIONS = 6
const IMPORTANT_TO_ESSENTIAL_MVPS = 2
const IGNORED_DEMAND_MATCH_THRESHOLD = 3
