import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  const { data: matches } = await supabase
    .from('matches')
    .select('id, round_name, match_order, deadline, competition:competitions(name)')
    .gte('match_order', 145)
    .lte('match_order', 250)
    .order('match_order', { ascending: true })

  if (matches) {
    matches.forEach(m => {
      console.log(`[${m.deadline}] Order: ${m.match_order} | ${m.competition.name} | ${m.round_name}`)
    })
  }
}

run()
