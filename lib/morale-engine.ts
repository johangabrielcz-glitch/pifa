import { supabaseAdmin as supabase } from './supabase'
import { Player, MatchAnnotation } from './types'
import { markPlayerSeeking } from './contract-engine'
import { sendPushToClub } from './push-notifications'

// =============================================
// MORALE ENGINE — Moral de jugadores + IA Brain
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
 * Llamada desde finalizeMatch() en match-engine.ts.
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
    // 1. Obtener todos los jugadores del club
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

    // 2. Obtener historial reciente para detectar rachas de banca
    const { data: recentMatches } = await supabase
      .from('matches')
      .select('id')
      .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
      .eq('status', 'finished')
      .order('played_at', { ascending: false })
      .limit(BENCH_STREAK_TRIGGER + 1) // últimos N+1 para comparar

    const recentMatchIds = (recentMatches || []).map(m => m.id)

    // Obtener anotaciones de partidos recientes para detectar quién no juega
    let recentAnnotations: any[] = []
    if (recentMatchIds.length > 0) {
      const { data: annotations } = await supabase
        .from('match_annotations')
        .select('starting_xi, substitutes_in')
        .eq('club_id', clubId)
        .in('match_id', recentMatchIds)
      recentAnnotations = annotations || []
    }

    // 3. Calcular cambio de moral para cada jugador
    const emailTriggers: { playerId: string; playerName: string; triggerType: string; context: string }[] = []

    for (const player of allPlayers as Player[]) {
      if (player.wants_to_leave || player.contract_status === 'free_agent') continue

      let moraleDelta = 0
      const wasParticipant = participantIds.has(player.id)
      const wasStarter = startingXi.includes(player.id)
      const wasSub = subsIn.includes(player.id)
      const scoredGoals = goalsArray.find((g: any) => g.player_id === player.id)
      const wasMvp = mvpId === player.id

      if (wasParticipant) {
        // Participó en el partido
        if (isWin) {
          moraleDelta += 5
          if (scoredGoals) moraleDelta += 3
          if (wasMvp) moraleDelta += 5
        } else if (isDraw) {
          moraleDelta += 1
          if (scoredGoals) moraleDelta += 2
          if (wasMvp) moraleDelta += 3
        } else if (isLoss) {
          moraleDelta -= 5
          if (wasStarter) moraleDelta -= 3 // Extra penalización a titulares en derrota
          // Posible correo de disculpa
          if (scoredGoals) {
            // Anotó pero perdió → potencial frustración
          } else if (wasStarter && Math.random() < 0.3) {
            emailTriggers.push({
              playerId: player.id,
              playerName: player.name,
              triggerType: 'apology',
              context: `Fue titular en una derrota del equipo. Se siente responsable.`
            })
          }
        }
      } else {
        // NO participó
        // Verificar racha de banca
        let benchStreak = 0
        for (const ann of recentAnnotations) {
          const annStarting = ann.starting_xi || []
          const annSubs = Array.isArray(ann.substitutes_in)
            ? (ann.substitutes_in as any[]).map((s: any) => typeof s === 'string' ? s : s.player_in).filter(Boolean)
            : []
          
          if (!annStarting.includes(player.id) && !annSubs.includes(player.id)) {
            benchStreak++
          } else {
            break // Rompe la racha
          }
        }

        if (benchStreak >= BENCH_STREAK_TRIGGER) {
          moraleDelta -= 10
          
          // Verificar incumplimiento de rol
          if (player.squad_role === 'essential') {
            moraleDelta -= 15 // Esto es grave — rol esencial en banca
            emailTriggers.push({
              playerId: player.id,
              playerName: player.name,
              triggerType: 'demand',
              context: `Es jugador ESENCIAL según su contrato pero lleva ${benchStreak} partidos consecutivos sin ser convocado. Siente que el DT no cumple lo pactado.`
            })
          } else if (player.squad_role === 'important') {
            moraleDelta -= 8
            if (benchStreak >= BENCH_STREAK_TRIGGER + 1) {
              emailTriggers.push({
                playerId: player.id,
                playerName: player.name,
                triggerType: 'complaint',
                context: `Es jugador IMPORTANTE pero lleva ${benchStreak} partidos en el banco sin ser convocado.`
              })
            }
          } else {
            moraleDelta -= 3 // Rotación: menos impacto
            if (benchStreak >= BENCH_STREAK_TRIGGER + 2) {
              emailTriggers.push({
                playerId: player.id,
                playerName: player.name,
                triggerType: 'complaint',
                context: `Lleva ${benchStreak} partidos sin ser convocado. Aunque es de rotación, quiere más minutos.`
              })
            }
          }
        } else {
          // Solo un poco de bajón por no jugar
          moraleDelta -= 2
          // Soft plea: 2 partidos sin jugar → pide oportunidad (40% chance, no spam)
          if (benchStreak === 2 && Math.random() < 0.4) {
            emailTriggers.push({
              playerId: player.id,
              playerName: player.name,
              triggerType: 'plea',
              context: `Lleva ${benchStreak} partidos sin ser convocado. Quiere pedirle al DT una oportunidad en el próximo partido. No está molesto, solo quiere jugar. Tono humilde y respetuoso.`
            })
          }
        }
      }

      // 4. Aplicar cambio de moral
      const newMorale = clampMorale((player.morale ?? 75) + moraleDelta)
      
      if (newMorale !== player.morale) {
        await supabase.from('players').update({
          morale: newMorale,
          updated_at: new Date().toISOString()
        }).eq('id', player.id)
      }

      // 5. Verificar umbral de "querer irse"
      if (newMorale <= MORALE_WANTING_TO_LEAVE_THRESHOLD && !(player.wants_to_leave)) {
        // El jugador ha llegado a su límite
        emailTriggers.push({
          playerId: player.id,
          playerName: player.name,
          triggerType: 'farewell',
          context: `Su moral ha caído a ${newMorale}%. Ha alcanzado el punto de no retorno y quiere irse del club. Moral: ${newMorale}%.`
        })

        // Ejecutar la acción irreversible
        await markPlayerSeeking(player.id)
      }
    }

    // 6. Disparar correos IA para los triggers acumulados (en background, no bloqueante)
    for (const trigger of emailTriggers) {
      try {
        generatePlayerEmailDirect(trigger.playerId, clubId, trigger.triggerType, trigger.context, trigger.playerName)
      } catch (e) {
        console.error('Error generating player email:', e)
      }
    }

    // 7. PROMOCIÓN DE ROL — Detectar jugadores que rinden por encima de su rol
    await detectPromotionDemands(clubId, allPlayers as Player[])

    // 8. DEMANDAS IGNORADAS — Penalizar moral si no se aceptan
    await penalizeIgnoredDemands(clubId)

  } catch (err) {
    console.error('Error processing end-of-match morale:', err)
  }
}

/**
 * Genera un correo de jugador directamente (server-side, sin proxy).
 * Llama a Groq para generar el contenido.
 */
async function generatePlayerEmailDirect(
  playerId: string,
  clubId: string,
  triggerType: string,
  context: string,
  playerName: string
): Promise<void> {
  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      console.error('GROQ_API_KEY not configured for player email')
      return
    }

    // Obtener datos del club para contexto
    const { data: club } = await supabase.from('clubs').select('name').eq('id', clubId).single()
    const clubName = (club as any)?.name || 'el club'

    const emailTypeMap: Record<string, string> = {
      complaint: 'QUEJA — El jugador no está contento con su situación',
      apology: 'DISCULPA — El jugador se siente responsable de algo negativo',
      demand: 'EXIGENCIA — El jugador exige que se cumpla lo pactado en su contrato',
      farewell: 'DESPEDIDA — El jugador ha decidido irse del club',
      plea: 'PETICIÓN HUMILDE — El jugador pide una oportunidad para jugar. Tono respetuoso, humilde, sin exigencias ni quejas. Solo quiere demostrar lo que vale.',
      general: 'MENSAJE GENERAL'
    }

    const systemPrompt = `Eres el jugador de fútbol ${playerName} que juega en ${clubName}. 
Debes escribir un correo electrónico breve al Director Técnico (DT) de tu club.
El tono debe ser REALISTA, como un futbolista real hablaría — directo, emocional, con carácter.
NO uses lenguaje corporativo ni formal. Usa expresiones de vestuario.
El correo debe tener un ASUNTO (subject line) y un CUERPO (body).
Responde ÚNICAMENTE en este formato JSON exacto:
{"subject": "...", "body": "..."}
El cuerpo no debe superar las 150 palabras.
NO incluyas saludos formales tipo "Estimado". Ve directo al grano como lo haría un futbolista.`

    const userPrompt = `TIPO DE CORREO: ${emailTypeMap[triggerType] || triggerType}
SITUACIÓN: ${context}
Genera el correo ahora.`

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.85,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      })
    })

    if (!response.ok) {
      console.error('Groq API error for player email:', response.status)
      return
    }

    const result = await response.json()
    const content = result.choices?.[0]?.message?.content

    if (!content) return

    let parsed: { subject: string; body: string }
    try {
      parsed = JSON.parse(content)
    } catch {
      console.error('Failed to parse player email JSON:', content)
      return
    }

    // Insertar en la tabla player_emails
    await supabase.from('player_emails').insert({
      player_id: playerId,
      club_id: clubId,
      subject: parsed.subject,
      body: parsed.body,
      email_type: triggerType as any,
      is_read: false
    })

    // Crear notificación para el DT
    await supabase.from('notifications').insert({
      club_id: clubId,
      title: `📩 Correo de ${playerName}`,
      message: parsed.subject,
      type: 'player_email',
      data: { player_id: playerId, player_name: playerName, email_type: triggerType }
    })

    // Push al club
    sendPushToClub(
      clubId,
      `📩 Correo de ${playerName}`,
      parsed.subject,
      { type: 'player_email', player_id: playerId }
    )
  } catch (err) {
    console.error('Error in generatePlayerEmailDirect:', err)
  }
}

// =============================================
// PROMOTION DEMAND DETECTION
// =============================================

const PROMOTION_LOOKBACK_MATCHES = 5
const ROTATION_TO_IMPORTANT_GOALS = 3
const ROTATION_TO_IMPORTANT_CONTRIBUTIONS = 4
const IMPORTANT_TO_ESSENTIAL_GOALS = 5
const IMPORTANT_TO_ESSENTIAL_CONTRIBUTIONS = 6
const IMPORTANT_TO_ESSENTIAL_MVPS = 2
const IGNORED_DEMAND_MATCH_THRESHOLD = 3

/**
 * Detects if any player deserves a role promotion based on recent performance.
 * Generates a promotion_demand email with actionable data.
 */
async function detectPromotionDemands(clubId: string, players: Player[]): Promise<void> {
  try {
    // 1. Get last 5 finished matches for this club
    const { data: recentMatches } = await supabase
      .from('matches')
      .select('id')
      .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
      .eq('status', 'finished')
      .order('played_at', { ascending: false })
      .limit(PROMOTION_LOOKBACK_MATCHES)

    if (!recentMatches || recentMatches.length < PROMOTION_LOOKBACK_MATCHES) return // Need 5 matches minimum

    const matchIds = recentMatches.map(m => m.id)

    // 2. Get annotations for this club in those matches
    const { data: annotations } = await supabase
      .from('match_annotations')
      .select('goals, assists, mvp_player_id')
      .eq('club_id', clubId)
      .in('match_id', matchIds)

    if (!annotations || annotations.length === 0) return

    // 3. Aggregate per-player stats
    const playerStats: Record<string, { goals: number; assists: number; mvps: number }> = {}

    for (const ann of annotations) {
      const goals = (ann as any).goals || []
      const assists = (ann as any).assists || []
      const mvpId = (ann as any).mvp_player_id

      for (const g of goals) {
        if (!playerStats[g.player_id]) playerStats[g.player_id] = { goals: 0, assists: 0, mvps: 0 }
        playerStats[g.player_id].goals += g.count || 1
      }
      for (const a of assists) {
        if (!playerStats[a.player_id]) playerStats[a.player_id] = { goals: 0, assists: 0, mvps: 0 }
        playerStats[a.player_id].assists += a.count || 1
      }
      if (mvpId) {
        if (!playerStats[mvpId]) playerStats[mvpId] = { goals: 0, assists: 0, mvps: 0 }
        playerStats[mvpId].mvps++
      }
    }

    // 4. Check each eligible player
    for (const player of players) {
      if (player.wants_to_leave || player.contract_status !== 'active') continue
      if (player.squad_role === 'essential' || !player.squad_role) continue

      const stats = playerStats[player.id]
      if (!stats) continue

      const contributions = stats.goals + stats.assists
      let requestedRole: string | null = null

      if (player.squad_role === 'rotation') {
        if (stats.goals >= ROTATION_TO_IMPORTANT_GOALS || contributions >= ROTATION_TO_IMPORTANT_CONTRIBUTIONS) {
          requestedRole = 'important'
        }
      } else if (player.squad_role === 'important') {
        if (stats.goals >= IMPORTANT_TO_ESSENTIAL_GOALS || contributions >= IMPORTANT_TO_ESSENTIAL_CONTRIBUTIONS || stats.mvps >= IMPORTANT_TO_ESSENTIAL_MVPS) {
          requestedRole = 'essential'
        }
      }

      if (!requestedRole) continue

      // 5. Check if there's already a pending promotion demand for this player
      const { data: existingDemand } = await supabase
        .from('player_emails')
        .select('id')
        .eq('player_id', player.id)
        .eq('email_type', 'promotion_demand')
        .eq('action_taken', false)
        .limit(1)

      if (existingDemand && existingDemand.length > 0) continue // Already has a pending demand

      // 6. Generate the promotion demand email
      const requestedSalary = Math.round(player.salary * 1.5)
      const roleLabel = requestedRole === 'essential' ? 'Esencial' : 'Importante'
      const currentRoleLabel = player.squad_role === 'rotation' ? 'Rotación' : 'Importante'

      const subject = `Exijo ser ${roleLabel}`
      const body = `Míster, con todo respeto, creo que mis números hablan por sí solos. En los últimos ${PROMOTION_LOOKBACK_MATCHES} partidos he aportado ${stats.goals} goles y ${stats.assists} asistencias${stats.mvps > 0 ? `, siendo MVP ${stats.mvps} veces` : ''}.\n\nActualmente soy jugador de ${currentRoleLabel} y gano $${player.salary.toLocaleString()}, pero mi rendimiento merece ser reconocido como ${roleLabel} con un salario de $${requestedSalary.toLocaleString()}.\n\nEspero que considere mi petición. Si no recibo respuesta pronto, mi motivación se va a ver afectada.`

      await supabase.from('player_emails').insert({
        player_id: player.id,
        club_id: clubId,
        subject,
        body,
        email_type: 'promotion_demand',
        action_data: { requested_role: requestedRole, requested_salary: requestedSalary },
        action_taken: false
      })

      // Notification
      await supabase.from('notifications').insert({
        club_id: clubId,
        title: `📈 ${player.name} exige promoción`,
        message: `${player.name} quiere ser ${roleLabel} y ganar $${requestedSalary.toLocaleString()}. Revisa tu bandeja de entrada.`,
        type: 'player_email',
        data: { player_id: player.id, email_type: 'promotion_demand' }
      })

      sendPushToClub(
        clubId,
        `📈 ${player.name} exige promoción`,
        `Quiere ser ${roleLabel} y ganar $${requestedSalary.toLocaleString()}.`,
        { type: 'player_email', player_id: player.id }
      )
    }
  } catch (err) {
    console.error('Error detecting promotion demands:', err)
  }
}

/**
 * Penalizes players whose promotion demands have been ignored for 3+ matches.
 */
async function penalizeIgnoredDemands(clubId: string): Promise<void> {
  try {
    // 1. Get all pending promotion demands for this club
    const { data: pendingDemands } = await supabase
      .from('player_emails')
      .select('id, player_id, created_at')
      .eq('club_id', clubId)
      .eq('email_type', 'promotion_demand')
      .eq('action_taken', false)

    if (!pendingDemands || pendingDemands.length === 0) return

    // 2. For each demand, count how many matches have been played since the demand
    for (const demand of pendingDemands) {
      const { count } = await supabase
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
        .eq('status', 'finished')
        .gt('played_at', demand.created_at)

      const matchesSinceDemand = count || 0

      if (matchesSinceDemand >= IGNORED_DEMAND_MATCH_THRESHOLD) {
        // 3. Apply morale penalty
        const { data: player } = await supabase
          .from('players')
          .select('morale, wants_to_leave')
          .eq('id', demand.player_id)
          .single()

        if (player && !player.wants_to_leave) {
          const newMorale = clampMorale((player.morale ?? 75) - 5)
          await supabase.from('players').update({
            morale: newMorale,
            updated_at: new Date().toISOString()
          }).eq('id', demand.player_id)

          // If morale hits threshold, mark as wanting to leave
          if (newMorale <= MORALE_WANTING_TO_LEAVE_THRESHOLD) {
            await markPlayerSeeking(demand.player_id)
          }
        }
      }
    }
  } catch (err) {
    console.error('Error penalizing ignored demands:', err)
  }
}
