import { supabaseAdmin as supabase } from './supabase'
import type { Competition, CompetitionType, PrizeConfig, Standing, Match } from './types'
import { sortStandings, resolveChampion } from './season-awards'
import { sendPushToClub, sendPushToAll } from './push-notifications'

// =============================================
// SEASON-END PRIZE MONEY ENGINE
// =============================================
// Pays clubs once per finished season for: matches won, final classification
// per competition (league position / cup round reached) and titles (champion
// bonus). Amounts are per-competition, admin-configurable with defaults.

const K = 1_000

// Cup/groups_knockout classification tiers (deepest round reached).
export const ROUND_TIERS = ['champion', 'finalist', 'semifinal', 'quarterfinal', 'round_16', 'round_32', 'group_stage'] as const
export type RoundTier = typeof ROUND_TIERS[number]

export const TIER_LABEL: Record<string, string> = {
  champion: 'Campeón',
  finalist: 'Finalista',
  semifinal: 'Semifinal',
  quarterfinal: 'Cuartos',
  round_16: 'Octavos',
  round_32: 'Dieciseisavos',
  group_stage: 'Fase de grupos',
}

/**
 * Sensible default prize amounts, calibrated to the game economy
 * (avg salary ~30K, star 100-200K, common transfer ~40K). Admin-editable.
 */
export function defaultPrizeConfig(type: CompetitionType, teamCount: number): PrizeConfig {
  if (type === 'league') {
    const n = Math.max(2, teamCount || 2)
    const top = 150 * K
    const floor = 5 * K
    const positions: number[] = []
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1)
      const val = top * Math.pow(floor / top, t) // geometric decay 150K → 5K
      positions.push(Math.max(floor, Math.round(val / K) * K))
    }
    return { per_win: 6 * K, title_bonus: 100 * K, positions, rounds: {} }
  }
  const groups = type === 'groups_knockout'
  return {
    per_win: groups ? 7 * K : 8 * K,
    title_bonus: groups ? 110 * K : 100 * K,
    positions: [],
    rounds: {
      champion: 120 * K,
      finalist: 70 * K,
      semifinal: 40 * K,
      quarterfinal: 22 * K,
      round_16: 12 * K,
      round_32: 6 * K,
      group_stage: groups ? 6 * K : 4 * K,
    },
  }
}

/** Resolve the effective config for a competition (stored override or default). */
export function getCompetitionPrizeConfig(comp: { type: CompetitionType; prize_config?: PrizeConfig | null }, teamCount: number): PrizeConfig {
  return comp.prize_config ?? defaultPrizeConfig(comp.type, teamCount)
}

// Map a round_name to a tier + its bracket depth (higher = deeper).
function roundTierOf(roundName: string | null): { tier: RoundTier; depth: number } {
  const r = (roundName ?? '').toLowerCase()
  if (r.startsWith('final')) return { tier: 'finalist', depth: 6 } // champion split out later
  if (r.includes('semifinal')) return { tier: 'semifinal', depth: 5 }
  if (r.includes('cuartos')) return { tier: 'quarterfinal', depth: 4 }
  if (r.includes('octavos')) return { tier: 'round_16', depth: 3 }
  if (r.includes('dieciseisavos')) return { tier: 'round_32', depth: 2 }
  if (r.includes('ronda de')) return { tier: 'round_32', depth: 2 }
  return { tier: 'group_stage', depth: 0 } // "Grupo X - JN" and anything else
}

/**
 * For a cup / groups_knockout: the deepest round each club reached.
 * Champion (final winner) gets 'champion'; the other finalist 'finalist'.
 */
export function computeCupClassification(competition: Competition, matches: Match[]): Map<string, RoundTier> {
  const deepest = new Map<string, { tier: RoundTier; depth: number }>()
  const consider = (clubId: string | null, roundName: string | null) => {
    if (!clubId) return
    const t = roundTierOf(roundName)
    const cur = deepest.get(clubId)
    if (!cur || t.depth > cur.depth) deepest.set(clubId, t)
  }
  for (const m of matches) {
    if (m.status !== 'finished' || m.home_score == null || m.away_score == null) continue
    consider(m.home_club_id, m.round_name)
    consider(m.away_club_id, m.round_name)
  }

  const championId = resolveChampion(competition, [], matches)?.clubId ?? null
  const out = new Map<string, RoundTier>()
  for (const [clubId, info] of deepest) {
    if (info.tier === 'finalist' && clubId === championId) out.set(clubId, 'champion')
    else out.set(clubId, info.tier)
  }
  return out
}

export interface PrizeLine {
  competitionId: string | null
  competitionName: string
  category: 'match_won' | 'classification' | 'title'
  detail: string
  amount: number
}
export interface ClubPrize {
  clubId: string
  clubName: string
  total: number
  lines: PrizeLine[]
}
export interface SeasonPrizeBreakdown {
  clubs: ClubPrize[] // sorted by total desc, only clubs with any prize
  grandTotal: number
}

/**
 * Compute (read-only) the full prize breakdown for a season. Used by both the
 * admin preview and the payout, so "preview == reality".
 */
export async function computeSeasonPrizes(seasonId: string): Promise<SeasonPrizeBreakdown> {
  const { data: comps } = await supabase
    .from('competitions')
    .select('id, name, type, config, prize_config')
    .eq('season_id', seasonId)

  const competitions = (comps as any[]) || []
  if (competitions.length === 0) return { clubs: [], grandTotal: 0 }
  const compIds = competitions.map((c) => c.id)

  const [matchesRes, standingsRes, clubsRes] = await Promise.all([
    supabase
      .from('matches')
      .select('id, competition_id, home_club_id, away_club_id, home_score, away_score, status, round_name, leg')
      .in('competition_id', compIds),
    supabase.from('standings').select('*').in('competition_id', compIds),
    supabase.from('clubs').select('id, name'),
  ])

  const allMatches = (matchesRes.data as any[]) || []
  const allStandings = (standingsRes.data as any[]) || []
  const clubName = new Map<string, string>(((clubsRes.data as any[]) || []).map((c) => [c.id, c.name]))

  // Accumulator: clubId -> lines
  const acc = new Map<string, PrizeLine[]>()
  const addLine = (clubId: string, line: PrizeLine) => {
    if (!clubId || line.amount <= 0) return
    const arr = acc.get(clubId) || []
    arr.push(line)
    acc.set(clubId, arr)
  }

  for (const comp of competitions) {
    const compMatches: Match[] = allMatches.filter((m) => m.competition_id === comp.id)
    const compStandings: Standing[] = allStandings.filter((s) => s.competition_id === comp.id)
    const teamCount = comp.type === 'league'
      ? compStandings.length
      : new Set(compMatches.flatMap((m) => [m.home_club_id, m.away_club_id]).filter(Boolean)).size
    const cfg = getCompetitionPrizeConfig(comp, teamCount)

    // 1) Matches won (real, score-based) — aggregate per club for this competition.
    const wins = new Map<string, number>()
    for (const m of compMatches) {
      if (m.status !== 'finished' || m.home_score == null || m.away_score == null) continue
      if (m.home_club_id && m.home_score > m.away_score) wins.set(m.home_club_id, (wins.get(m.home_club_id) || 0) + 1)
      else if (m.away_club_id && m.away_score > m.home_score) wins.set(m.away_club_id, (wins.get(m.away_club_id) || 0) + 1)
    }
    for (const [clubId, n] of wins) {
      addLine(clubId, {
        competitionId: comp.id,
        competitionName: comp.name,
        category: 'match_won',
        detail: `${comp.name} · ${n} ${n === 1 ? 'victoria' : 'victorias'}`,
        amount: cfg.per_win * n,
      })
    }

    // 2) Classification + 3) Title
    const champion = resolveChampion(comp as Competition, compStandings, compMatches)
    if (comp.type === 'league') {
      const sorted = sortStandings(compStandings)
      sorted.forEach((s, i) => {
        const amount = cfg.positions.length > 0 ? cfg.positions[Math.min(i, cfg.positions.length - 1)] : 0
        addLine(s.club_id, {
          competitionId: comp.id,
          competitionName: comp.name,
          category: 'classification',
          detail: `${comp.name} · ${i + 1}º`,
          amount,
        })
      })
    } else {
      const classification = computeCupClassification(comp as Competition, compMatches)
      for (const [clubId, tier] of classification) {
        addLine(clubId, {
          competitionId: comp.id,
          competitionName: comp.name,
          category: 'classification',
          detail: `${comp.name} · ${TIER_LABEL[tier]}`,
          amount: cfg.rounds[tier] ?? 0,
        })
      }
    }

    // Title bonus (extra, on top of classification) for the champion.
    if (champion?.clubId) {
      addLine(champion.clubId, {
        competitionId: comp.id,
        competitionName: comp.name,
        category: 'title',
        detail: `${comp.name} · Título`,
        amount: cfg.title_bonus,
      })
    }
  }

  const clubs: ClubPrize[] = []
  for (const [clubId, lines] of acc) {
    const total = lines.reduce((s, l) => s + l.amount, 0)
    if (total <= 0) continue
    clubs.push({ clubId, clubName: clubName.get(clubId) || 'Club', total, lines })
  }
  clubs.sort((a, b) => b.total - a.total)
  const grandTotal = clubs.reduce((s, c) => s + c.total, 0)
  return { clubs, grandTotal }
}

function fmtMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('es')
}

export interface PayPrizesResult {
  success: boolean
  paid?: number // number of clubs credited
  grandTotal?: number
  error?: string
}

/**
 * Pay season-end prizes once. Credits clubs.budget, writes the audit breakdown,
 * marks the season as paid (idempotent), and notifies DTs (internal + push)
 * plus a global push.
 */
export async function paySeasonPrizes(seasonId: string): Promise<PayPrizesResult> {
  try {
    const { data: season } = await supabase
      .from('seasons')
      .select('id, name, prizes_paid')
      .eq('id', seasonId)
      .single()

    if (!season) return { success: false, error: 'Temporada no encontrada' }
    if ((season as any).prizes_paid) return { success: false, error: 'Los premios de esta temporada ya fueron pagados' }

    const breakdown = await computeSeasonPrizes(seasonId)
    const payable = breakdown.clubs.filter((c) => c.total > 0)
    const now = new Date().toISOString()
    const seasonName = (season as any).name as string

    // 1) Credit budgets + collect audit rows
    const auditRows: any[] = []
    for (const cp of payable) {
      const { data: club } = await supabase.from('clubs').select('budget').eq('id', cp.clubId).single()
      const current = (club as any)?.budget ?? 0
      await (supabase.from('clubs') as any)
        .update({ budget: current + cp.total, updated_at: now })
        .eq('id', cp.clubId)
      for (const line of cp.lines) {
        auditRows.push({
          season_id: seasonId,
          club_id: cp.clubId,
          competition_id: line.competitionId,
          category: line.category,
          detail: line.detail,
          amount: line.amount,
        })
      }
    }
    if (auditRows.length > 0) await (supabase.from('season_prizes') as any).insert(auditRows)

    // 2) Mark paid (idempotency)
    await (supabase.from('seasons') as any)
      .update({ prizes_paid: true, prizes_paid_at: now, updated_at: now })
      .eq('id', seasonId)

    // 3) Internal notifications per club
    if (payable.length > 0) {
      const notifs = payable.map((c) => ({
        club_id: c.clubId,
        title: '💰 Premios de Temporada',
        message: `Tu club recibió ${fmtMoney(c.total)} en premios por ${seasonName}. Desglose: ${c.lines.map((l) => `${l.detail} (${fmtMoney(l.amount)})`).join(' · ')}.`,
        type: 'season_prizes',
        is_read: false,
      }))
      await (supabase.from('notifications') as any).insert(notifs)
    }

    // 4) Push: per-club + a single global announcement (best-effort)
    const pushes: Promise<any>[] = payable.map((c) =>
      sendPushToClub(
        c.clubId,
        '💰 Premios de Temporada',
        `Recibiste ${fmtMoney(c.total)} en premios por ${seasonName}. ¡Revisa el desglose!`,
        { type: 'season_prizes', season_id: seasonId }
      )
    )
    pushes.push(
      sendPushToAll(
        '💰 Premios Repartidos',
        `Se repartieron los premios de ${seasonName}. ¡Revisa cuánto ganó tu club y cómo se mueve el mercado!`,
        { type: 'season_prizes_global', season_id: seasonId }
      )
    )
    await Promise.allSettled(pushes)

    return { success: true, paid: payable.length, grandTotal: breakdown.grandTotal }
  } catch (err: any) {
    console.error('Error paying season prizes:', err)
    return { success: false, error: err?.message || 'Error al pagar premios' }
  }
}
