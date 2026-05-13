import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('--- ROBUST RECOVERY ---')

  const { data: matches } = await supabase
    .from('matches')
    .select('*, competition:competitions(name)')

  if (!matches) return

  const updates = []

  const isCL = (m) => m.competition.name.includes('Champions')
  const isMundial = (m) => m.competition.name.includes('Mundial')

  for (const m of matches) {
    // --- FIX CL GROUPS ---
    if (isCL(m)) {
      if (m.round_name.includes('J1')) updates.push({ id: m.id, deadline: '2026-04-25T04:49:30.010Z', match_order: m.match_order < 100 ? m.match_order : 58 })
      if (m.round_name.includes('J2')) updates.push({ id: m.id, deadline: '2026-04-28T04:49:30.010Z', match_order: m.match_order < 100 ? m.match_order : 76 })
      if (m.round_name.includes('J3')) updates.push({ id: m.id, deadline: '2026-05-02T04:49:30.010Z', match_order: m.match_order < 150 ? m.match_order : 102 })
    }

    // --- FIX MUNDIAL (DAILY) ---
    if (isMundial(m)) {
      if (m.round_name.includes('J1')) updates.push({ id: m.id, deadline: '2026-05-11T04:49:30.010Z' })
      if (m.round_name.includes('J2')) updates.push({ id: m.id, deadline: '2026-05-12T04:49:30.010Z' })
      if (m.round_name.includes('J3')) updates.push({ id: m.id, deadline: '2026-05-13T04:49:30.010Z' })
    }
  }

  // Apply
  for (const up of updates) {
    const { id, ...rest } = up
    await supabase.from('matches').update(rest).eq('id', id)
  }

  console.log('--- ROBUST RECOVERY DONE ---')
}

run()
