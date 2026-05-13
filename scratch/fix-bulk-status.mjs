import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const PLAYERS_TO_FIX = [
  'Stanislav Lobotka', 'Rafa Silva', 'Christian Pulisic', 'Gleison Bremer', 
  'Renan Lodi', 'Marquinhos', 'Erling Haaland', 'Noa Lang', 'Dan Ndoye', 
  'Ivan Provedel', 'Francisco Conceição', 'Josip Stanišić', 'Rasmus Højlund', 
  'Harry Kane', 'Bruno Fernandes', 'Virgil van Dijk', 'Luis Díaz', 'João Pedro', 
  'Jefferson Lerma', 'Granit Xhaka', 'Senny Mayulu', 'Marc Casadó', 'Denílson', 
  'Mikel Merino', 'Enzo Boyomo', 'Semih Kılıçsoy', 'Roméo Lavia', 'Davy Klaassen', 
  'Pedro Neto'
]

async function run() {
  console.log('--- FIXING STATUS AND MORALE FOR BULK LIST ---')

  for (const name of PLAYERS_TO_FIX) {
    const { data: players } = await supabase
      .from('players')
      .select('id, name, wants_to_leave, morale')
      .ilike('name', `%${name}%`)

    if (players && players.length > 0) {
      for (const p of players) {
        console.log(`Fixing ${p.name} (WantsLeave: ${p.wants_to_leave}, Morale: ${p.morale})`)
        await supabase
          .from('players')
          .update({
            wants_to_leave: false,
            morale: 100,
            contract_status: 'active'
          })
          .eq('id', p.id)
      }
    } else {
      console.log(`Player ${name} not found.`)
    }
  }

  console.log('--- STATUS FIX COMPLETED ---')
}

run()
