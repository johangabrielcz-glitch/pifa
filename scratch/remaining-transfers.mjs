import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function movePlayer(playerName, clubName) {
  // Find club
  const { data: clubs } = await supabase
    .from('clubs')
    .select('id, name')
    .ilike('name', `%${clubName}%`)

  if (!clubs || clubs.length === 0) {
    console.log(`Club matching "${clubName}" not found. Skipping ${playerName}.`)
    return
  }
  const club = clubs[0]

  // Find player
  const { data: players } = await supabase
    .from('players')
    .select('id, name')
    .ilike('name', `%${playerName}%`)

  if (!players || players.length === 0) {
    console.log(`Player matching "${playerName}" not found.`)
    return
  }

  for (const player of players) {
    console.log(`Moving ${player.name} to ${club.name}...`)
    const { error } = await supabase
      .from('players')
      .update({
        club_id: club.id,
        contract_status: 'active',
        morale: 100,
        wants_to_leave: false
      })
      .eq('id', player.id)

    if (error) console.error(`Error moving ${player.name}:`, error)
    else console.log(`Success for ${player.name}`)
  }
}

async function run() {
  const transfers = [
    { p: 'Emiliano Martinez', c: 'Keithston' },
    { p: 'Donnaruma', c: 'citlali' }
  ]

  for (const t of transfers) {
    await movePlayer(t.p, t.c)
  }
}

run()
