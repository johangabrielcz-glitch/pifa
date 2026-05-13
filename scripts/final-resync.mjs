import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('--- FINAL REPAIR AND SPREAD ---')

  // 1. Get ALL matches of the season
  const { data: matches } = await supabase
    .from('matches')
    .select('id, round_name, match_order, deadline, competition:competitions(name)')
    .order('match_order', { ascending: true })

  if (!matches) return

  const updates = []

  // --- A. FIX CL GROUP STAGE (RE-ORDER TO 1-100 RANGE) ---
  const clGroup = matches.filter(m => m.competition.name.includes('Champions') && m.round_name.includes('J'))
  clGroup.forEach((m, i) => {
    updates.push({ id: m.id, match_order: 1 + i, deadline: m.deadline === '2026-05-11T04:49:30.010Z' ? '2026-04-18T04:49:30.010Z' : m.deadline })
  })

  // --- B. FIX MUNDIAL SEQUENCE (J1, J2, J3 DAILY) ---
  const mundial = matches.filter(m => m.competition.name.includes('Mundial'))
  
  const mJ1 = mundial.filter(m => m.round_name.includes('J1'))
  const mJ2 = mundial.filter(m => m.round_name.includes('J2'))
  const mJ3 = mundial.filter(m => m.round_name.includes('J3'))
  const mRest = mundial.filter(m => !m.round_name.includes('J1') && !m.round_name.includes('J2') && !m.round_name.includes('J3'))

  mJ1.forEach((m, i) => updates.push({ id: m.id, match_order: 201 + i, deadline: '2026-05-11T04:49:30.010Z' }))
  mJ2.forEach((m, i) => updates.push({ id: m.id, match_order: 211 + i, deadline: '2026-05-12T04:49:30.010Z' }))
  mJ3.forEach((m, i) => updates.push({ id: m.id, match_order: 221 + i, deadline: '2026-05-13T04:49:30.010Z' }))
  mRest.forEach((m, i) => updates.push({ id: m.id, match_order: 231 + i }))

  // --- C. FINALS (After Mundial Groups) ---
  const clFinal = matches.find(m => m.competition.name.includes('Champions') && m.round_name === 'Final')
  const elFinal = matches.find(m => m.competition.name.includes('Europa') && m.round_name === 'Final')

  if (clFinal) updates.push({ id: clFinal.id, match_order: 229, deadline: '2026-05-14T04:49:30.010Z' })
  if (elFinal) updates.push({ id: elFinal.id, match_order: 230, deadline: '2026-05-15T04:49:30.010Z' })

  // Apply with temporary offset to avoid unique constraints
  console.log('Applying temporary offset...')
  for (const up of updates) {
    await supabase.from('matches').update({ match_order: up.match_order + 15000 }).eq('id', up.id)
  }

  console.log('Applying final updates...')
  for (const up of updates) {
    const { id, ...rest } = up
    await supabase.from('matches').update(rest).eq('id', id)
  }

  console.log('--- CALENDAR RE-SYNCHRONIZED ---')
}

run()
