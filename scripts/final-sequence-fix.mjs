import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('--- FIXING THE FINAL SEQUENCE ONCE AND FOR ALL ---')

  const { data: matches } = await supabase
    .from('matches')
    .select('*, competition:competitions(name)')

  if (!matches) return

  const updates = []

  const isCL = (m) => m.competition.name.includes('Champions')
  const isEL = (m) => m.competition.name.includes('Europa')
  const isMundial = (m) => m.competition.name.includes('Mundial')
  const isLiga = (m) => m.competition.name.includes('Liga')

  for (const m of matches) {
    // 1. FINALS (Both on May 11)
    if ((isCL(m) || isEL(m)) && m.round_name === 'Final') {
      updates.push({ id: m.id, deadline: '2026-05-11T04:49:30.010Z', match_order: isCL(m) ? 220 : 221 })
    }

    // 2. MUNDIAL J1 (May 12 - 24h after Finals)
    if (isMundial(m)) {
      if (m.round_name.includes('J1')) updates.push({ id: m.id, deadline: '2026-05-12T04:49:30.010Z', match_order: 230 + (updates.length % 10) })
      if (m.round_name.includes('J2')) updates.push({ id: m.id, deadline: '2026-05-13T04:49:30.010Z', match_order: 240 + (updates.length % 10) })
      if (m.round_name.includes('J3')) updates.push({ id: m.id, deadline: '2026-05-14T04:49:30.010Z', match_order: 250 + (updates.length % 10) })
      
      // Move all other Mundial phases (Cuartos, Semis...) forward to avoid collisions
      if (!m.round_name.includes('J')) {
        updates.push({ id: m.id, match_order: 300 + (updates.length % 50) })
      }
    }
  }

  console.log(`Applying ${updates.length} updates...`)
  for (const up of updates) {
    const { id, ...rest } = up
    await supabase.from('matches').update(rest).eq('id', id)
  }

  console.log('--- SEQUENCE FIXED ---')
}

run()
