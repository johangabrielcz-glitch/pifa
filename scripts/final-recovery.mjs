import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('--- FINAL RECOVERY AND RE-SEQUENCING ---')

  // 1. Fetch all matches to have a clean slate
  const { data: allMatches } = await supabase
    .from('matches')
    .select('*, competition:competitions(name)')
    .order('match_order', { ascending: true })

  if (!allMatches) return

  const updates = []

  const isCL = (m) => m.competition.name.includes('Champions')
  const isEL = (m) => m.competition.name.includes('Europa')
  const isMundial = (m) => m.competition.name.includes('Mundial')
  const isLiga = (m) => m.competition.name.includes('Liga')

  // --- RESTORE CL GROUP STAGES (Orders 58-103 range) ---
  allMatches.filter(m => isCL(m) && m.round_name.includes('Grupo A - J1')).forEach(m => updates.push({ id: m.id, deadline: '2026-04-25T04:49:30.010Z', match_order: 58 }))
  allMatches.filter(m => isCL(m) && m.round_name.includes('Grupo B - J1')).forEach(m => updates.push({ id: m.id, deadline: '2026-04-25T04:49:30.010Z', match_order: 59 }))
  allMatches.filter(m => isCL(m) && m.round_name.includes('Grupo A - J2')).forEach(m => updates.push({ id: m.id, deadline: '2026-04-28T04:49:30.010Z', match_order: 76 }))
  allMatches.filter(m => isCL(m) && m.round_name.includes('Grupo B - J2')).forEach(m => updates.push({ id: m.id, deadline: '2026-04-28T04:49:30.010Z', match_order: 77 }))
  allMatches.filter(m => isCL(m) && m.round_name.includes('Grupo A - J3')).forEach(m => updates.push({ id: m.id, deadline: '2026-05-02T04:49:30.010Z', match_order: 102 }))
  allMatches.filter(m => isCL(m) && m.round_name.includes('Grupo B - J3')).forEach(m => updates.push({ id: m.id, deadline: '2026-05-02T04:49:30.010Z', match_order: 103 }))

  // --- SEMIS IDAS (CL & EL) -> May 06 ---
  const allIdas = allMatches.filter(m => (isCL(m) || isEL(m)) && m.round_name.includes('Semifinales - Ida'))
  allIdas.forEach((m, i) => updates.push({ id: m.id, deadline: '2026-05-06T04:49:30.010Z', match_order: 129 + i }))

  // --- LIGA MD 16 -> May 07 ---
  const md16 = allMatches.filter(m => isLiga(m) && m.round_name === 'Jornada 16')
  md16.forEach((m, i) => updates.push({ id: m.id, deadline: '2026-05-07T04:49:30.010Z', match_order: 133 + i }))

  // --- LIGA MD 17 -> May 08 ---
  const md17 = allMatches.filter(m => isLiga(m) && m.round_name === 'Jornada 17')
  md17.forEach((m, i) => updates.push({ id: m.id, deadline: '2026-05-08T04:49:30.010Z', match_order: 141 + i }))

  // --- SEMIS VUELTAS (CL & EL) -> May 09 ---
  const allVueltas = allMatches.filter(m => (isCL(m) || isEL(m)) && m.round_name.includes('Semifinales - Vuelta'))
  allVueltas.forEach((m, i) => updates.push({ id: m.id, deadline: '2026-05-09T04:49:30.010Z', match_order: 149 + i }))

  // --- LIGA MD 18 -> May 10 ---
  const md18 = allMatches.filter(m => isLiga(m) && m.round_name === 'Jornada 18')
  md18.forEach((m, i) => updates.push({ id: m.id, deadline: '2026-05-10T04:49:30.010Z', match_order: 153 + i }))

  // --- MUNDIAL J1, J2, J3 DAILY ---
  const mJ1 = allMatches.filter(m => isMundial(m) && m.round_name.includes('J1'))
  const mJ2 = allMatches.filter(m => isMundial(m) && m.round_name.includes('J2'))
  const mJ3 = allMatches.filter(m => isMundial(m) && m.round_name.includes('J3'))

  mJ1.forEach((m, i) => updates.push({ id: m.id, deadline: '2026-05-11T04:49:30.010Z', match_order: 201 + i }))
  mJ2.forEach((m, i) => updates.push({ id: m.id, deadline: '2026-05-12T04:49:30.010Z', match_order: 211 + i }))
  mJ3.forEach((m, i) => updates.push({ id: m.id, deadline: '2026-05-13T04:49:30.010Z', match_order: 221 + i }))

  // --- FINALS -> May 14, 15 ---
  const clFinal = allMatches.find(m => isCL(m) && m.round_name === 'Final')
  const elFinal = allMatches.find(m => isEL(m) && m.round_name === 'Final')
  if (clFinal) updates.push({ id: clFinal.id, deadline: '2026-05-14T04:49:30.010Z', match_order: 229 })
  if (elFinal) updates.push({ id: elFinal.id, deadline: '2026-05-15T04:49:30.010Z', match_order: 230 })

  // Apply with temporary offset
  console.log('Applying temporary offset...')
  for (const up of updates) {
    await supabase.from('matches').update({ match_order: (up.match_order || 0) + 20000 }).eq('id', up.id)
  }

  console.log('Applying final updates...')
  for (const up of updates) {
    const { id, ...rest } = up
    await supabase.from('matches').update(rest).eq('id', id)
  }

  console.log('--- RECOVERY COMPLETED ---')
}

run()
