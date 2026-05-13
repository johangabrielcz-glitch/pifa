import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('--- ADJUSTING TO 24H GAP ---')

  const { data: matches } = await supabase
    .from('matches')
    .select('*, competition:competitions(name)')

  if (!matches) return

  const updates = []

  const isCL = (m) => m.competition.name.includes('Champions')
  const isEL = (m) => m.competition.name.includes('Europa')
  const isMundial = (m) => m.competition.name.includes('Mundial')

  for (const m of matches) {
    // 1. FINALS -> May 11 (24h after MD 18)
    if ((isCL(m) || isEL(m)) && m.round_name === 'Final') {
      updates.push({ id: m.id, deadline: '2026-05-11T04:49:30.010Z' })
    }

    // 2. MUNDIAL J1 -> May 11 (24h after MD 18)
    if (isMundial(m)) {
      if (m.round_name.includes('J1')) updates.push({ id: m.id, deadline: '2026-05-11T04:49:30.010Z' })
      if (m.round_name.includes('J2')) updates.push({ id: m.id, deadline: '2026-05-12T04:49:30.010Z' })
      if (m.round_name.includes('J3')) updates.push({ id: m.id, deadline: '2026-05-13T04:49:30.010Z' })
    }
  }

  console.log(`Applying ${updates.length} updates...`)
  for (const up of updates) {
    const { id, ...rest } = up
    await supabase.from('matches').update(rest).eq('id', id)
  }

  console.log('--- 24H GAP APPLIED ---')
}

run()
