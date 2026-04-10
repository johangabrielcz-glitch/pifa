import { supabase } from './supabase'
import type {
  GoalEntry,
  AssistEntry,
  MatchAnnotation,
  Match,
  Competition,
  LeagueConfig,
  CupConfig,
  GroupsKnockoutConfig,
} from './types'

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
    .select('id, competition_id, matchday, match_order')
    .in('competition_id', (competitions as any[]).map(c => c.id))
    .order('match_order', { ascending: true })

  if (matchesError || !allMatches || allMatches.length === 0) return

  // Group by competition, then extract unique matchdays in order
  const compMatchdays = new Map<string, number[]>()

  for (const match of (allMatches as any[])) {
    const md = match.matchday ?? 1
    if (!compMatchdays.has(match.competition_id)) {
      compMatchdays.set(match.competition_id, [])
    }
    const list = compMatchdays.get(match.competition_id)!
    if (!list.includes(md)) {
      list.push(md)
    }
  }

  // Build deadline map: for each competition, each matchday+leg gets an incremental 24h slot
  // We use the GLOBAL order across all competitions so they share the timeline
  const matchdaySlots: { compId: string; matchday: number; leg: number; firstOrder: number }[] = []

  // Collect all unique combinations of (competition_id, matchday, leg)
  for (const match of (allMatches as any[])) {
    const md = match.matchday ?? 1
    const leg = match.leg ?? 1
    const compId = match.competition_id

    const exists = matchdaySlots.find(
      s => s.compId === compId && s.matchday === md && s.leg === leg
    )

    if (!exists) {
      matchdaySlots.push({
        compId,
        matchday: md,
        leg,
        firstOrder: match.match_order ?? 0,
      })
    }
  }

  // Sort by first match_order so the global calendar sequence is respected
  matchdaySlots.sort((a, b) => a.firstOrder - b.firstOrder)

  // Assign deadlines: each slot gets its own 24h window
  const updates: { id: string; deadline: string }[] = []

  for (let slotIndex = 0; slotIndex < matchdaySlots.length; slotIndex++) {
    const slot = matchdaySlots[slotIndex]
    const deadlineMs = activatedAt.getTime() + (slotIndex + 1) * 24 * 60 * 60 * 1000
    const deadline = new Date(deadlineMs).toISOString()

    // Find all matches in this specific slot (competition + matchday + leg)
    const matchesInSlot = (allMatches as any[]).filter(
      m => m.competition_id === slot.compId && 
           (m.matchday ?? 1) === slot.matchday &&
           (m.leg ?? 1) === slot.leg
    )

    for (const match of matchesInSlot) {
      updates.push({ id: match.id, deadline })
    }
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
  substitutes_in: string[] = []
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
  }

  // Update player stats
  await updatePlayerStats(annotations as MatchAnnotation[], (match as any).competition_id)

  // For K.O. matches: advance winner to next round
  const isKnockout = competition.type === 'cup' ||
    (competition.type === 'groups_knockout' && !isGroupStage)

  if (isKnockout) {
    await advanceWinner(match as any, homeScore, awayScore, competition as any)
  }
}

// =============================================
// STANDINGS UPDATE
// =============================================

async function updateStandings(
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

async function updatePlayerStats(annotations: MatchAnnotation[], competitionId: string): Promise<void> {
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
    const substitutes_in = (annotation.substitutes_in || []) as string[]
    const clubId = annotation.club_id;

    // Track matches played first
    const playedPlayers = new Set([...starting_xi, ...substitutes_in]);
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
      // Update
      await (supabase.from('player_competition_stats') as any)
        .update({
          goals: (ex.goals || 0) + stats.goals,
          assists: (ex.assists || 0) + stats.assists,
          mvp_count: (ex.mvp_count || 0) + stats.mvp,
          matches_played: (ex.matches_played || 0) + matchesInc,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', ex.id);
    } else {
      // Insert
      await supabase
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
    // Single leg: higher score wins
    winnerId = homeScore > awayScore ? match.home_club_id : match.away_club_id
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
    // In standard format: leg1 home=TeamA, leg2 home=TeamB
    let teamATotal: number, teamBTotal: number
    let teamAId: string, teamBId: string

    if (leg1.home_club_id === match.away_club_id) {
      // Standard: leg1 home played away in leg2
      teamAId = leg1.home_club_id
      teamBId = leg1.away_club_id
      teamATotal = (leg1.home_score as number) + awayScore   // TeamA: home in leg1 + away in leg2
      teamBTotal = (leg1.away_score as number) + homeScore    // TeamB: away in leg1 + home in leg2
    } else {
      teamAId = leg1.home_club_id
      teamBId = leg1.away_club_id
      teamATotal = (leg1.home_score as number) + homeScore
      teamBTotal = (leg1.away_score as number) + awayScore
    }

    winnerId = teamATotal > teamBTotal ? teamAId : teamBId
  } else {
    // Two legs but this is leg 1: don't advance yet
    return
  }

  if (!winnerId) return

  // Find next round TBD match to assign the winner
  // Get current match's matchday, find matches in matchday+1 with NULL slots
  const currentMatchday = match.matchday ?? 1

  const { data: nextRoundMatches } = await supabase
    .from('matches')
    .select('*')
    .eq('competition_id', match.competition_id)
    .gt('matchday', currentMatchday)
    .is('home_club_id', null)
    .order('matchday', { ascending: true })
    .order('match_order', { ascending: true })
    .limit(10)

  if (!nextRoundMatches || nextRoundMatches.length === 0) {
    // Also check for away_club_id being null
    const { data: nextAwayNull } = await supabase
      .from('matches')
      .select('*')
      .eq('competition_id', match.competition_id)
      .gt('matchday', currentMatchday)
      .is('away_club_id', null)
      .order('matchday', { ascending: true })
      .order('match_order', { ascending: true })
      .limit(10)

    if (nextAwayNull && nextAwayNull.length > 0) {
      // Fill away slot in the first available match
      const target = nextAwayNull[0] as any
      await (supabase.from('matches') as any)
        .update({ away_club_id: winnerId, updated_at: new Date().toISOString() })
        .eq('id', target.id)

      // If this is leg 1 of a two-leg round, update leg 2 as well (reversed)
      if (totalLegs === 2) {
        const { data: leg2Matches } = await supabase
          .from('matches')
          .select('*')
          .eq('competition_id', match.competition_id)
          .eq('matchday', target.matchday)
          .eq('leg', 2)
          .is('home_club_id', null)
          .limit(1)

        if (leg2Matches && leg2Matches.length > 0) {
          await (supabase.from('matches') as any)
            .update({ home_club_id: winnerId, updated_at: new Date().toISOString() })
            .eq('id', (leg2Matches[0] as any).id)
        }
      }
    }
    return
  }

  // Fill home slot
  const target = nextRoundMatches[0] as any
  await (supabase.from('matches') as any)
    .update({ home_club_id: winnerId, updated_at: new Date().toISOString() })
    .eq('id', target.id)

  // If two legs, also update leg 2 (winner plays away in leg 2)
  if (totalLegs === 2) {
    const { data: leg2 } = await supabase
      .from('matches')
      .select('*')
      .eq('competition_id', match.competition_id)
      .eq('matchday', target.matchday)
      .eq('leg', 2)
      .is('away_club_id', null)
      .limit(1)

    if (leg2 && leg2.length > 0) {
      await (supabase.from('matches') as any)
        .update({ away_club_id: winnerId, updated_at: new Date().toISOString() })
        .eq('id', (leg2[0] as any).id)
    }
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
 */
export async function checkAndAutoResolveExpired(): Promise<number> {
  const now = new Date().toISOString()

  // Find matches that are past deadline, not finished, and have both clubs assigned
  const { data: expiredMatches } = await supabase
    .from('matches')
    .select('*, competition:competitions(*)')
    .eq('status', 'scheduled')
    .not('home_club_id', 'is', null)
    .not('away_club_id', 'is', null)
    .not('deadline', 'is', null)
    .lt('deadline', now)

  if (!expiredMatches || expiredMatches.length === 0) return 0

  let resolved = 0

  for (const _match of expiredMatches) {
    const match = _match as Match & { competition?: Competition }
    // Get existing annotations
    const { data: annotations } = await supabase
      .from('match_annotations')
      .select('*')
      .eq('match_id', match.id)

    const homeAnnotation = annotations?.find((a: MatchAnnotation) => a.club_id === match.home_club_id)
    const awayAnnotation = annotations?.find((a: MatchAnnotation) => a.club_id === match.away_club_id)

    // Helper to get default lineup players as starting_xi
    const getDefaultXI = async (clubId: string): Promise<string[]> => {
      const { data } = await supabase.from('clubs').select('default_lineup').eq('id', clubId).single()
      const defLineup = (data as any)?.default_lineup
      if (defLineup?.players) {
        return Object.values(defLineup.players).filter(Boolean) as string[]
      }
      return []
    }

    let homeScore: number
    let awayScore: number

    if (!homeAnnotation && !awayAnnotation) {
      // Neither annotated: 0-0
      homeScore = 0
      awayScore = 0

      // Create empty annotations for both (using default lineups for participation)
      const homeXI = await getDefaultXI(match.home_club_id)
      const awayXI = await getDefaultXI(match.away_club_id)

      await supabase.from('match_annotations').upsert([
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
        },
      ] as any, { onConflict: 'match_id,club_id' })
    } else if (homeAnnotation && !awayAnnotation) {
      // Only home annotated: home wins
      homeScore = ((homeAnnotation as any).goals as GoalEntry[]).reduce((s: number, g: GoalEntry) => s + g.count, 0)
      awayScore = 0

      const awayXI = await getDefaultXI(match.away_club_id)
      await supabase.from('match_annotations').upsert(
        { 
          match_id: match.id, 
          club_id: match.away_club_id, 
          goals: [], 
          assists: [], 
          mvp_player_id: null,
          starting_xi: awayXI,
          substitutes_in: []
        } as any,
        { onConflict: 'match_id,club_id' }
      )
    } else if (!homeAnnotation && awayAnnotation) {
      // Only away annotated: away wins
      homeScore = 0
      awayScore = ((awayAnnotation as any).goals as GoalEntry[]).reduce((s: number, g: GoalEntry) => s + g.count, 0)

      const homeXI = await getDefaultXI(match.home_club_id)
      await supabase.from('match_annotations').upsert(
        { 
          match_id: match.id, 
          club_id: match.home_club_id, 
          goals: [], 
          assists: [], 
          mvp_player_id: null,
          starting_xi: homeXI,
          substitutes_in: []
        } as any,
        { onConflict: 'match_id,club_id' }
      )
    } else {
      // Both annotated but somehow not finalized (shouldn't happen, but handle it)
      homeScore = (((homeAnnotation as any)!.goals || []) as GoalEntry[]).reduce((s: number, g: GoalEntry) => s + g.count, 0)
      awayScore = (((awayAnnotation as any)!.goals || []) as GoalEntry[]).reduce((s: number, g: GoalEntry) => s + g.count, 0)
    }

    // For K.O. matches: if auto-resolved result is a tie, give win to the team that annotated
    const competition = match.competition as Competition
    const isKnockout = competition.type === 'cup' ||
      (competition.type === 'groups_knockout' && !match.group_name)

    if (isKnockout && homeScore === awayScore) {
      if (homeAnnotation && !awayAnnotation) {
        // Home annotated, they win (add +1 goal if was 0-0)
        homeScore = Math.max(homeScore, 1)
      } else if (!homeAnnotation && awayAnnotation) {
        awayScore = Math.max(awayScore, 1)
      } else {
        // Both empty or both annotated with same score: home advantage
        homeScore = homeScore + 1
      }
    }

    // Update match
    await (supabase.from('matches') as any)
      .update({
        status: 'finished',
        home_score: homeScore,
        away_score: awayScore,
        played_at: new Date().toISOString(),
        notes: 'Auto-resuelto por expiración de plazo',
        updated_at: new Date().toISOString(),
      })
      .eq('id', match.id)

    // Update standings
    const isGroupStage = match.group_name !== null
    if (competition.type === 'league' || (competition.type === 'groups_knockout' && isGroupStage)) {
      await updateStandings(match, homeScore, awayScore, competition)
    }

    // Update player stats
    const { data: finalAnnotations } = await supabase
      .from('match_annotations')
      .select('*')
      .eq('match_id', match.id)

    if (finalAnnotations) {
      await updatePlayerStats(finalAnnotations as MatchAnnotation[], match.competition_id)
    }

    // K.O. advancement
    if (isKnockout) {
      await advanceWinner(match, homeScore, awayScore, competition)
    }

    resolved++
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

  // --- MATCHDAY WAIT LOGIC ---
  // Check if there are finished matches in ANY of the club's competitions
  // whose deadline hasn't passed yet. If so, the club should wait.
  const { data: recentFinished } = await supabase
    .from('matches')
    .select('id, deadline, competition_id, matchday, match_order')
    .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
    .eq('status', 'finished')
    .not('deadline', 'is', null)
    .order('match_order', { ascending: false })
    .limit(10)

  if (recentFinished && recentFinished.length > 0) {
    // Find the most recent finished match whose deadline is still in the future
    // This means the current matchday hasn't expired yet
    const typedFinished = recentFinished as unknown as { id: string; deadline: string; competition_id: string; matchday: number; match_order: number }[]
    const stillActiveDeadline = typedFinished.find((m) => {
      return new Date(m.deadline) > now
    })

    if (stillActiveDeadline) {
      // The next match belongs to a future matchday, but the current matchday
      // deadline hasn't passed yet — wait until it does
      const nextMatchDeadline = nextMatch.deadline as string | null
      const currentDeadline = stillActiveDeadline.deadline

      // Only block if the next match has a DIFFERENT (later) deadline than the active one
      if (nextMatchDeadline && nextMatchDeadline !== currentDeadline) {
        return {
          match: null,
          waiting: true,
          waiting_until: currentDeadline,
        }
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
