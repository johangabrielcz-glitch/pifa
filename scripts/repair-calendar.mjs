import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('--- REPAIRING CALENDAR ERRORS ---')

  // 1. Fetch all potentially affected matches
  const { data: matches } = await supabase
    .from('matches')
    .select('id, round_name, match_order, deadline, competition:competitions(name)')
    .or('round_name.ilike.%J1%,round_name.ilike.%J2%,round_name.ilike.%J3%,round_name.eq.Final')

  if (!matches) return

  const updates = []

  // --- A. REPAIR CL GROUP J1 (Restore to April 18) ---
  const clJ1 = matches.filter(m => m.competition.name.includes('Champions') && m.round_name.includes('J1'))
  clJ1.forEach(m => {
    // Original deadline for J1 in typical seasons is around start (April 18)
    updates.push({ id: m.id, deadline: '2026-04-18T04:49:30.010Z' })
  })

  // --- B. FIX MUNDIAL SEQUENCE (J1, J2, J3 DAILY) ---
  const mundialMatches = matches.filter(m => m.competition.name.includes('Mundial'))
  
  const mJ1 = mundialMatches.filter(m => m.round_name.includes('J1'))
  const mJ2 = mundialMatches.filter(m => m.round_name.includes('J2'))
  const mJ3 = mundialMatches.filter(m => m.round_name.includes('J3'))

  mJ1.forEach((m, i) => {
    updates.push({ id: m.id, match_order: 161 + i, deadline: '2026-05-11T04:49:30.010Z' })
  })
  mJ2.forEach((m, i) => {
    updates.push({ id: m.id, match_order: 171 + i, deadline: '2026-05-12T04:49:30.010Z' })
  })
  mJ3.forEach((m, i) => {
    updates.push({ id: m.id, match_order: 181 + i, deadline: '2026-05-13T04:49:30.010Z' })
  })

  // --- C. FINALS (After Mundial Groups) ---
  const clFinal = matches.find(m => m.competition.name.includes('Champions') && m.round_name === 'Final')
  const elFinal = matches.find(m => m.competition.name.includes('Europa') && m.round_name === 'Final')

  if (clFinal) updates.push({ id: clFinal.id, match_order: 191, deadline: '2026-05-14T04:49:30.010Z' })
  if (elFinal) updates.push({ id: elFinal.id, match_order: 192, deadline: '2026-05-15T04:49:30.010Z' })

  // Apply updates
  console.log('Moving to temporary orders...')
  for (const up of updates) {
    await supabase.from('matches').update({ match_order: up.match_order ? up.match_order + 9000 : undefined }).eq('id', up.id)
  }

  console.log('Applying final updates...')
  for (const up of updates) {
    const { id, ...rest } = up
    await supabase.from('matches').update(rest).eq('id', id)
  }

  console.log('--- CALENDAR REPAIRED ---')
}

run()
