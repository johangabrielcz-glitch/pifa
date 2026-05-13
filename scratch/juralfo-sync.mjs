import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const PLAYER_DATA = [
  { search: 'Gerrard', name: 'Steven Gerrard', pos: 'CM', num: 8, club: 'Juralfo' },
  { search: 'Rasford', name: 'Marcus Rashford', pos: 'LW', num: 10, club: 'Juralfo' },
  { search: 'Ney', name: 'Neymar Jr', pos: 'LW', num: 11, club: 'Juralfo' },
  { search: 'Lewandowski', name: 'Robert Lewandowski', pos: 'ST', num: 9, club: 'Juralfo' },
  { search: 'Yildiz', name: 'Kenan Yıldız', pos: 'LW', num: 15, club: 'Juralfo' },
  { search: 'Marcus thuram', name: 'Marcus Thuram', pos: 'ST', num: 19, club: 'Juralfo' },
  { search: 'Ribery', name: 'Franck Ribéry', pos: 'LW', num: 7, club: 'Juralfo' },
  { search: 'Quansah', name: 'Jarell Quansah', pos: 'CB', num: 78, club: 'Juralfo' },
  { search: 'Kimpembe', name: 'Presnel Kimpembe', pos: 'CB', num: 3, club: 'Juralfo' },
  { search: 'Ollie watkins', name: 'Ollie Watkins', pos: 'ST', num: 11, club: 'Juralfo' },
  { search: 'Willian pacho', name: 'Willian Pacho', pos: 'CB', num: 51, club: 'Juralfo' },
  { search: 'Mike maignan', name: 'Mike Maignan', pos: 'GK', num: 16, club: 'Juralfo' }
]

async function run() {
  console.log('--- SYNCING PLAYERS FOR JURALFO FC ---')

  for (const p of PLAYER_DATA) {
    // 1. Find club
    const { data: clubs } = await supabase
      .from('clubs')
      .select('id, name')
      .ilike('name', `%${p.club}%`)

    if (!clubs || clubs.length === 0) {
      console.log(`Club not found for ${p.club}.`)
      continue
    }
    const clubId = clubs[0].id

    // 2. Search for player
    const { data: players } = await supabase
      .from('players')
      .select('*')
      .ilike('name', `%${p.search}%`)

    const commonData = {
      name: p.name,
      position: p.pos,
      number: p.num,
      club_id: clubId,
      salary: 25000,
      contract_seasons_left: 3,
      squad_role: 'rotation',
      morale: 100,
      release_clause: 700000,
      is_one_club_man: false,
      contract_status: 'active',
      wants_to_leave: false
    }

    if (players && players.length > 0) {
      console.log(`EXISTS: Updating ${players[0].name} -> ${p.name} (Club: ${clubs[0].name})`)
      await supabase.from('players').update(commonData).eq('id', players[0].id)
    } else {
      console.log(`NEW: Creating ${p.name} (Club: ${clubs[0].name})`)
      await supabase.from('players').insert(commonData)
    }
  }

  console.log('--- JURALFO SYNC COMPLETED ---')
}

run()
