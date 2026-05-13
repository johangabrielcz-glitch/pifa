import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const COMP_ID = 'fb1d10e2-02ff-45d4-ba53-97dc14046e24'

async function run() {
  console.log('--- REPAIRING MUNDIAL DE CLUBES CALENDAR ---')

  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('competition_id', COMP_ID)

  if (!matches) return

  // 1. Group matches by round_name for logical sorting
  const roundMap = {}
  matches.forEach(m => {
    if (!roundMap[m.round_name]) roundMap[m.round_name] = []
    roundMap[m.round_name].push(m)
  })

  // 2. Define the desired order of rounds
  const orderedRounds = [
    'Grupo A - J1', 'Grupo B - J1',
    'Grupo A - J2', 'Grupo B - J2',
    'Grupo A - J3', 'Grupo B - J3',
    'Grupo A - J4', 'Grupo B - J4',
    'Grupo A - J5', 'Grupo B - J5',
    'Grupo A - J6', 'Grupo B - J6',
    'Grupo A - J7', 'Grupo B - J7',
    'Grupo A - J8', 'Grupo B - J8',
    'Grupo A - J9', 'Grupo B - J9',
    'Cuartos de Final',
    'Semifinales',
    'Final'
  ]

  let currentOrder = 230
  const baseDate = new Date('2026-05-12T04:49:30.010Z')

  for (let i = 0; i < orderedRounds.length; i++) {
    const roundName = orderedRounds[i]
    const roundMatches = roundMap[roundName] || []
    
    // Calculate date for this round (Groups share date, knockouts follow)
    // Actually, J1 A and J1 B share date, J2 A and J2 B share date, etc.
    let daysToAdd = 0
    if (roundName.includes('Grupo')) {
      const match = roundName.match(/J(\d+)/)
      if (match) daysToAdd = parseInt(match[1]) - 1
    } else {
      // Knockouts follow after J9 (which is at index 17, daysToAdd 8)
      if (roundName === 'Cuartos de Final') daysToAdd = 9
      if (roundName === 'Semifinales') daysToAdd = 10
      if (roundName === 'Final') daysToAdd = 11
    }

    const roundDeadline = new Date(baseDate)
    roundDeadline.setDate(baseDate.getDate() + daysToAdd)
    const deadlineStr = roundDeadline.toISOString().replace('.000Z', '.010Z')

    console.log(`\nProcessing Round: ${roundName} -> Deadline: ${deadlineStr}`)

    for (const m of roundMatches) {
      const updateData = { match_order: currentOrder }
      
      // CAUTION: Don't change deadline for finished matches
      if (m.status !== 'finished') {
        updateData.deadline = deadlineStr
      } else {
        console.log(`  Skipping deadline update for FINISHED match ${m.id} (${m.round_name})`)
      }

      console.log(`  Update match ${m.id}: Order ${currentOrder}${updateData.deadline ? ' | Deadline ' + updateData.deadline : ''}`)
      
      const { error } = await supabase
        .from('matches')
        .update(updateData)
        .eq('id', m.id)

      if (error) console.error(`  Error updating match ${m.id}:`, error)
      currentOrder++
    }
  }

  console.log('\n--- MUNDIAL DE CLUBES CALENDAR REPAIRED ---')
}

run()
