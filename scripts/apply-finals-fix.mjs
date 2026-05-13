import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('--- RECONFIGURING FINALS AND MUNDIAL ---')

  // 1. Get all involved matches
  const { data: allMatches } = await supabase
    .from('matches')
    .select('id, round_name, match_order, deadline')
    .or('round_name.eq.Final,round_name.eq.Jornada 18,round_name.ilike.%J1%')

  if (!allMatches) return

  const updates = []

  // --- MD 18 (Liga) -> May 10, Orders 153-160 ---
  const md18 = allMatches.filter(m => m.round_name === 'Jornada 18')
  md18.sort((a,b) => a.match_order - b.match_order).forEach((m, i) => {
    updates.push({ id: m.id, match_order: 153 + i, deadline: '2026-05-10T04:49:30.010Z' })
  })

  // --- MUNDIAL MD 1 -> May 11, Orders 161-168 ---
  // Filtering for Mundial J1 (excluding CL/EL)
  const mundialJ1 = allMatches.filter(m => (m.round_name.includes('Grupo') && m.round_name.includes('J1')))
  mundialJ1.sort((a,b) => a.match_order - b.match_order).forEach((m, i) => {
    updates.push({ id: m.id, match_order: 161 + i, deadline: '2026-05-11T04:49:30.010Z' })
  })

  // --- FINALS (CL & EL) -> May 12 & 13, Orders 169-170 ---
  // Note: Only CL and EL Finals. Mundial Final is usually later (Order 239).
  const clFinal = allMatches.find(m => m.round_name === 'Final' && m.match_order < 200) // Rough filter for CL/EL
  // Actually let's be precise. I'll fetch them specifically.
  const { data: clElFinals } = await supabase
    .from('matches')
    .select('*, competition:competitions(name)')
    .eq('round_name', 'Final')
    .or('competition.name.ilike.%Champions%,competition.name.ilike.%Europa%')

  if (clElFinals) {
    const cl = clElFinals.find(f => f.competition.name.includes('Champions'))
    const el = clElFinals.find(f => f.competition.name.includes('Europa'))
    if (cl) updates.push({ id: cl.id, match_order: 169, deadline: '2026-05-12T04:49:30.010Z' })
    if (el) updates.push({ id: el.id, match_order: 170, deadline: '2026-05-13T04:49:30.010Z' })
  }

  // --- SHIFTING OTHER MUNDIAL MATCHES? ---
  // If Mundial J2 starts at 170, I should move it to 171+.
  // Let's just focus on these for now.

  console.log('Moving to temporary orders...')
  for (const up of updates) {
    await supabase.from('matches').update({ match_order: up.match_order + 7000 }).eq('id', up.id)
  }

  console.log('Applying final updates...')
  for (const up of updates) {
    const { id, ...rest } = up
    await supabase.from('matches').update(rest).eq('id', id)
  }

  console.log('--- FINAL RECONFIGURATION COMPLETED ---')
}

run()
