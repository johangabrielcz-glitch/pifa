import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const PLAYER_DATA = [
  { search: 'Savinho', name: 'Sávio', pos: 'RW', num: 80, club: 'Racing' },
  { search: 'Samuele Ricci', name: 'Samuele Ricci', pos: 'CDM', num: 28, club: 'Racing' },
  { search: 'Kossounou', name: 'Odilon Kossounou', pos: 'CB', num: 6, club: 'Racing' },
  { search: 'Mukiele', name: 'Nordi Mukiele', pos: 'RB', num: 26, club: 'Racing' },
  { search: 'Estupiñan', name: 'Pervis Estupiñán', pos: 'LB', num: 15, club: 'Racing' },
  { search: 'Elanga', name: 'Anthony Elanga', pos: 'LW', num: 21, club: 'Racing' },
  { search: 'Martinelli', name: 'Gabriel Martinelli', pos: 'LW', num: 11, club: 'Racing' }
]

async function run() {
  console.log('--- SYNCING PLAYERS FOR RACING CLUB ---')

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

  console.log('--- RACING SYNC COMPLETED ---')
}

run()
