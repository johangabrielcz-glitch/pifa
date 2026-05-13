import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('--- STARTING MEGA SHIFT ---')

  // 1. Fetch ALL matches from Order 153 onwards
  const { data: matches } = await supabase
    .from('matches')
    .select('id, round_name, match_order, deadline, competition:competitions(name)')
    .gte('match_order', 153)
    .order('match_order', { ascending: true })

  if (!matches) return

  // 2. Identify the core events
  const md18 = matches.filter(m => m.round_name === 'Jornada 18').sort((a,b) => a.id.localeCompare(b.id))
  const clFinal = matches.find(m => m.round_name === 'Final' && m.competition.name.includes('Champions'))
  const elFinal = matches.find(m => m.round_name === 'Final' && m.competition.name.includes('Europa'))
  const mundialMatches = matches.filter(m => m.competition.name.includes('Mundial')).sort((a,b) => {
    // Sort mundial by round_name (J1, J2...) then ID
    return a.round_name.localeCompare(b.round_name) || a.id.localeCompare(b.id)
  })

  const updates = []

  // --- SLOT 1: MD 18 (Order 153-160, Deadline May 10) ---
  md18.forEach((m, i) => {
    updates.push({ id: m.id, match_order: 153 + i, deadline: '2026-05-10T04:49:30.010Z' })
  })

  // --- SLOT 2: MUNDIAL J1 (Order 161-168, Deadline May 11) ---
  const mundialJ1 = mundialMatches.filter(m => m.round_name.includes('J1'))
  mundialJ1.forEach((m, i) => {
    updates.push({ id: m.id, match_order: 161 + i, deadline: '2026-05-11T04:49:30.010Z' })
  })

  // --- SLOT 3: CL FINAL (Order 169, Deadline May 12) ---
  if (clFinal) updates.push({ id: clFinal.id, match_order: 169, deadline: '2026-05-12T04:49:30.010Z' })

  // --- SLOT 4: EL FINAL (Order 170, Deadline May 13) ---
  if (elFinal) updates.push({ id: elFinal.id, match_order: 170, deadline: '2026-05-13T04:49:30.010Z' })

  // --- SLOT 5: REST OF MUNDIAL (Order 171+, deadlines adjusted +48h from where they were if needed, but let's keep them as is for now) ---
  const restMundial = mundialMatches.filter(m => !m.round_name.includes('J1') && m.round_name !== 'Final')
  restMundial.forEach((m, i) => {
    updates.push({ id: m.id, match_order: 171 + i })
  })

  // Temporary shift
  console.log('Moving to temporary orders...')
  for (const up of updates) {
    await supabase.from('matches').update({ match_order: up.match_order + 8000 }).eq('id', up.id)
  }

  console.log('Applying final updates...')
  for (const up of updates) {
    const { id, ...rest } = up
    await supabase.from('matches').update(rest).eq('id', id)
  }

  console.log('--- MEGA SHIFT COMPLETED ---')
}

run()
