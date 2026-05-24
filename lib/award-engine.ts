import type { Competition, Standing, PlayerCompetitionStats, Player, Club, User, AwardKey } from './types'
import type { ChampionResult } from './season-awards'

/**
 * Motor de puntos puro para los premios de la gala. Sin acceso a BD: recibe los
 * datos ya cargados (bloques por competencia + pesos ajustables) y produce
 * rankings completos por premio. La UI corta a N nominados y permite curar.
 */

export type AwardStatRow = PlayerCompetitionStats & { player?: Player; club?: Club }

export interface AwardCompBlock {
  competition: Competition
  stats: AwardStatRow[]
  standings: Standing[]
  champion: ChampionResult | null
}

export interface AwardEngineInput {
  blocks: AwardCompBlock[]
  weights: Record<string, number>
  clubMatchCounts: Record<string, number>
  clubsById: Record<string, Club>
  dtByClub: Record<string, User>
}

export const DEFAULT_WEIGHT_BY_TYPE: Record<string, number> = {
  league: 1.0,
  groups_knockout: 0.9,
  cup: 0.8,
}

export function defaultWeight(c: Competition): number {
  return DEFAULT_WEIGHT_BY_TYPE[c.type] ?? 1.0
}

// ---------- Nominee shapes ----------

export interface PlayerNominee {
  type: 'player'
  id: string
  player?: Player
  club?: Club
  position: string
  score: number
  goals: number      // raw
  assists: number    // raw
  mvp: number        // raw
  apps: number       // raw total
  titles: number
  wGoals: number     // ponderado (para Bota de Oro)
}

export interface ClubNominee {
  type: 'club'
  id: string
  club?: Club
  score: number
  titles: number
  points: number
  gd: number
}

export interface DtNominee {
  type: 'user'
  id: string
  user?: User
  club?: Club
  score: number
  titles: number
  budget: number
  achievement: number
}

export type Nominee = PlayerNominee | ClubNominee | DtNominee

// ---------- Player aggregates ----------

interface PlayerAgg {
  player_id: string
  player?: Player
  position: string
  mainClubId?: string
  mainClub?: Club
  wGoals: number; wAssists: number; wMVP: number; wApps: number
  rawGoals: number; rawAssists: number; rawMVP: number
  discipline: number
  titlePoints: number; titlesCount: number
  teamSuccess: number
  defScore: number
  totalApps: number
  appsByClub: Record<string, number>
  eligible: boolean
}

function computePlayerAggregates(
  blocks: AwardCompBlock[],
  weights: Record<string, number>,
  clubMatchCounts: Record<string, number>
): PlayerAgg[] {
  const map = new Map<string, PlayerAgg>()
  const clubFromRows: Record<string, Club> = {}

  for (const block of blocks) {
    const w = weights[block.competition.id] ?? defaultWeight(block.competition)
    const champId = block.champion?.clubId
    const stById: Record<string, Standing> = {}
    let maxGA = 0
    let maxPts = 0
    for (const s of block.standings) {
      stById[s.club_id] = s
      if (s.goals_against > maxGA) maxGA = s.goals_against
      if (s.points > maxPts) maxPts = s.points
    }

    for (const row of block.stats) {
      if (row.club) clubFromRows[row.club_id] = row.club
      let a = map.get(row.player_id)
      if (!a) {
        a = {
          player_id: row.player_id, player: row.player, position: row.player?.position ?? '',
          wGoals: 0, wAssists: 0, wMVP: 0, wApps: 0, rawGoals: 0, rawAssists: 0, rawMVP: 0,
          discipline: 0, titlePoints: 0, titlesCount: 0, teamSuccess: 0, defScore: 0,
          totalApps: 0, appsByClub: {}, eligible: false,
        }
        map.set(row.player_id, a)
      }
      if (!a.player && row.player) a.player = row.player
      if (!a.position && row.player?.position) a.position = row.player.position

      a.wGoals += w * (row.goals ?? 0)
      a.wAssists += w * (row.assists ?? 0)
      a.wMVP += w * (row.mvp_count ?? 0)
      a.wApps += w * (row.matches_played ?? 0)
      a.rawGoals += row.goals ?? 0
      a.rawAssists += row.assists ?? 0
      a.rawMVP += row.mvp_count ?? 0
      a.discipline += w * (0.5 * (row.yellow_cards ?? 0) + 1.5 * (row.red_cards ?? 0))
      a.totalApps += row.matches_played ?? 0
      a.appsByClub[row.club_id] = (a.appsByClub[row.club_id] ?? 0) + (row.matches_played ?? 0)

      if (champId && row.club_id === champId) {
        a.titlePoints += w
        a.titlesCount += 1
      }

      let factor = 0
      if (champId && row.club_id === champId) factor = 1
      else if (stById[row.club_id] && maxPts > 0) factor = stById[row.club_id].points / maxPts
      a.teamSuccess += w * factor

      const st = stById[row.club_id]
      if (st && maxGA > 0) a.defScore += w * (1 - st.goals_against / maxGA)
    }
  }

  for (const a of map.values()) {
    let best = -1
    let bestClub: string | undefined
    for (const [cid, apps] of Object.entries(a.appsByClub)) {
      if (apps > best) { best = apps; bestClub = cid }
    }
    a.mainClubId = bestClub
    a.mainClub = bestClub ? clubFromRows[bestClub] : undefined
    const clubMatches = bestClub ? (clubMatchCounts[bestClub] ?? 0) : 0
    a.eligible = clubMatches === 0 ? a.totalApps > 0 : a.totalApps >= 0.3 * clubMatches
  }

  return [...map.values()]
}

function playerNominee(a: PlayerAgg, score: number): PlayerNominee {
  return {
    type: 'player', id: a.player_id, player: a.player, club: a.mainClub, position: a.position,
    score, goals: a.rawGoals, assists: a.rawAssists, mvp: a.rawMVP, apps: a.totalApps,
    titles: a.titlesCount, wGoals: a.wGoals,
  }
}

function rankPlayers(
  aggs: PlayerAgg[],
  scoreFn: (a: PlayerAgg) => number,
  opts: { gkOnly?: boolean } = {}
): PlayerNominee[] {
  let pool = aggs.filter((a) => a.eligible)
  if (opts.gkOnly) pool = pool.filter((a) => a.position === 'GK')
  return pool
    .map((a) => ({ a, n: playerNominee(a, scoreFn(a)) }))
    .filter((x) => x.n.score > 0)
    .sort((x, y) =>
      y.n.score - x.n.score ||
      y.n.titles - x.n.titles ||
      x.n.apps - y.n.apps ||
      (x.n.player?.name ?? '').localeCompare(y.n.player?.name ?? '')
    )
    .map((x) => x.n)
}

// Coeficientes por premio (fijos)
const scoreBallon = (a: PlayerAgg) => 4 * a.wGoals + 3 * a.wAssists + 5 * a.wMVP + 6 * a.titlePoints + 2 * a.teamSuccess - a.discipline
const scoreTheBest = (a: PlayerAgg) => 3 * a.wGoals + 2.5 * a.wAssists + 4 * a.wMVP + 14 * a.titlePoints + 6 * a.teamSuccess - a.discipline
const scorePlaymaker = (a: PlayerAgg) => 6 * a.wAssists + 3 * a.wMVP + 1 * a.wGoals + 3 * a.titlePoints - a.discipline
const scoreGolden = (a: PlayerAgg) => a.wGoals
const scoreKahn = (a: PlayerAgg) => 5 * a.wMVP + 0.3 * a.wApps + 8 * a.defScore + 6 * a.titlePoints

// ---------- Club aggregates ----------

interface ClubAgg {
  clubId: string
  club?: Club
  titlePoints: number; titlesCount: number
  pointsNorm: number
  rawPoints: number
  gd: number
  achievement: number
}

function computeClubAggregates(
  blocks: AwardCompBlock[],
  weights: Record<string, number>,
  clubsById: Record<string, Club>
): ClubAgg[] {
  const map = new Map<string, ClubAgg>()
  const clubFromRows: Record<string, Club> = {}

  const ensure = (clubId: string): ClubAgg => {
    let c = map.get(clubId)
    if (!c) {
      c = { clubId, club: clubsById[clubId] ?? clubFromRows[clubId], titlePoints: 0, titlesCount: 0, pointsNorm: 0, rawPoints: 0, gd: 0, achievement: 0 }
      map.set(clubId, c)
    }
    return c
  }

  for (const block of blocks) {
    const w = weights[block.competition.id] ?? defaultWeight(block.competition)
    const champId = block.champion?.clubId
    let maxPts = 0
    for (const s of block.standings) if (s.points > maxPts) maxPts = s.points

    for (const row of block.stats) if (row.club) clubFromRows[row.club_id] = row.club

    // clubs presentes: standings + stats + champion
    const present = new Set<string>()
    for (const s of block.standings) present.add(s.club_id)
    for (const row of block.stats) present.add(row.club_id)
    if (champId) present.add(champId)
    for (const cid of present) {
      const c = ensure(cid)
      if (!c.club) c.club = clubsById[cid] ?? clubFromRows[cid]
    }

    if (champId) {
      const c = ensure(champId)
      c.titlePoints += w
      c.titlesCount += 1
    }
    for (const s of block.standings) {
      const c = ensure(s.club_id)
      if (maxPts > 0) c.pointsNorm += w * (s.points / maxPts)
      c.rawPoints += s.points
      c.gd += s.goal_difference
    }
  }

  for (const c of map.values()) {
    c.achievement = 20 * c.titlePoints + 5 * c.pointsNorm + 0.1 * c.gd
  }
  return [...map.values()]
}

function rankClubs(clubAggs: ClubAgg[]): ClubNominee[] {
  return clubAggs
    .map<ClubNominee>((c) => ({ type: 'club', id: c.clubId, club: c.club, score: c.achievement, titles: c.titlesCount, points: c.rawPoints, gd: c.gd }))
    .filter((n) => n.score > 0)
    .sort((x, y) => y.score - x.score || y.titles - x.titles || y.gd - x.gd || (x.club?.name ?? '').localeCompare(y.club?.name ?? ''))
}

function rankDts(
  clubAggs: ClubAgg[],
  clubsById: Record<string, Club>,
  dtByClub: Record<string, User>
): DtNominee[] {
  const withDt = clubAggs.filter((c) => dtByClub[c.clubId])
  let minB = Infinity
  let maxB = -Infinity
  for (const c of withDt) {
    const b = clubsById[c.clubId]?.budget ?? 0
    if (b < minB) minB = b
    if (b > maxB) maxB = b
  }
  const range = maxB - minB
  return withDt
    .map<DtNominee>((c) => {
      const budget = clubsById[c.clubId]?.budget ?? 0
      const budgetFactor = range > 0 ? (maxB - budget) / range : 0
      const score = c.achievement * (1 + budgetFactor)
      return { type: 'user', id: dtByClub[c.clubId].id, user: dtByClub[c.clubId], club: c.club, score, titles: c.titlesCount, budget, achievement: c.achievement }
    })
    .filter((n) => n.score > 0)
    .sort((x, y) => y.score - x.score || y.titles - x.titles || (x.user?.full_name ?? '').localeCompare(y.user?.full_name ?? ''))
}

// ---------- Master ----------

export function computeAwards(input: AwardEngineInput): Record<AwardKey, Nominee[]> {
  const aggs = computePlayerAggregates(input.blocks, input.weights, input.clubMatchCounts)
  const clubAggs = computeClubAggregates(input.blocks, input.weights, input.clubsById)
  return {
    ballon_dor: rankPlayers(aggs, scoreBallon),
    the_best: rankPlayers(aggs, scoreTheBest),
    best_playmaker: rankPlayers(aggs, scorePlaymaker),
    golden_boot: rankPlayers(aggs, scoreGolden),
    oliver_kahn: rankPlayers(aggs, scoreKahn, { gkOnly: true }),
    club_year: rankClubs(clubAggs),
    dt_year: rankDts(clubAggs, input.clubsById, input.dtByClub),
  }
}
