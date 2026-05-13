import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('--- STARTING SURGICAL FIX ---')

  // 1. Identify Matches by their current unique combination of attributes if possible, or just by current Order
  // From previous inspect:
  // CL: 129(Ida), 130(Ida -> should be Vuelta), 139(Vuelta -> should be Ida), 140(Vuelta)
  // EL: 119(Ida), 120(Ida), 141(Vuelta), 142(Vuelta)
  // Liga MD 16: 131-138
  // Liga MD 17: 143-150

  const { data: allMatches } = await supabase
    .from('matches')
    .select('id, match_order, round_name, competition_id')
    .gte('match_order', 119)
    .lte('match_order', 160)
    .order('match_order', { ascending: true })

  if (!allMatches) return

  const findByOrder = (ord) => allMatches.find(m => m.match_order === ord)

  const updates = []

  // --- CHAMPIONS LEAGUE FIXES ---
  const clIda1 = findByOrder(129)
  const clVuelta1 = findByOrder(130)
  const clIda2 = findByOrder(139)
  const clVuelta2 = findByOrder(140)

  if (clIda1) updates.push({ id: clIda1.id, round_name: 'Semifinales - Ida', leg: 1, match_order: 129, deadline: '2026-05-06T04:49:30.010Z' })
  if (clVuelta1) updates.push({ id: clVuelta1.id, round_name: 'Semifinales - Vuelta', leg: 2, match_order: 130, deadline: '2026-05-08T04:49:30.010Z' })
  if (clIda2) updates.push({ id: clIda2.id, round_name: 'Semifinales - Ida', leg: 1, match_order: 131, deadline: '2026-05-06T04:49:30.010Z' })
  if (clVuelta2) updates.push({ id: clVuelta2.id, round_name: 'Semifinales - Vuelta', leg: 2, match_order: 132, deadline: '2026-05-08T04:49:30.010Z' })

  // --- EUROPA LEAGUE FIXES ---
  const elIda1 = findByOrder(119)
  const elIda2 = findByOrder(120)
  const elVuelta1 = findByOrder(141)
  const elVuelta2 = findByOrder(142)

  if (elIda1) updates.push({ id: elIda1.id, round_name: 'Semifinales - Ida', leg: 1, match_order: 133, deadline: '2026-05-06T04:49:30.010Z' })
  if (elIda2) updates.push({ id: elIda2.id, round_name: 'Semifinales - Ida', leg: 1, match_order: 134, deadline: '2026-05-06T04:49:30.010Z' })
  if (elVuelta1) updates.push({ id: elVuelta1.id, round_name: 'Semifinales - Vuelta', leg: 2, match_order: 135, deadline: '2026-05-08T04:49:30.010Z' })
  if (elVuelta2) updates.push({ id: elVuelta2.id, round_name: 'Semifinales - Vuelta', leg: 2, match_order: 136, deadline: '2026-05-08T04:49:30.010Z' })

  // --- LIGA MD 16 SHIFT (131-138 -> 143-150) ---
  for (let i = 131; i <= 138; i++) {
    const m = findByOrder(i)
    if (m) updates.push({ id: m.id, match_order: i + 12 }) // Shift by 12 to 143-150
  }

  // --- LIGA MD 17 SHIFT (143-150 -> 151-158) ---
  for (let i = 143; i <= 150; i++) {
    const m = findByOrder(i)
    if (m) updates.push({ id: m.id, match_order: i + 8 }) // Shift by 8 to 151-158
  }

  // To avoid unique constraint violations on match_order (if any), move all to temporary orders first
  console.log('Moving to temporary orders...')
  for (const up of updates) {
    await supabase.from('matches').update({ match_order: up.match_order + 5000 }).eq('id', up.id)
  }

  console.log('Applying final updates...')
  for (const up of updates) {
    const { id, ...rest } = up
    await supabase.from('matches').update(rest).eq('id', id)
  }

  console.log('--- FIX COMPLETED ---')
}

run()
