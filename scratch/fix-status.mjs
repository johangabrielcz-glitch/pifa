import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  const playersToFix = ['Yamal', 'Inzaghi', 'Rivaldo', 'Guimaraes', 'Osimhen']
  
  console.log(`Setting contract_status to "active" for: ${playersToFix.join(', ')}`)

  for (const name of playersToFix) {
    const { data: players } = await supabase
      .from('players')
      .select('id, name')
      .ilike('name', `%${name}%`)

    if (players && players.length > 0) {
      for (const player of players) {
        console.log(`Fixing ${player.name} (${player.id})...`)
        const { error } = await supabase
          .from('players')
          .update({
            contract_status: 'active',
            wants_to_leave: false,
            morale: 100
          })
          .eq('id', player.id)

        if (error) console.error(`Error fixing ${player.name}:`, error)
        else console.log(`Success for ${player.name}`)
      }
    } else {
      console.log(`Player matching "${name}" not found`)
    }
  }
}

run()
