import { supabaseAdmin as supabase } from './supabase'
import type {
  GoalEntry,
  AssistEntry,
  MatchAnnotation,
  Match,
  Competition,
  LeagueConfig,
  CupConfig,
  GroupsKnockoutConfig,
  SubstitutionEntry,
} from './types'
import { sendPushToClub } from './push-notifications'
import { processEndOfMatchMorale } from './morale-engine'
import {
  decrementSuspensionsAndInjuries,
  processMatchFatigue,
  processRestRecovery,
  processInjuries,
  processRedCards,
  getSubsInPlayerIds,
} from './injury-engine'

// =============================================
// DEADLINE CALCULATION
// =============================================

/**
 * Calculates and assigns deadlines to all matches in a season.
 * Called when a season is activated.
 * 
 * Logic per competition:
 *   - Group matches by matchday
 *   - Jornada 1 deadline = activatedAt + 24h
 *   - Jornada 2 deadline = activatedAt + 48h
 *   - etc.
 */
export async function calculateMatchDeadlines(seasonId: string): Promise<void> {
  const activatedAt = new Date()

  // Get all competitions in this season
  const { data: competitions } = await supabase
    .from('competitions')
    .select('id')
    .eq('season_id', seasonId)

  if (!competitions || competitions.length === 0) return

  // Get all matches for these competitions ordered by match_order
  const { data: allMatches, error: matchesError } = await supabase
    .from('matches')
    .select(`
      id, 
      competition_id, 
      matchday, 
      match_order, 
      leg,
      competition:competitions(type)
    `)
    .in('competition_id', (competitions as any[]).map(c => c.id))
    .order('match_order', { ascending: true })

  if (matchesError || !allMatches || allMatches.length === 0) return

  // Sequential Category Deadline Assignment:
  // Maps matches to slots based on (Category + Matchday + Leg).
  // Category is either 'league' or 'cup'.
  // Parallel leagues or parallel cups share the same slot.
  // Different categories or matchdays get sequential days.
  const updates: { id: string; deadline: string }[] = []
  
  let currentGlobalDay = 0; 
  const slotDayMap = new Map<string, number>()

  for (const match of (allMatches as any[])) {
    const rawType = (match.competition as any)?.type || 'league'
    // Normalize type: 'league' stays 'league', others ('cup', 'groups_knockout') become 'cup'
    const category = rawType === 'league' ? 'league' : 'cup'
    
    const slotKey = `${category}-${match.matchday || 1}-${match.leg || 1}`

    if (!slotDayMap.has(slotKey)) {
      currentGlobalDay++
      slotDayMap.set(slotKey, currentGlobalDay)
    }

    const assignedDay = slotDayMap.get(slotKey)!
    const deadlineMs = activatedAt.getTime() + assignedDay * 24 * 60 * 60 * 1000 
    
    updates.push({ id: match.id, deadline: new Date(deadlineMs).toISOString() })
  }

  // Batch update deadlines
  for (const update of updates) {
    await (supabase.from('matches') as any)
      .update({ deadline: update.deadline })
      .eq('id', update.id)
  }
}

// =============================================
// ANNOTATION SUBMISSION
// =============================================

interface SubmitAnnotationResult {
  success: boolean
  error?: string
  matchFinalized?: boolean
}

/**
 * Submit or update a pre-annotation for a match.
 * If both teams have annotated, automatically finalizes the match.
 */
export async function submitAnnotation(
  matchId: string,
  clubId: string,
  goals: GoalEntry[],
  assists: AssistEntry[],
  mvpPlayerId: string | null,
  starting_xi: string[] = [],
  substitutes_in: SubstitutionEntry[] | string[] = []
): Promise<SubmitAnnotationResult> {
  const { data: mData, error: matchError } = await supabase
    .from('matches')
    .select('*, competition:competitions(*)')
    .eq('id', matchId)
    .single() as any

  if (matchError || !mData) {
    return { success: false, error: 'Partido no encontrado' }
  }
  const match = mData
  const m = match as any
  if (m.home_club_id !== clubId && m.away_club_id !== clubId) {
    return { success: false, error: 'Tu club no participa en este partido' }
  }

  // 3. Validate match is not already finished
  if (m.status === 'finished') {
    return { success: false, error: 'El partido ya está finalizado' }
  }

  // 4. Check if the OTHER team has already annotated (for K.O. tie validation)
  const opponentClubId = m.home_club_id === clubId ? m.away_club_id : m.home_club_id
  const { data: opponentAnnotation } = await supabase
    .from('match_annotations')
    .select('*')
    .eq('match_id', matchId)
    .eq('club_id', opponentClubId)
    .maybeSingle()

  // 5. If opponent has annotated, validate K.O. tie rules
  if (opponentAnnotation) {
    const competition = m.competition as any
    const isKnockout = competition.type === 'cup' ||
      (competition.type === 'groups_knockout' && !m.group_name)

    if (isKnockout) {
      const myGoals = goals.reduce((sum: number, g: GoalEntry) => sum + g.count, 0)
      const opponentGoals = ((opponentAnnotation as any).goals as GoalEntry[]).reduce(
        (sum: number, g: GoalEntry) => sum + g.count, 0
      )

      // Determine which side is home/away for scoring
      const isHome = m.home_club_id === clubId
      const homeScore = isHome ? myGoals : opponentGoals
      const awayScore = isHome ? opponentGoals : myGoals

      if (match.leg === 1) {
        // Check single-leg tie
        const config = competition.config as any
        const totalLegs = 'legs' in config ? config.legs : ('knockout_legs' in config ? config.knockout_legs : 1)

        if (totalLegs === 1 && homeScore === awayScore) {
          return {
            success: false,
            error: 'En eliminación directa, el resultado no puede ser empate. Ajusta los goles.',
          }
        }
      }

      if (m.leg === 2) {
        // Check aggregate tie across both legs
        const tieError = await checkAggregateTie(m, homeScore, awayScore)
        if (tieError) {
          return { success: false, error: tieError }
        }
      }
    }
  }

  // 6. Upsert annotation
  const { error: upsertError } = await supabase
    .from('match_annotations')
    .upsert(
      {
        match_id: matchId,
        club_id: clubId,
        goals,
        assists,
        mvp_player_id: mvpPlayerId,
        starting_xi,
        substitutes_in,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: 'match_id,club_id' }
    )

  if (upsertError) {
    return { success: false, error: 'Error al guardar la anotación' }
  }

  // 7. Check if BOTH annotations now exist → finalize
  if (opponentAnnotation) {
    await finalizeMatch(matchId)
    return { success: true, matchFinalized: true }
  }

  // -- PUSH NOTIFICATION (Aviso al rival) --
  const myClubName = m.home_club_id === clubId ? (m.home_club?.name || 'El rival') : (m.away_club?.name || 'El rival')
  sendPushToClub(
    opponentClubId,
    '⚽ ¡Rival Listo!',
    `${myClubName.toUpperCase()} ya ha anotado su resultado. ¡Te toca a ti!`,
    { type: 'rival_ready', match_id: matchId }
  )

  return { success: true, matchFinalized: false }
}

/**
 * Delete a pre-annotation (allows DT to re-annotate).
 */
export async function deleteAnnotation(matchId: string, clubId: string): Promise<{ success: boolean; error?: string }> {
  const { data: match } = await supabase
    .from('matches')
    .select('status')
    .eq('id', matchId)
    .single()

  if (!match || (match as any).status === 'finished') {
    return { success: false, error: 'El partido ya está finalizado' }
  }

  const { error } = await supabase
    .from('match_annotations')
    .delete()
    .eq('match_id', matchId)
    .eq('club_id', clubId)

  if (error) {
    return { success: false, error: 'Error al eliminar la anotación' }
  }

  return { success: true }
}

// =============================================
// MATCH FINALIZATION
// =============================================

/**
 * Check if a two-leg aggregate results in a tie (not allowed in K.O.)
 */
async function checkAggregateTie(
  leg2Match: Match & { competition?: Competition },
  leg2HomeScore: number,
  leg2AwayScore: number
): Promise<string | null> {
  // Find the leg 1 match: same competition, same matchday or round, leg=1
  // We match by looking for the match with same clubs but reversed home/away, leg=1
  const { data: leg1Matches } = await supabase
    .from('matches')
    .select('*')
    .eq('competition_id', leg2Match.competition_id)
    .eq('status', 'finished')
    .or(
      `and(home_club_id.eq.${leg2Match.away_club_id},away_club_id.eq.${leg2Match.home_club_id}),` +
      `and(home_club_id.eq.${leg2Match.home_club_id},away_club_id.eq.${leg2Match.away_club_id})`
    )

  if (!leg1Matches || leg1Matches.length === 0) return null

  const leg1 = (leg1Matches as any[]).find(
    (m: Match) => m.leg === 1 && m.match_order < leg2Match.match_order
  )
  if (!leg1 || leg1.home_score === null || leg1.away_score === null) return null

  // Calculate aggregates
  // Home team in leg 2 = determine who is "Team A" consistently
  // Team at home in leg 2
  const leg2HomeClub = leg2Match.home_club_id
  const leg2AwayClub = leg2Match.away_club_id

  // Find leg 2 home team's aggregate goals
  let teamHomeAgg: number, teamAwayAgg: number
  if (leg1.home_club_id === leg2AwayClub) {
    // Standard: leg1 home=A, leg2 home=B (reversed)
    // Team A total: leg1.home_score + leg2AwayScore
    // Team B total: leg1.away_score + leg2HomeScore
    teamAwayAgg = leg1.home_score + leg2AwayScore  // Team A (away in leg2)
    teamHomeAgg = leg1.away_score + leg2HomeScore   // Team B (home in leg2)
  } else {
    // Same order both legs (shouldn't happen but handle it)
    teamHomeAgg = leg1.home_score + leg2HomeScore
    teamAwayAgg = leg1.away_score + leg2AwayScore
  }

  if (teamHomeAgg === teamAwayAgg) {
    return 'El resultado global de ida y vuelta no puede ser empate. Ajusta los goles.'
  }

  return null
}

/**
 * Finalize a match: calculate scores, update standings, update player stats.
 */
async function finalizeMatch(matchId: string): Promise<void> {
  // Get both annotations
  const { data: annotations } = await supabase
    .from('match_annotations')
    .select('*')
    .eq('match_id', matchId)

  if (!annotations || annotations.length !== 2) return

  // Get match with competition
  const { data: mData } = await supabase
    .from('matches')
    .select('*, competition:competitions(*)')
    .eq('id', matchId)
    .single() as any

  if (!mData) return
  const match = mData

  const homeAnnotation = (annotations as any[]).find((a: MatchAnnotation) => a.club_id === (match as any).home_club_id)
  const awayAnnotation = (annotations as any[]).find((a: MatchAnnotation) => a.club_id === (match as any).away_club_id)

  if (!homeAnnotation || !awayAnnotation) return

  // Calculate scores
  const homeScore = ((homeAnnotation as any).goals || [] as GoalEntry[]).reduce((sum: number, g: GoalEntry) => sum + g.count, 0)
  const awayScore = ((awayAnnotation as any).goals || [] as GoalEntry[]).reduce((sum: number, g: GoalEntry) => sum + g.count, 0)

  await (supabase.from('matches') as any)
    .update({
      status: 'finished',
      home_score: homeScore,
      away_score: awayScore,
      played_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId)

  const competition = match.competition as Competition

  // Update standings (only for league and group stage)
  const isGroupStage = match.group_name !== null
  if (competition.type === 'league' || (competition.type === 'groups_knockout' && isGroupStage)) {
    await updateStandings(match, homeScore, awayScore, competition)
    
    // Auto-advance from Groups to K.O. if all group matches done
    if (competition.type === 'groups_knockout' && isGroupStage) {
      await checkAndAdvanceGroupsToKnockout(match.competition_id)
    }
  }

  // Update player stats
  await updatePlayerStats(annotations as MatchAnnotation[], (match as any).competition_id, (match as any).id)
  
  // Mark stats as done to prevent re-processing
  await (supabase.from('matches') as any)
    .update({ notes: '[STATS-DONE]' })
    .eq('id', matchId)

  // For K.O. matches: advance winner to next round
  const isKnockout = competition.type === 'cup' ||
    (competition.type === 'groups_knockout' && !isGroupStage)

  if (isKnockout) {
    await advanceWinner(match as any, homeScore, awayScore, competition as any)
  }

  // Trigger news generation after match is finalized
  try {
    fetch('/api/news/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId: matchId, isMatchTrigger: true })
    })
  } catch (e) {
    console.warn('Silent fail: Auto news generation failed after match')
  }

  // -- PUSH NOTIFICATION (Resultado Final) --
  const homeName = match.home_club?.name || 'Local'
  const awayName = match.away_club?.name || 'Visitante'
  const resultMessage = `Resultado Final: ${homeName} ${homeScore} - ${awayScore} ${awayName}`
  
  sendPushToClub(match.home_club_id, '🏁 Partido Finalizado', resultMessage, { type: 'match_finished', match_id: matchId })
  sendPushToClub(match.away_club_id, '🏁 Partido Finalizado', resultMessage, { type: 'match_finished', match_id: matchId })

  // ====== INJURY ENGINE: Post-match processing ======
  try {
    // 1. Decrement existing injuries/suspensions first (counts this match)
    await decrementSuspensionsAndInjuries((match as any).home_club_id)
    await decrementSuspensionsAndInjuries((match as any).away_club_id)
    // 2. Process fatigue for players who participated
    await processMatchFatigue(matchId)
    // 3. Recover stamina for players who didn't play
    await processRestRecovery(matchId)
    // 4. Roll for injuries (probability based on stamina)
    await processInjuries(matchId)
    // 5. Roll for red cards (every 3 matches per club)
    await processRedCards(matchId)
  } catch (injuryError) {
    console.warn('[finalizeMatch] Injury engine error (non-blocking):', injuryError)
  }

  // ====== MORALE ENGINE: Post-match moral processing ======
  try {
    const homeAnnotation_ = (annotations as any[]).find((a: MatchAnnotation) => a.club_id === (match as any).home_club_id)
    const awayAnnotation_ = (annotations as any[]).find((a: MatchAnnotation) => a.club_id === (match as any).away_club_id)
    const isHomeDraw = homeScore === awayScore
    
    await processEndOfMatchMorale(
      matchId,
      (match as any).home_club_id,
      homeScore > awayScore,
      isHomeDraw,
      homeScore < awayScore,
      homeAnnotation_ || null
    )
    await processEndOfMatchMorale(
      matchId,
      (match as any).away_club_id,
      awayScore > homeScore,
      isHomeDraw,
      awayScore < homeScore,
      awayAnnotation_ || null
    )
  } catch (moraleError) {
    console.warn('[finalizeMatch] Morale engine error (non-blocking):', moraleError)
  }
}

// =============================================
// STANDINGS UPDATE
// =============================================

export async function updateStandings(
  match: Match,
  homeScore: number,
  awayScore: number,
  competition: Competition
): Promise<void> {
  // Get points config - default to standard 3/1/0
  let pointsWin = 3, pointsDraw = 1, pointsLoss = 0

  if (competition.type === 'league') {
    const config = competition.config as LeagueConfig
    pointsWin = config.points_win ?? 3
    pointsDraw = config.points_draw ?? 1
    pointsLoss = config.points_loss ?? 0
  }

  // Determine result
  const homeWon = homeScore > awayScore
  const draw = homeScore === awayScore

  // Update HOME club standing
  const { data: homeStanding } = await supabase
    .from('standings')
    .select('*')
    .eq('competition_id', match.competition_id)
    .eq('club_id', match.home_club_id)
    .maybeSingle()

  if (homeStanding) {
    const hs = homeStanding as any
    const updates = {
      played: hs.played + 1,
      won: hs.won + (homeWon ? 1 : 0),
      drawn: hs.drawn + (draw ? 1 : 0),
      lost: hs.lost + (!homeWon && !draw ? 1 : 0),
      goals_for: hs.goals_for + homeScore,
      goals_against: hs.goals_against + awayScore,
      goal_difference: (hs.goals_for + homeScore) - (hs.goals_against + awayScore),
      points: hs.points + (homeWon ? pointsWin : draw ? pointsDraw : pointsLoss),
      updated_at: new Date().toISOString(),
    }
    await (supabase.from('standings') as any).update(updates).eq('id', hs.id)
  }

  // Update AWAY club standing
  const { data: awayStanding } = await supabase
    .from('standings')
    .select('*')
    .eq('competition_id', match.competition_id)
    .eq('club_id', match.away_club_id)
    .maybeSingle()

  if (awayStanding) {
    const as = awayStanding as any
    const awayWon = awayScore > homeScore

    const updates = {
      played: as.played + 1,
      won: as.won + (awayWon ? 1 : 0),
      drawn: as.drawn + (draw ? 1 : 0),
      lost: as.lost + (!awayWon && !draw ? 1 : 0),
      goals_for: as.goals_for + awayScore,
      goals_against: as.goals_against + homeScore,
      goal_difference: (as.goals_for + awayScore) - (as.goals_against + homeScore),
      points: as.points + (awayWon ? pointsWin : draw ? pointsDraw : pointsLoss),
      updated_at: new Date().toISOString(),
    }
    await (supabase.from('standings') as any).update(updates).eq('id', as.id)
  }
}

// =============================================
// PLAYER STATS UPDATE
// =============================================

export async function updatePlayerStats(annotations: MatchAnnotation[], competitionId: string, matchId?: string, skipIdempotencyCheck: boolean = false): Promise<void> {
  if (!annotations || annotations.length === 0) return

  // Check if stats for this match were already processed (idempotency check)
  if (matchId) {
    const { data: matchData } = await supabase
      .from('matches')
      .select('notes')
      .eq('id', matchId)
      .single()
    
    // If already marked as STATS-DONE, skip (unless admin edit bypasses this)
    if (!skipIdempotencyCheck && matchData?.notes?.includes('[STATS-DONE]')) {
      return
    }
  }

  // Aggregate all stats update for each player
  const playerStatsMap = new Map<string, {
    goals: number;
    assists: number;
    mvp: number;
    played: boolean;
    clubId: string;
  }>();

  for (const annotation of annotations) {
    const goals = (annotation.goals || []) as GoalEntry[]
    const assists = (annotation.assists || []) as AssistEntry[]
    const starting_xi = (annotation.starting_xi || []) as string[]
    const substitutes_in_ids = getSubsInPlayerIds(annotation.substitutes_in)
    const clubId = annotation.club_id;

    // Track matches played first
    const playedPlayers = new Set([...starting_xi, ...substitutes_in_ids]);
    for (const playerId of playedPlayers) {
      if (!playerStatsMap.has(playerId)) {
        playerStatsMap.set(playerId, { goals: 0, assists: 0, mvp: 0, played: true, clubId });
      } else {
        playerStatsMap.get(playerId)!.played = true;
      }
    }

    // Goals
    for (const goal of goals) {
      if (!playerStatsMap.has(goal.player_id)) {
        playerStatsMap.set(goal.player_id, { goals: 0, assists: 0, mvp: 0, played: false, clubId });
      }
      playerStatsMap.get(goal.player_id)!.goals += goal.count;
    }

    // Assists
    for (const assist of assists) {
      if (!playerStatsMap.has(assist.player_id)) {
        playerStatsMap.set(assist.player_id, { goals: 0, assists: 0, mvp: 0, played: false, clubId });
      }
      playerStatsMap.get(assist.player_id)!.assists += assist.count;
    }

    // MVP
    if (annotation.mvp_player_id) {
      if (!playerStatsMap.has(annotation.mvp_player_id)) {
        playerStatsMap.set(annotation.mvp_player_id, { goals: 0, assists: 0, mvp: 0, played: false, clubId });
      }
      playerStatsMap.get(annotation.mvp_player_id)!.mvp += 1;
    }
  }

  // Apply updates to database
  for (const [playerId, stats] of playerStatsMap.entries()) {
    try {
      const { data: existing, error: fetchError } = await supabase
        .from('player_competition_stats')
        .select('*')
        .eq('competition_id', competitionId)
        .eq('player_id', playerId)
        .maybeSingle();

      if (fetchError) continue;

      const matchesInc = stats.played ? 1 : 0;

      if (existing) {
        const ex = existing as any
        const { error: updateError } = await (supabase.from('player_competition_stats') as any)
          .update({
            goals: (ex.goals || 0) + stats.goals,
            assists: (ex.assists || 0) + stats.assists,
            mvp_count: (ex.mvp_count || 0) + stats.mvp,
            matches_played: (ex.matches_played || 0) + matchesInc,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', ex.id);
      } else {
        const { error: insertError } = await supabase
          .from('player_competition_stats')
          .insert({
            competition_id: competitionId,
            player_id: playerId,
            club_id: stats.clubId,
            goals: stats.goals,
            assists: stats.assists,
            mvp_count: stats.mvp,
            matches_played: matchesInc,
            yellow_cards: 0,
            red_cards: 0,
            minutes_played: 0,
            updated_at: new Date().toISOString(),
          } as any);
      }
    } catch {
      // Silently continue on errors
    }
  }
}


// =============================================
// K.O. ADVANCEMENT
// =============================================

async function advanceWinner(
  match: Match,
  homeScore: number,
  awayScore: number,
  competition: Competition
): Promise<void> {
  const config = competition.config as CupConfig | GroupsKnockoutConfig
  const totalLegs = 'legs' in config ? config.legs : ('knockout_legs' in config ? config.knockout_legs : 1)

  let winnerId: string | null = null

  if (totalLegs === 1) {
    // Single leg: higher score wins, tie goes to home (no extra time/penalties in this system)
    if (homeScore > awayScore) {
      winnerId = match.home_club_id
    } else if (awayScore > homeScore) {
      winnerId = match.away_club_id
    } else {
      // Tie: home advantage (could implement away goals or random in future)
      winnerId = match.home_club_id
    }
  } else if (totalLegs === 2 && match.leg === 2) {
    // Two legs, this is leg 2: check aggregate
    // Find leg 1
    const { data: leg1Matches } = await supabase
      .from('matches')
      .select('*')
      .eq('competition_id', match.competition_id)
      .eq('status', 'finished')
      .neq('id', match.id)
      .or(
        `and(home_club_id.eq.${match.away_club_id},away_club_id.eq.${match.home_club_id}),` +
        `and(home_club_id.eq.${match.home_club_id},away_club_id.eq.${match.away_club_id})`
      )

    const leg1 = (leg1Matches as any[] | null)?.find((m: any) => m.leg === 1 && m.match_order < match.match_order)
    if (!leg1 || leg1.home_score === null || leg1.away_score === null) return

    // Calculate aggregates for each team
    let teamATotal: number, teamBTotal: number
    let teamAId: string, teamBId: string

    if (leg1.home_club_id === match.away_club_id) {
      teamAId = leg1.home_club_id
      teamBId = leg1.away_club_id
      teamATotal = (leg1.home_score as number) + awayScore
      teamBTotal = (leg1.away_score as number) + homeScore
    } else {
      teamAId = leg1.home_club_id
      teamBId = leg1.away_club_id
      teamATotal = (leg1.home_score as number) + homeScore
      teamBTotal = (leg1.away_score as number) + awayScore
    }

    if (teamATotal > teamBTotal) {
      winnerId = teamAId
    } else if (teamBTotal > teamATotal) {
      winnerId = teamBId
    } else {
      // Aggregate tie: check away goals
      // TeamA's away goals = goals scored in leg where they were away
      // TeamB's away goals = goals scored in leg where they were away
      let teamAAwayGoals = 0, teamBAwayGoals = 0
      
      if (leg1.home_club_id === match.away_club_id) {
        // leg1: TeamA was home, TeamB was away -> TeamB away goals = leg1.away_score
        // leg2: TeamA is away, TeamB is home -> TeamA away goals = awayScore
        teamAAwayGoals = awayScore
        teamBAwayGoals = leg1.away_score as number
      } else {
        // leg1: TeamA was home, TeamB was away -> TeamB away goals = leg1.away_score  
        // leg2: TeamB is away, TeamA is home -> TeamB away goals += awayScore
        teamAAwayGoals = leg1.away_score as number
        teamBAwayGoals = awayScore
      }
      
      if (teamAAwayGoals > teamBAwayGoals) {
        winnerId = teamAId
      } else if (teamBAwayGoals > teamAAwayGoals) {
        winnerId = teamBId
      } else {
        // Still tied: home team in leg 2 wins (arbitrary tiebreaker)
        winnerId = match.home_club_id
      }
    }
  } else {
    // Two legs but this is leg 1: don't advance yet
    return
  }

  if (!winnerId) {
    return
  }

  // Find next round TBD match to assign the winner
  // K.O. bracket logic: winner of match N in round R goes to match floor(N/2) in round R+1
  const currentMatchday = match.matchday ?? 1
  const matchLeg = match.leg ?? 1

  // Get matches in current round to determine bracket position
  // For single leg: get all matches (filter by same leg as current match or leg=1)
  // For two legs: get leg 1 matches for consistent indexing
  let currentRoundMatches: any[] | null = null
  
  if (totalLegs === 1) {
    // Single leg: get matches with same leg value, or any leg
    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('competition_id', match.competition_id)
      .eq('matchday', currentMatchday)
      .order('match_order', { ascending: true })
    currentRoundMatches = data as any[]
  } else {
    // Two legs: get leg 1 matches for consistent bracket indexing
    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('competition_id', match.competition_id)
      .eq('matchday', currentMatchday)
      .eq('leg', 1)
      .order('match_order', { ascending: true })
    currentRoundMatches = data as any[]
  }

  if (!currentRoundMatches || currentRoundMatches.length === 0) return

  // Find the index based on the same teams (works for both leg 1 and leg 2)
  let matchIndex = -1
  if (totalLegs === 1) {
    // Single leg: find by match ID
    matchIndex = currentRoundMatches.findIndex(m => m.id === match.id)
  } else {
    // Two legs: find the leg 1 match with same teams
    matchIndex = currentRoundMatches.findIndex(m => 
      (m.home_club_id === match.home_club_id && m.away_club_id === match.away_club_id) ||
      (m.home_club_id === match.away_club_id && m.away_club_id === match.home_club_id)
    )
  }
  
  if (matchIndex === -1) return

  // Calculate target match index in next round: floor(matchIndex / 2)
  const nextMatchIndex = Math.floor(matchIndex / 2)
  // Determine if this winner goes to home (even index) or away (odd index) slot
  const goesToHome = matchIndex % 2 === 0

  // Get next round matches
  let nextRoundMatches: any[] | null = null
  
  if (totalLegs === 1) {
    // Single leg: get all matches in next matchday (no leg filter)
    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('competition_id', match.competition_id)
      .eq('matchday', currentMatchday + 1)
      .order('match_order', { ascending: true })
    nextRoundMatches = data as any[]
  } else {
    // Two legs: get leg 1 matches only for slot calculation
    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('competition_id', match.competition_id)
      .eq('matchday', currentMatchday + 1)
      .eq('leg', 1)
      .order('match_order', { ascending: true })
    nextRoundMatches = data as any[]
  }

  if (!nextRoundMatches || nextRoundMatches.length === 0) return

  const targetMatch = (nextRoundMatches as any[])[nextMatchIndex]
  if (!targetMatch) return

  if (goesToHome) {
    // Update home slot in leg 1
    await (supabase.from('matches') as any)
      .update({ home_club_id: winnerId, updated_at: new Date().toISOString() })
      .eq('id', targetMatch.id)

    // If two legs, also update away slot in leg 2 (reversed home/away)
    if (totalLegs === 2) {
      const { data: leg2Matches } = await supabase
        .from('matches')
        .select('*')
        .eq('competition_id', match.competition_id)
        .eq('matchday', currentMatchday + 1)
        .eq('leg', 2)
        .order('match_order', { ascending: true })
      
      const leg2Target = (leg2Matches as any[] | null)?.[nextMatchIndex]
      if (leg2Target) {
        await (supabase.from('matches') as any)
          .update({ away_club_id: winnerId, updated_at: new Date().toISOString() })
          .eq('id', leg2Target.id)
      }
    }
  } else {
    // Update away slot in leg 1
    await (supabase.from('matches') as any)
      .update({ away_club_id: winnerId, updated_at: new Date().toISOString() })
      .eq('id', targetMatch.id)

    // If two legs, also update home slot in leg 2 (reversed home/away)
    if (totalLegs === 2) {
      const { data: leg2Matches } = await supabase
        .from('matches')
        .select('*')
        .eq('competition_id', match.competition_id)
        .eq('matchday', currentMatchday + 1)
        .eq('leg', 2)
        .order('match_order', { ascending: true })
      
      const leg2Target = (leg2Matches as any[] | null)?.[nextMatchIndex]
      if (leg2Target) {
        await (supabase.from('matches') as any)
          .update({ home_club_id: winnerId, updated_at: new Date().toISOString() })
          .eq('id', leg2Target.id)
      }
    }
  }
}
// =============================================
// GROUP TO K.O. ADVANCEMENT
// =============================================

/**
 * Checks if all group matches are done and advances top teams to K.O.
 */
async function checkAndAdvanceGroupsToKnockout(competitionId: string): Promise<void> {
  const { data: competition } = await supabase
    .from('competitions')
    .select('*')
    .eq('id', competitionId)
    .single() as any

  if (!competition || competition.type !== 'groups_knockout') return

  // 1. Check if any group matches are still pending
  const { count: pendingCount } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .eq('competition_id', competitionId)
    .not('group_name', 'is', null)
    .neq('status', 'finished')

  if (pendingCount && pendingCount > 0) return

  // 2. All group matches finished. Get standings.
  const { data: standings } = await supabase
    .from('standings')
    .select('*')
    .eq('competition_id', competitionId)
    .order('group_name', { ascending: true })
    .order('points', { ascending: false })
    .order('goal_difference', { ascending: false })
    .order('goals_for', { ascending: false })

  if (!standings || standings.length === 0) return

  const config = competition.config as GroupsKnockoutConfig
  const qPerGroup = config.qualify_per_group || 2

  // Group teams by group_name
  const groups: Record<string, string[]> = {}
  standings.forEach((s: any) => {
    const g = s.group_name || 'A'
    if (!groups[g]) groups[g] = []
    if (groups[g].length < qPerGroup) {
      groups[g].push(s.club_id)
    }
  })

  // 3. Get the first round of K.O. matches (empty ones)
  const { data: koMatches } = await supabase
    .from('matches')
    .select('*')
    .eq('competition_id', competitionId)
    .is('group_name', null)
    .is('home_club_id', null)
    .order('matchday', { ascending: true })
    .order('match_order', { ascending: true })

  if (!koMatches || koMatches.length === 0) return

  const groupNames = Object.keys(groups).sort()
  const numGroups = groupNames.length

  // Standard cross-matching logic (1A vs 2B, 1B vs 2A, etc.)
  let matchIndex = 0
  const totalLegs = config.knockout_legs || 1

  for (let i = 0; i < numGroups; i++) {
    const groupA = groupNames[i]
    if (qPerGroup === 1) {
      if (i % 2 === 0 && i + 1 < numGroups) {
        const groupB = groupNames[i+1]
        await fillKOMatch(koMatches, matchIndex, groups[groupA][0], groups[groupB][0], totalLegs)
        matchIndex++
      }
    } else if (qPerGroup === 2) {
      if (i % 2 === 0 && i + 1 < numGroups) {
        const groupB = groupNames[i+1]
        await fillKOMatch(koMatches, matchIndex, groups[groupA][0], groups[groupB][1], totalLegs)
        matchIndex++
        await fillKOMatch(koMatches, matchIndex, groups[groupB][0], groups[groupA][1], totalLegs)
        matchIndex++
      }
    } else {
      const allQualifiers = groupNames.flatMap(gn => groups[gn])
      for (let j = 0; j < allQualifiers.length; j += 2) {
        if (j + 1 < allQualifiers.length) {
          await fillKOMatch(koMatches, matchIndex, allQualifiers[j], allQualifiers[j+1], totalLegs)
          matchIndex++
        }
      }
      break 
    }
  }
}

async function fillKOMatch(koMatches: any[], matchIdx: number, homeId: string, awayId: string, totalLegs: number) {
  if (totalLegs === 1) {
    const m = koMatches[matchIdx]
    if (!m) return
    await (supabase.from('matches') as any).update({ home_club_id: homeId, away_club_id: awayId, updated_at: new Date().toISOString() }).eq('id', m.id)
  } else {
    const ida = koMatches[matchIdx * 2]
    const vuelta = koMatches[matchIdx * 2 + 1]
    if (ida) await (supabase.from('matches') as any).update({ home_club_id: homeId, away_club_id: awayId, updated_at: new Date().toISOString() }).eq('id', ida.id)
    if (vuelta) await (supabase.from('matches') as any).update({ home_club_id: awayId, away_club_id: homeId, updated_at: new Date().toISOString() }).eq('id', vuelta.id)
  }
}

// =============================================
// EXPIRED MATCH AUTO-RESOLUTION
// =============================================

/**
 * Check for expired matches and auto-resolve them.
 * Rules:
 * - If neither team annotated: 0-0 draw
 * - If only one team annotated: that team wins with their stats, opponent gets 0
 * 
 * Optimized: Pre-fetches all data to minimize queries.
 */
export async function checkAndAutoResolveExpired(): Promise<number> {
  const now = new Date().toISOString()

  // 1. Find matches that are past deadline, not finished, and have both clubs assigned
  // Limit to 10 matches per run to avoid timeout
  const { data: expiredMatches, error: matchError } = await supabase
    .from('matches')
    .select('*, competition:competitions(*)')
    .eq('status', 'scheduled')
    .not('home_club_id', 'is', null)
    .not('away_club_id', 'is', null)
    .not('deadline', 'is', null)
    .lt('deadline', now)
    .order('deadline', { ascending: true })
    .limit(10)

  if (matchError) {
    console.error('[checkAndAutoResolveExpired] Error fetching matches:', matchError)
    return 0
  }

  if (!expiredMatches || expiredMatches.length === 0) return 0

  // 2. Pre-fetch all annotations for these matches in one query
  const matchIds = expiredMatches.map(m => m.id)
  const { data: allAnnotations } = await supabase
    .from('match_annotations')
    .select('*')
    .in('match_id', matchIds)

  // 3. Pre-fetch default lineups for all involved clubs
  const clubIds = new Set<string>()
  for (const m of expiredMatches) {
    clubIds.add(m.home_club_id)
    clubIds.add(m.away_club_id)
  }
  
  const { data: clubsData } = await supabase
    .from('clubs')
    .select('id, default_lineup')
    .in('id', Array.from(clubIds))

  const clubLineups = new Map<string, string[]>()
  for (const club of (clubsData || [])) {
    const defLineup = (club as any)?.default_lineup
    if (defLineup?.players) {
      clubLineups.set(club.id, Object.values(defLineup.players).filter(Boolean) as string[])
    } else {
      clubLineups.set(club.id, [])
    }
  }

  let resolved = 0

  // 4. Process each match
  for (const _match of expiredMatches) {
    try {
      const match = _match as Match & { competition?: Competition }
      
      // Get annotations for this match from pre-fetched data
      const matchAnnotations = (allAnnotations || []).filter((a: MatchAnnotation) => a.match_id === match.id)
      const homeAnnotation = matchAnnotations.find((a: MatchAnnotation) => a.club_id === match.home_club_id)
      const awayAnnotation = matchAnnotations.find((a: MatchAnnotation) => a.club_id === match.away_club_id)

      let homeScore: number
      let awayScore: number
      const annotationsToUpsert: object[] = []

      if (!homeAnnotation && !awayAnnotation) {
        // Neither annotated: 0-0
        homeScore = 0
        awayScore = 0

        const homeXI = clubLineups.get(match.home_club_id) || []
        const awayXI = clubLineups.get(match.away_club_id) || []

        annotationsToUpsert.push(
          { 
            match_id: match.id, 
            club_id: match.home_club_id, 
            goals: [], 
            assists: [], 
            mvp_player_id: null,
            starting_xi: homeXI,
            substitutes_in: []
          },
          { 
            match_id: match.id, 
            club_id: match.away_club_id, 
            goals: [], 
            assists: [], 
            mvp_player_id: null,
            starting_xi: awayXI,
            substitutes_in: []
          }
        )
      } else if (homeAnnotation && !awayAnnotation) {
        // Only home annotated: home wins with their goals
        homeScore = (((homeAnnotation as any).goals || []) as GoalEntry[]).reduce((s: number, g: GoalEntry) => s + g.count, 0)
        awayScore = 0

        const awayXI = clubLineups.get(match.away_club_id) || []
        annotationsToUpsert.push({ 
          match_id: match.id, 
          club_id: match.away_club_id, 
          goals: [], 
          assists: [], 
          mvp_player_id: null,
          starting_xi: awayXI,
          substitutes_in: []
        })
      } else if (!homeAnnotation && awayAnnotation) {
        // Only away annotated: away wins with their goals
        homeScore = 0
        awayScore = (((awayAnnotation as any).goals || []) as GoalEntry[]).reduce((s: number, g: GoalEntry) => s + g.count, 0)

        const homeXI = clubLineups.get(match.home_club_id) || []
        annotationsToUpsert.push({ 
          match_id: match.id, 
          club_id: match.home_club_id, 
          goals: [], 
          assists: [], 
          mvp_player_id: null,
          starting_xi: homeXI,
          substitutes_in: []
        })
      } else {
        // Both annotated but somehow not finalized (shouldn't happen, but handle it)
        homeScore = (((homeAnnotation as any)?.goals || []) as GoalEntry[]).reduce((s: number, g: GoalEntry) => s + g.count, 0)
        awayScore = (((awayAnnotation as any)?.goals || []) as GoalEntry[]).reduce((s: number, g: GoalEntry) => s + g.count, 0)
      }

      // Upsert missing annotations
      if (annotationsToUpsert.length > 0) {
        await supabase.from('match_annotations').upsert(annotationsToUpsert as any, { onConflict: 'match_id,club_id' })
      }

      // For K.O. matches: if auto-resolved result is a tie, determine winner
      const competition = match.competition as Competition
      const isKnockout = competition?.type === 'cup' ||
        (competition?.type === 'groups_knockout' && !match.group_name)
      
      const config = competition?.config as CupConfig | GroupsKnockoutConfig | undefined
      const totalLegs = config ? ('legs' in config ? config.legs : ('knockout_legs' in config ? config.knockout_legs : 1)) : 1

      if (isKnockout && homeScore === awayScore) {
        if (homeAnnotation && !awayAnnotation) {
          // Home annotated, away didn't - home wins
          homeScore = Math.max(homeScore, 1)
        } else if (!homeAnnotation && awayAnnotation) {
          // Away annotated, home didn't - away wins
          awayScore = Math.max(awayScore, 1)
        } else if (totalLegs === 2 && match.leg === 2) {
          // Both empty in leg 2 of a two-leg tie: check who won leg 1
          const { data: leg1Data } = await supabase
            .from('matches')
            .select('home_score, away_score, home_club_id, away_club_id')
            .eq('competition_id', match.competition_id)
            .eq('matchday', match.matchday)
            .eq('leg', 1)
            .or(`and(home_club_id.eq.${match.away_club_id},away_club_id.eq.${match.home_club_id}),and(home_club_id.eq.${match.home_club_id},away_club_id.eq.${match.away_club_id})`)
            .single()
          
          if (leg1Data && leg1Data.home_score !== null && leg1Data.away_score !== null) {
            // Determine who won leg 1
            if (leg1Data.home_score > leg1Data.away_score) {
              // Leg 1 home team won - they should win leg 2 too
              // In leg 2, leg1's home team is usually away
              if (leg1Data.home_club_id === match.away_club_id) {
                awayScore = 1 // Leg 1 winner (now away) wins
              } else {
                homeScore = 1 // Leg 1 winner (still home) wins
              }
            } else if (leg1Data.away_score > leg1Data.home_score) {
              // Leg 1 away team won
              if (leg1Data.away_club_id === match.home_club_id) {
                homeScore = 1 // Leg 1 winner (now home) wins
              } else {
                awayScore = 1 // Leg 1 winner (still away) wins
              }
            } else {
              // Leg 1 was also a tie - home advantage in leg 2
              homeScore = 1
            }
          } else {
            // Can't find leg 1, default to home advantage
            homeScore = 1
          }
        } else {
          // Single leg or leg 1 of two-leg: home advantage
          homeScore = homeScore + 1
        }
      }

      // Update match status - use notes field to track processing state
      await (supabase.from('matches') as any)
        .update({
          status: 'finished',
          home_score: homeScore,
          away_score: awayScore,
          played_at: new Date().toISOString(),
          notes: '[AUTO-RESOLVED][STATS-PENDING]',
          updated_at: new Date().toISOString(),
        })
        .eq('id', match.id)

      // Update standings
      const isGroupStage = match.group_name !== null
      if (competition?.type === 'league' || (competition?.type === 'groups_knockout' && isGroupStage)) {
        await updateStandings(match, homeScore, awayScore, competition)
        
        if (competition.type === 'groups_knockout' && isGroupStage) {
          await checkAndAdvanceGroupsToKnockout(match.competition_id)
        }
      }

      // Update player stats - Re-fetch annotations to get the complete set
      const { data: finalAnnotations } = await supabase
        .from('match_annotations')
        .select('*')
        .eq('match_id', match.id)

      if (finalAnnotations && finalAnnotations.length > 0) {
        await updatePlayerStats(finalAnnotations as MatchAnnotation[], match.competition_id, match.id)
        
        // Mark stats as processed
        await (supabase.from('matches') as any)
          .update({ notes: '[AUTO-RESOLVED][STATS-DONE]' })
          .eq('id', match.id)
      }

      // K.O. advancement
      if (isKnockout) {
        await advanceWinner(match, homeScore, awayScore, competition)
      }

      // ====== INJURY ENGINE: Post-match processing ======
      try {
        await decrementSuspensionsAndInjuries(match.home_club_id)
        await decrementSuspensionsAndInjuries(match.away_club_id)
        await processMatchFatigue(match.id)
        await processRestRecovery(match.id)
        await processInjuries(match.id)
        await processRedCards(match.id)
      } catch (injuryError) {
        console.warn('[autoResolve] Injury engine error (non-blocking):', injuryError)
      }

      // ====== MORALE ENGINE: Post-match moral processing ======
      try {
        const homeAnn = finalAnnotations?.find((a: any) => a.club_id === match.home_club_id) || null
        const awayAnn = finalAnnotations?.find((a: any) => a.club_id === match.away_club_id) || null
        const isDraw = homeScore === awayScore

        await processEndOfMatchMorale(match.id, match.home_club_id, homeScore > awayScore, isDraw, homeScore < awayScore, homeAnn as any)
        await processEndOfMatchMorale(match.id, match.away_club_id, awayScore > homeScore, isDraw, awayScore < homeScore, awayAnn as any)
      } catch (moraleError) {
        console.warn('[autoResolve] Morale engine error (non-blocking):', moraleError)
      }

      resolved++
    } catch (matchError) {
      console.error(`[checkAndAutoResolveExpired] Error processing match ${_match.id}:`, matchError)
      // Continue with next match
    }
  }

  return resolved
}

// =============================================
// HELPERS FOR UI
// =============================================

export interface NextMatchResult {
  match: (Match & {
    home_club?: Record<string, unknown>
    away_club?: Record<string, unknown>
    competition?: Record<string, unknown>
    my_annotation?: MatchAnnotation | null
    opponent_annotation_exists?: boolean
  }) | null
  waiting: boolean
  waiting_until: string | null
}

/**
 * Get the next pending match for a club.
 * If the match belongs to a future matchday whose previous matchday deadline
 * hasn't expired yet, returns waiting=true with the countdown target.
 */
export async function getNextMatchForClub(
  clubId: string
): Promise<NextMatchResult> {
  // Get matches for this club that are scheduled (not finished)
  const { data: matches } = await supabase
    .from('matches')
    .select(`
      *,
      home_club:clubs!matches_home_club_id_fkey(*),
      away_club:clubs!matches_away_club_id_fkey(*),
      competition:competitions!inner(
        *,
        season:seasons!inner(*)
      )
    `)
    .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
    .eq('status', 'scheduled')
    .not('home_club_id', 'is', null)
    .not('away_club_id', 'is', null)
    .order('match_order', { ascending: true })

  if (!matches || matches.length === 0) {
    return { match: null, waiting: false, waiting_until: null }
  }

  // Filter to only active season matches
  const activeMatches = matches.filter((m: Record<string, unknown>) => {
    const comp = m.competition as { season?: { status: string } } | undefined
    return comp?.season?.status === 'active'
  })

  if (activeMatches.length === 0) {
    return { match: null, waiting: false, waiting_until: null }
  }

  const nextMatch = activeMatches[0] as unknown as Match & {
    home_club?: Record<string, unknown>
    away_club?: Record<string, unknown>
    competition?: Record<string, unknown>
  }
  const now = new Date()

  // --- GLOBAL VISUAL FLOW WAIT LOGIC ---
  // If the club is "resting" or has already played its match in the current 
  // global slot, we must ensure they don't jump to the next slot prematurely.
  
  const seasonId = (nextMatch.competition as any)?.season_id
  if (seasonId) {
    // Check if there are ANY matches in this season that are still PENDING 
    // and have a deadline EARLIER than our next match's deadline.
    const { data: globalPending } = await supabase
      .from('matches')
      .select('deadline')
      .eq('status', 'scheduled')
      .not('home_club_id', 'is', null)
      .not('away_club_id', 'is', null)
      .not('deadline', 'is', null)
      .lt('deadline', nextMatch.deadline as string)
      .order('deadline', { ascending: true })
      .limit(1)

    if (globalPending && globalPending.length > 0) {
      // There is an active global slot that hasn't finished yet. 
      // The club should wait until that slot expires.
      return {
        match: null,
        waiting: true,
        waiting_until: globalPending[0].deadline,
      }
    }
  }

  // --- NORMAL: return the match ---
  // Check for annotations
  const { data: annotations } = await supabase
    .from('match_annotations')
    .select('*')
    .eq('match_id', nextMatch.id)

  const myAnnotation = annotations?.find((a: MatchAnnotation) => a.club_id === clubId) || null
  const opponentId = nextMatch.home_club_id === clubId ? nextMatch.away_club_id : nextMatch.home_club_id
  const opponentAnnotationExists = annotations?.some((a: MatchAnnotation) => a.club_id === opponentId) || false

  return {
    match: {
      ...nextMatch,
      my_annotation: myAnnotation,
      opponent_annotation_exists: opponentAnnotationExists,
    },
    waiting: false,
    waiting_until: null,
  }
}

// =============================================
// ADMIN EDIT: REVERT FUNCTIONS
// =============================================

/**
 * Revert standings for a match — subtracts the delta that the old result contributed.
 * This is the exact inverse of updateStandings().
 */
export async function revertStandings(
  match: Match,
  oldHomeScore: number,
  oldAwayScore: number,
  competition: Competition
): Promise<void> {
  let pointsWin = 3, pointsDraw = 1, pointsLoss = 0

  if (competition.type === 'league') {
    const config = competition.config as LeagueConfig
    pointsWin = config.points_win ?? 3
    pointsDraw = config.points_draw ?? 1
    pointsLoss = config.points_loss ?? 0
  }

  const homeWon = oldHomeScore > oldAwayScore
  const draw = oldHomeScore === oldAwayScore

  // Revert HOME club standing
  const { data: homeStanding } = await supabase
    .from('standings')
    .select('*')
    .eq('competition_id', match.competition_id)
    .eq('club_id', match.home_club_id)
    .maybeSingle()

  if (homeStanding) {
    const hs = homeStanding as any
    const updates = {
      played: Math.max(0, hs.played - 1),
      won: Math.max(0, hs.won - (homeWon ? 1 : 0)),
      drawn: Math.max(0, hs.drawn - (draw ? 1 : 0)),
      lost: Math.max(0, hs.lost - (!homeWon && !draw ? 1 : 0)),
      goals_for: Math.max(0, hs.goals_for - oldHomeScore),
      goals_against: Math.max(0, hs.goals_against - oldAwayScore),
      goal_difference: (Math.max(0, hs.goals_for - oldHomeScore)) - (Math.max(0, hs.goals_against - oldAwayScore)),
      points: Math.max(0, hs.points - (homeWon ? pointsWin : draw ? pointsDraw : pointsLoss)),
      updated_at: new Date().toISOString(),
    }
    await (supabase.from('standings') as any).update(updates).eq('id', hs.id)
  }

  // Revert AWAY club standing
  const { data: awayStanding } = await supabase
    .from('standings')
    .select('*')
    .eq('competition_id', match.competition_id)
    .eq('club_id', match.away_club_id)
    .maybeSingle()

  if (awayStanding) {
    const as_ = awayStanding as any
    const awayWon = oldAwayScore > oldHomeScore

    const updates = {
      played: Math.max(0, as_.played - 1),
      won: Math.max(0, as_.won - (awayWon ? 1 : 0)),
      drawn: Math.max(0, as_.drawn - (draw ? 1 : 0)),
      lost: Math.max(0, as_.lost - (!awayWon && !draw ? 1 : 0)),
      goals_for: Math.max(0, as_.goals_for - oldAwayScore),
      goals_against: Math.max(0, as_.goals_against - oldHomeScore),
      goal_difference: (Math.max(0, as_.goals_for - oldAwayScore)) - (Math.max(0, as_.goals_against - oldHomeScore)),
      points: Math.max(0, as_.points - (awayWon ? pointsWin : draw ? pointsDraw : pointsLoss)),
      updated_at: new Date().toISOString(),
    }
    await (supabase.from('standings') as any).update(updates).eq('id', as_.id)
  }
}

/**
 * Revert player competition stats for a match — subtracts the delta
 * that the old annotations contributed.
 * This is the exact inverse of updatePlayerStats().
 */
export async function revertPlayerStats(
  annotations: MatchAnnotation[],
  competitionId: string
): Promise<void> {
  if (!annotations || annotations.length === 0) return

  // Build the same map that updatePlayerStats builds
  const playerStatsMap = new Map<string, {
    goals: number;
    assists: number;
    mvp: number;
    played: boolean;
  }>()

  for (const annotation of annotations) {
    const goals = (annotation.goals || []) as GoalEntry[]
    const assists = (annotation.assists || []) as AssistEntry[]
    const starting_xi = (annotation.starting_xi || []) as string[]
    const substitutes_in_ids = getSubsInPlayerIds(annotation.substitutes_in)

    const playedPlayers = new Set([...starting_xi, ...substitutes_in_ids])
    for (const playerId of playedPlayers) {
      if (!playerStatsMap.has(playerId)) {
        playerStatsMap.set(playerId, { goals: 0, assists: 0, mvp: 0, played: true })
      } else {
        playerStatsMap.get(playerId)!.played = true
      }
    }

    for (const goal of goals) {
      if (!playerStatsMap.has(goal.player_id)) {
        playerStatsMap.set(goal.player_id, { goals: 0, assists: 0, mvp: 0, played: false })
      }
      playerStatsMap.get(goal.player_id)!.goals += goal.count
    }

    for (const assist of assists) {
      if (!playerStatsMap.has(assist.player_id)) {
        playerStatsMap.set(assist.player_id, { goals: 0, assists: 0, mvp: 0, played: false })
      }
      playerStatsMap.get(assist.player_id)!.assists += assist.count
    }

    if (annotation.mvp_player_id) {
      if (!playerStatsMap.has(annotation.mvp_player_id)) {
        playerStatsMap.set(annotation.mvp_player_id, { goals: 0, assists: 0, mvp: 0, played: false })
      }
      playerStatsMap.get(annotation.mvp_player_id)!.mvp += 1
    }
  }

  // Subtract from database
  for (const [playerId, stats] of playerStatsMap.entries()) {
    try {
      const { data: existing } = await supabase
        .from('player_competition_stats')
        .select('*')
        .eq('competition_id', competitionId)
        .eq('player_id', playerId)
        .maybeSingle()

      if (existing) {
        const ex = existing as any
        const matchesDec = stats.played ? 1 : 0
        await (supabase.from('player_competition_stats') as any)
          .update({
            goals: Math.max(0, (ex.goals || 0) - stats.goals),
            assists: Math.max(0, (ex.assists || 0) - stats.assists),
            mvp_count: Math.max(0, (ex.mvp_count || 0) - stats.mvp),
            matches_played: Math.max(0, (ex.matches_played || 0) - matchesDec),
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', ex.id)
      }
    } catch {
      // Silently continue
    }
  }
}
