import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  const clubId = 'c438530d-d6a0-4c77-903d-7962575781b8'
  const { data: matches } = await supabase
    .from('matches')
    .select('*, competition:competitions(name)')
    .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
    .order('deadline', { ascending: true })

  if (matches) {
    matches.filter(m => m.deadline > '2026-05-04').forEach(m => {
      console.log(`[${m.deadline}] Order: ${m.match_order} | ${m.competition.name} | ${m.round_name}`)
    })
  }
  
  // Also check Finals even if Joxan isn't in them yet
  const { data: finals } = await supabase
    .from('matches')
    .select('*, competition:competitions(name)')
    .eq('round_name', 'Final')
    .order('deadline', { ascending: true })
    
  console.log('\n--- FINALS ---')
  finals.filter(m => m.deadline > '2026-05-04').forEach(m => {
    console.log(`[${m.deadline}] Order: ${m.match_order} | ${m.competition.name} | ${m.round_name}`)
  })
}

run()
