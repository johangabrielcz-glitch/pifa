import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  const playersToMove = ['Yamal', 'Inzaghi', 'Rivaldo']
  const targetClubName = 'Jamex FC'

  console.log(`Moving ${playersToMove.join(', ')} to ${targetClubName}...`)

  // 1. Find club
  const { data: clubs } = await supabase
    .from('clubs')
    .select('id, name')
    .ilike('name', `%${targetClubName}%`)

  if (!clubs || clubs.length === 0) {
    console.error('Club not found')
    return
  }
  const clubId = clubs[0].id

  // 2. Process players
  for (const name of playersToMove) {
    const { data: players } = await supabase
      .from('players')
      .select('id, name')
      .ilike('name', `%${name}%`)

    if (players && players.length > 0) {
      for (const player of players) {
        console.log(`Updating ${player.name} (${player.id})...`)
        const { error } = await supabase
          .from('players')
          .update({
            club_id: clubId,
            wants_to_leave: false,
            morale: 100
          })
          .eq('id', player.id)

        if (error) console.error(`Error updating ${player.name}:`, error)
        else console.log(`Success for ${player.name}`)
      }
    } else {
      console.log(`Player matching "${name}" not found`)
    }
  }
}

run()
