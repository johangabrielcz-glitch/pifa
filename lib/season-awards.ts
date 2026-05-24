import type {
  Club,
  Competition,
  Match,
  PlayerCompetitionStats,
  Player,
  Standing,
} from './types'

/**
 * Lógica pura para reconstruir los premios de una temporada archivada
 * a partir de standings / matches / player_competition_stats (cálculo en vivo).
 * Sin acceso a BD — recibe los datos ya cargados.
 */

export interface ChampionResult {
  clubId: string
  club: Club | null
}

/** Ordena standings por (puntos, diferencia de goles, goles a favor) desc. */
export function sortStandings(standings: Standing[]): Standing[] {
  return [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference
    return b.goals_for - a.goals_for
  })
}

/** Goles que un club marcó en un partido concreto (robusto a home/away). */
function goalsInMatch(m: Match, clubId: string): number {
  if (m.home_club_id === clubId) return m.home_score ?? 0
  if (m.away_club_id === clubId) return m.away_score ?? 0
  return 0
}

/**
 * Determina el ganador de una eliminatoria (single o doble) a partir de los
 * partidos de la final ya finalizados. Replica la lógica de advanceWinner.
 */
function resolveKnockoutWinner(finalMatches: Match[]): string | null {
  const finished = finalMatches.filter(
    (m) => m.status === 'finished' && m.home_score != null && m.away_score != null
  )
  if (finished.length === 0) return null

  if (finished.length === 1) {
    const m = finished[0]
    if ((m.home_score ?? 0) > (m.away_score ?? 0)) return m.home_club_id
    if ((m.away_score ?? 0) > (m.home_score ?? 0)) return m.away_club_id
    return m.home_club_id // empate → ventaja local
  }

  // Doble partido (ida/vuelta)
  const ida = finished.find((m) => m.leg === 1) ?? finished[0]
  const vuelta = finished.find((m) => m.leg === 2) ?? finished[1]
  const teamA = ida.home_club_id
  const teamB = ida.away_club_id

  const aTotal = goalsInMatch(ida, teamA) + goalsInMatch(vuelta, teamA)
  const bTotal = goalsInMatch(ida, teamB) + goalsInMatch(vuelta, teamB)
  if (aTotal > bTotal) return teamA
  if (bTotal > aTotal) return teamB

  // Empate en agregado → goles de visitante (A visita en la vuelta, B en la ida)
  const aAway = goalsInMatch(vuelta, teamA)
  const bAway = goalsInMatch(ida, teamB)
  if (aAway > bAway) return teamA
  if (bAway > aAway) return teamB

  // Sigue empatado → local de la vuelta
  return vuelta.home_club_id
}

/**
 * Resuelve el campeón de una competencia.
 * - league: posición 1 de standings
 * - cup / groups_knockout: ganador del partido(s) cuya round_name empieza por 'Final'
 * Devuelve null si no es derivable (liga incompleta / final sin jugar).
 */
export function resolveChampion(
  competition: Competition,
  standings: Standing[],
  matches: Match[]
): ChampionResult | null {
  if (competition.type === 'league') {
    const top = sortStandings(standings)[0]
    if (!top) return null
    return { clubId: top.club_id, club: top.club ?? null }
  }

  // cup o groups_knockout → la final (las de grupos nunca empiezan por 'Final')
  const finals = matches.filter((m) => (m.round_name ?? '').startsWith('Final'))
  const winnerId = resolveKnockoutWinner(finals)
  if (!winnerId) return null

  const club =
    finals.find((m) => m.home_club_id === winnerId)?.home_club ??
    finals.find((m) => m.away_club_id === winnerId)?.away_club ??
    null
  return { clubId: winnerId, club }
}

export interface AggregatedPlayerStat {
  player_id: string
  player?: Player
  club?: Club
  goals: number
  assists: number
  mvp_count: number
  matches_played: number
}

/** Suma stats por player_id a través de todas las competencias de la temporada. */
export function aggregateGlobalStats(
  allStats: (PlayerCompetitionStats & { player?: Player; club?: Club })[]
): AggregatedPlayerStat[] {
  const map = new Map<string, AggregatedPlayerStat>()
  for (const s of allStats) {
    const existing = map.get(s.player_id)
    if (existing) {
      existing.goals += s.goals
      existing.assists += s.assists
      existing.mvp_count += s.mvp_count
      existing.matches_played += s.matches_played
      if (!existing.club && s.club) existing.club = s.club
      if (!existing.player && s.player) existing.player = s.player
    } else {
      map.set(s.player_id, {
        player_id: s.player_id,
        player: s.player,
        club: s.club,
        goals: s.goals,
        assists: s.assists,
        mvp_count: s.mvp_count,
        matches_played: s.matches_played,
      })
    }
  }
  return Array.from(map.values())
}

type Metric = 'goals' | 'assists' | 'mvp_count'

/** Top N por una métrica (descendente), descartando ceros. */
export function topByMetric<T extends Record<Metric, number>>(
  stats: T[],
  metric: Metric,
  limit: number
): T[] {
  return [...stats]
    .filter((s) => s[metric] > 0)
    .sort((a, b) => b[metric] - a[metric])
    .slice(0, limit)
}

/** Cuenta títulos por club a partir de los campeones de cada competencia. */
export function countTitlesByClub(champions: (ChampionResult | null)[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const c of champions) {
    if (!c) continue
    m.set(c.clubId, (m.get(c.clubId) ?? 0) + 1)
  }
  return m
}

/** Etiqueta de gesta múltiple según número de títulos del club. */
export function multiTitleLabel(count: number): string | null {
  if (count >= 4) return 'PÓQUER'
  if (count === 3) return 'TRIPLETE'
  if (count === 2) return 'DOBLETE'
  return null
}
