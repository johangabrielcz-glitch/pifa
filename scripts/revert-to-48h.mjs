import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('--- REVERTING TO 48H GAP (Mundial starts May 12) ---')

  const { data: matches } = await supabase
    .from('matches')
    .select('*, competition:competitions(name)')

  if (!matches) return

  const updates = []

  const isMundial = (m) => m.competition.name.includes('Mundial')

  for (const m of matches) {
    // MUNDIAL J1 -> May 12
    if (isMundial(m)) {
      if (m.round_name.includes('J1')) updates.push({ id: m.id, deadline: '2026-05-12T04:49:30.010Z' })
      if (m.round_name.includes('J2')) updates.push({ id: m.id, deadline: '2026-05-13T04:49:30.010Z' })
      if (m.round_name.includes('J3')) updates.push({ id: m.id, deadline: '2026-05-14T04:49:30.010Z' })
    }
  }

  console.log(`Applying ${updates.length} updates...`)
  for (const up of updates) {
    const { id, ...rest } = up
    await supabase.from('matches').update(rest).eq('id', id)
  }

  console.log('--- REVERSION COMPLETED ---')
}

run()
