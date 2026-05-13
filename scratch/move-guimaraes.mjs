import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('Searching for Guimaraes and Azules FC...')

  // 1. Find player
  const { data: players, error: pError } = await supabase
    .from('players')
    .select('id, name, club_id')
    .ilike('name', '%Guimaraes%')

  if (pError) console.error('Player error:', pError)
  console.log('Players found:', players)

  // 2. Find club
  const { data: clubs, error: cError } = await supabase
    .from('clubs')
    .select('id, name')
    .ilike('name', '%Azules%')

  if (cError) console.error('Club error:', cError)
  console.log('Clubs found:', clubs)

  if (players && players.length > 0 && clubs && clubs.length > 0) {
    const playerId = players[0].id
    const clubId = clubs[0].id

    console.log(`Moving player ${players[0].name} (${playerId}) to club ${clubs[0].name} (${clubId})...`)

    const { error: uError } = await supabase
      .from('players')
      .update({ 
        club_id: clubId,
        wants_to_leave: false
      })
      .eq('id', playerId)

    if (uError) {
      console.error('Update error:', uError)
    } else {
      console.log('Success! Player moved.')
    }
  } else {
    console.log('Could not find both player and club.')
  }
}

run()
