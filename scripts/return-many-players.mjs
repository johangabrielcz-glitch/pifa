import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('--- RETURNING MULTIPLE PLAYERS TO CLUBS ---')

  const updates = [
    {
      name: 'Noah Okafor',
      id: '3702639f-6e12-47de-a448-e91a98b0be26',
      club_id: '466082e7-cc9b-4388-8fee-4b9b25c8650e', // Jeffer FC
    },
    {
      name: 'Lamine yamal',
      id: 'a3dfb7f4-17bb-4015-8124-83c371f19858',
      club_id: 'f6696a43-8b3e-4fbf-9332-3ed078502c4f', // Jamex FC
    },
    {
      name: 'William Saliba',
      id: 'f04632f7-aa20-47b1-a028-c68705bb9015',
      club_id: 'c438530d-d6a0-4c77-903d-7962575781b8', // Joxan FC
    },
    {
      name: 'Alexis Mac Allister',
      id: '1e48e910-bf23-4abc-b215-87d00d37f5d7',
      club_id: 'c438530d-d6a0-4c77-903d-7962575781b8', // Joxan FC
    }
  ]

  for (const up of updates) {
    console.log(`Processing ${up.name}...`)
    const { id, name, ...rest } = up
    const { error } = await supabase.from('players').update({
      ...rest,
      contract_status: 'active',
      wants_to_leave: false,
      contract_seasons_left: 5
    }).eq('id', id)
    
    if (error) {
      console.error(`Error processing ${name}:`, error)
    } else {
      console.log(`${name} successfully updated.`)
    }
  }

  console.log('--- ALL UPDATES COMPLETED ---')
}

run()
