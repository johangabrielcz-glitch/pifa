import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  const { data: matches } = await supabase
    .from('matches')
    .select('id, round_name, match_order, deadline, competition:competitions(name)')
    .gte('deadline', '2026-05-05T00:00:00Z')
    .lte('deadline', '2026-05-16T00:00:00Z')
    .order('deadline', { ascending: true })

  if (matches) {
    const uniqueDates = {}
    matches.forEach(m => {
      const date = m.deadline.split('T')[0]
      if (!uniqueDates[date]) uniqueDates[date] = []
      uniqueDates[date].push(`${m.competition.name} - ${m.round_name}`)
    })
    
    Object.keys(uniqueDates).sort().forEach(date => {
      console.log(`\n--- ${date} ---`)
      const uniqueRounds = [...new Set(uniqueDates[date])]
      uniqueRounds.forEach(r => console.log(`  ${r}`))
    })
  }
}

run()
