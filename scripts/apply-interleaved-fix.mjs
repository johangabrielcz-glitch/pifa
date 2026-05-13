import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('--- APPLYING NEW INTERLEAVED SEQUENCE ---')

  // Fetch all matches in the range to avoid confusion
  const { data: allMatches } = await supabase
    .from('matches')
    .select('id, match_order, round_name, competition_id')
    .gte('match_order', 119)
    .lte('match_order', 200)
    .order('match_order', { ascending: true })

  if (!allMatches) return

  // Helper to find matches by their current order after my previous fix
  const findByOrder = (ord) => allMatches.find(m => m.match_order === ord)

  const updates = []

  // --- 1. IDAS (CL & EL) -> May 06, Orders 129-132 ---
  // Previous script set them to 129, 131, 133, 134.
  const idas = allMatches.filter(m => m.round_name && m.round_name.includes('Semifinales - Ida'))
  idas.forEach((m, i) => {
    updates.push({ id: m.id, match_order: 129 + i, deadline: '2026-05-06T04:49:30.010Z' })
  })

  // --- 2. JORNADA 16 -> May 07, Orders 133-140 ---
  const md16 = allMatches.filter(m => m.round_name === 'Jornada 16')
  md16.forEach((m, i) => {
    updates.push({ id: m.id, match_order: 133 + i, deadline: '2026-05-07T04:49:30.010Z' })
  })

  // --- 3. JORNADA 17 -> May 08, Orders 141-148 ---
  const md17 = allMatches.filter(m => m.round_name === 'Jornada 17')
  md17.forEach((m, i) => {
    updates.push({ id: m.id, match_order: 141 + i, deadline: '2026-05-08T04:49:30.010Z' })
  })

  // --- 4. VUELTAS (CL & EL) -> May 09, Orders 149-152 ---
  const vueltas = allMatches.filter(m => m.round_name && m.round_name.includes('Semifinales - Vuelta'))
  vueltas.forEach((m, i) => {
    updates.push({ id: m.id, match_order: 149 + i, deadline: '2026-05-09T04:49:30.010Z' })
  })

  // --- 5. JORNADA 18 -> May 10, Orders 153+ ---
  const md18 = allMatches.filter(m => m.round_name === 'Jornada 18')
  md18.forEach((m, i) => {
    updates.push({ id: m.id, match_order: 153 + i, deadline: '2026-05-10T04:49:30.010Z' })
  })

  // Move to temporary orders to avoid collisions
  console.log('Moving to temporary orders...')
  for (const up of updates) {
    await supabase.from('matches').update({ match_order: up.match_order + 6000 }).eq('id', up.id)
  }

  console.log('Applying final updates...')
  for (const up of updates) {
    const { id, ...rest } = up
    await supabase.from('matches').update(rest).eq('id', id)
  }

  console.log('--- INTERLEAVED SEQUENCE COMPLETED ---')
}

run()
