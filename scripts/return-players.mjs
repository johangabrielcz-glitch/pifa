import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('--- RETURNING PLAYERS TO CLUBS ---')

  const updates = [
    {
      name: 'Stefano Fiore',
      id: '80523b75-276b-4818-afaf-aabc73152e7b',
      club_id: 'f6696a43-8b3e-4fbf-9332-3ed078502c4f', // Jamex FC
      contract_status: 'active',
      wants_to_leave: false,
      contract_seasons_left: 3
    },
    {
      name: 'Lamine yamal',
      id: 'a3dfb7f4-17bb-4015-8124-83c371f19858',
      club_id: 'bc97c474-e30b-453f-bb42-11e19922e377', // DOCTRINA FC
      contract_status: 'active',
      wants_to_leave: false,
      contract_seasons_left: 3
    }
  ]

  for (const up of updates) {
    const { id, name, ...data } = up
    console.log(`Updating ${name}...`)
    const { error } = await supabase.from('players').update(data).eq('id', id)
    if (error) {
      console.error(`Error updating ${name}:`, error)
    } else {
      console.log(`${name} successfully returned to their club.`)
    }
  }

  console.log('--- PROCESS COMPLETED ---')
}

run()
