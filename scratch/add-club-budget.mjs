import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const BUDGET_UPDATES = [
  { search: 'citlali', amount: 1000000 },
  { search: 'kooi', amount: 900000 },
  { search: 'al sadd', amount: 300000 },
  { search: 'jamex', amount: 250000 },
  { search: 'toluca', amount: 300000 }
]

async function run() {
  console.log('--- UPDATING CLUB BUDGETS ---')

  for (const update of BUDGET_UPDATES) {
    // 1. Find club
    const { data: clubs } = await supabase
      .from('clubs')
      .select('id, name, budget')
      .ilike('name', `%${update.search}%`)

    if (!clubs || clubs.length === 0) {
      console.log(`Club matching "${update.search}" not found.`)
      continue
    }

    const club = clubs[0]
    const newBudget = (club.budget || 0) + update.amount

    console.log(`Updating ${club.name}: Current Budget: ${club.budget} -> New Budget: ${newBudget} (+${update.amount})`)

    const { error } = await supabase
      .from('clubs')
      .update({ budget: newBudget })
      .eq('id', club.id)

    if (error) console.error(`Error updating ${club.name}:`, error)
    else console.log(`Success for ${club.name}`)
  }

  console.log('--- BUDGET UPDATES COMPLETED ---')
}

run()
