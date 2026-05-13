import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  const { data: matches } = await supabase
    .from('matches')
    .select('id, round_name, match_order, deadline, competition:competitions(name)')
    .gte('deadline', '2026-05-11T00:00:00Z')
    .lte('deadline', '2026-05-11T23:59:59Z')
    .order('match_order', { ascending: true })

  if (matches) {
    matches.forEach(m => {
      console.log(`[${m.deadline}] Order: ${m.match_order} | ${m.competition.name} | ${m.round_name}`)
    })
  }
}

run()
