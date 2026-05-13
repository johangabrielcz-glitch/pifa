import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('--- THE ACTUAL ULTIMATE REPAIR ---')

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
    // 1. RESTORE CL GROUPS
    if (isCL(m)) {
      if (m.round_name.includes('J1')) updates.push({ id: m.id, deadline: '2026-04-25T04:49:30.010Z' })
      if (m.round_name.includes('J2')) updates.push({ id: m.id, deadline: '2026-04-28T04:49:30.010Z' })
      if (m.round_name.includes('J3')) updates.push({ id: m.id, deadline: '2026-05-02T04:49:30.010Z' })
      
      // 2. FINALS (CL: May 11, EL: May 12)
      if (m.round_name === 'Final') {
        updates.push({ id: m.id, deadline: '2026-05-11T04:49:30.010Z', match_order: 250 })
      }
    }
    
    if (isEL(m) && m.round_name === 'Final') {
      updates.push({ id: m.id, deadline: '2026-05-12T04:49:30.010Z', match_order: 251 })
    }

    // 3. SEMIS (Ida: May 06, Vuelta: May 09)
    if ((isCL(m) || isEL(m)) && m.round_name.includes('Semifinales - Ida')) {
      updates.push({ id: m.id, deadline: '2026-05-06T04:49:30.010Z' })
    }
    if ((isCL(m) || isEL(m)) && m.round_name.includes('Semifinales - Vuelta')) {
      updates.push({ id: m.id, deadline: '2026-05-09T04:49:30.010Z' })
    }

    // 4. LIGA (MD 16: May 07, MD 17: May 08, MD 18: May 10)
    if (isLiga(m)) {
      if (m.round_name === 'Jornada 16') updates.push({ id: m.id, deadline: '2026-05-07T04:49:30.010Z' })
      if (m.round_name === 'Jornada 17') updates.push({ id: m.id, deadline: '2026-05-08T04:49:30.010Z' })
      if (m.round_name === 'Jornada 18') updates.push({ id: m.id, deadline: '2026-05-10T04:49:30.010Z' })
    }

    // 5. MUNDIAL (Daily from May 13)
    if (isMundial(m)) {
      if (m.round_name.includes('J1')) updates.push({ id: m.id, deadline: '2026-05-13T04:49:30.010Z', match_order: 301 + (updates.length % 10) })
      if (m.round_name.includes('J2')) updates.push({ id: m.id, deadline: '2026-05-14T04:49:30.010Z', match_order: 311 + (updates.length % 10) })
      if (m.round_name.includes('J3')) updates.push({ id: m.id, deadline: '2026-05-15T04:49:30.010Z', match_order: 321 + (updates.length % 10) })
    }
  }

  // Apply
  console.log(`Applying ${updates.length} updates...`)
  for (const up of updates) {
    const { id, ...rest } = up
    await supabase.from('matches').update(rest).eq('id', id)
  }

  console.log('--- REPAIR COMPLETED ---')
}

run()
