import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('Searching for Osimhen and Deportivo Tachira...')

  // 1. Find player
  const { data: players } = await supabase
    .from('players')
    .select('id, name')
    .ilike('name', '%Osimhe%')

  // 2. Find club
  const { data: clubs } = await supabase
    .from('clubs')
    .select('id, name')
    .ilike('name', '%Táchira%')

  if (players?.length > 0 && clubs?.length > 0) {
    const player = players[0]
    const club = clubs[0]

    console.log(`Moving ${player.name} to ${club.name}...`)

    const { error } = await supabase
      .from('players')
      .update({ 
        club_id: club.id,
        wants_to_leave: false
      })
      .eq('id', player.id)

    if (error) console.error('Error:', error)
    else console.log('Success!')
  } else {
    console.log('Not found:', { players, clubs })
  }
}

run()
