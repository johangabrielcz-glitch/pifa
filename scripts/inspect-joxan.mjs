import { createClient } from '@supabase/supabase-js'
// No dotenv needed with --env-file flag

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('--- INSPECTING SEASON ---')
  const { data: seasons } = await supabase
    .from('seasons')
    .select('*')
    .eq('status', 'active')
    .limit(1)

  if (!seasons || seasons.length === 0) {
    console.error('No active season found')
    return
  }

  const season = seasons[0]
  console.log(`Active Season: ${season.name} (${season.id})`)

  console.log('\n--- FINDING JOXAN FC ---')
  const { data: clubs } = await supabase
    .from('clubs')
    .select('*')
    .ilike('name', '%Joxan%')

  if (!clubs || clubs.length === 0) {
    console.error('Joxan FC not found')
    return
  }

  const joxan = clubs[0]
  console.log(`Club: ${joxan.name} (${joxan.id})`)

  console.log('\n--- FETCHING JOXAN MATCHES ---')
  const { data: matches } = await supabase
    .from('matches')
    .select('*, competition:competitions(*)')
    .or(`home_club_id.eq.${joxan.id},away_club_id.eq.${joxan.id}`)
    .ilike('round_name', '%Semifinales%')
    .order('match_order', { ascending: true })

  const { data: allSeasonComps } = await supabase
    .from('competitions')
    .select('id, name')
    .eq('season_id', season.id)

  const compIds = allSeasonComps.map(c => c.id)

  console.log('\n--- ALL SEMIFINALES IN SEASON ---')
  const { data: allSemis } = await supabase
    .from('matches')
    .select('*, competition:competitions(name)')
    .in('competition_id', compIds)
    .ilike('round_name', '%Semifinales%')
    .order('match_order', { ascending: true })

  if (allSemis) {
    allSemis.forEach(m => {
      console.log(`[${m.deadline}] Order: ${m.match_order} | MD: ${m.matchday} | Leg: ${m.leg} | ${m.competition.name} | ${m.round_name} | ${m.home_club_id} vs ${m.away_club_id}`)
    })
  }

  console.log('\n--- NEARBY LIGA MATCHES (around order 120-150) ---')
  const { data: ligaMatches } = await supabase
    .from('matches')
    .select('*, competition:competitions(name)')
    .in('competition_id', compIds)
    .ilike('round_name', '%Jornada%')
    .gte('match_order', 120)
    .lte('match_order', 160)
    .order('match_order', { ascending: true })

  if (ligaMatches) {
    ligaMatches.forEach(m => {
      console.log(`[${m.deadline}] Order: ${m.match_order} | MD: ${m.matchday} | ${m.competition.name} | ${m.round_name}`)
    })
  }
}

run()
