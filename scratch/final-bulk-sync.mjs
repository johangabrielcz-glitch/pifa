import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const PLAYER_DATA = [
  { search: 'Lobotka', name: 'Stanislav Lobotka', pos: 'CDM', num: 68, club: 'Al Sadd SC' },
  { search: 'Rafa Silva', name: 'Rafa Silva', pos: 'CAM', num: 27, club: 'citlali' },
  { search: 'Pulisic', name: 'Christian Pulisic', pos: 'RW', num: 11, club: 'DOCTRINA' },
  { search: 'Polisic', name: 'Christian Pulisic', pos: 'RW', num: 11, club: 'DOCTRINA' },
  { search: 'Bremer', name: 'Gleison Bremer', pos: 'CB', num: 3, club: 'jeffer' },
  { search: 'Renan Lodi', name: 'Renan Lodi', pos: 'LB', num: 12, club: 'Jamex' },
  { search: 'Marquinhos', name: 'Marquinhos', pos: 'CB', num: 5, club: 'Al Sadd SC' },
  { search: 'Haaland', name: 'Erling Haaland', pos: 'ST', num: 9, club: 'jeffer' },
  { search: 'Noa Lang', name: 'Noa Lang', pos: 'LW', num: 10, club: 'boca' },
  { search: 'Dan Ndoye', name: 'Dan Ndoye', pos: 'RW', num: 19, club: 'boca' },
  { search: 'Ivan Provedel', name: 'Ivan Provedel', pos: 'GK', num: 94, club: 'boca' },
  { search: 'Conceicao', name: 'Francisco Conceição', pos: 'RW', num: 7, club: 'DOCTRINA' },
  { search: 'Stanisic', name: 'Josip Stanišić', pos: 'RB', num: 2, club: 'citlali' },
  { search: 'Hojlund', name: 'Rasmus Højlund', pos: 'ST', num: 11, club: 'DOCTRINA' },
  { search: 'Kane', name: 'Harry Kane', pos: 'ST', num: 9, club: 'DOCTRINA' },
  { search: 'Bruno Fernandez', name: 'Bruno Fernandes', pos: 'CAM', num: 8, club: 'DOCTRINA' },
  { search: 'Van Dijk', name: 'Virgil van Dijk', pos: 'CB', num: 4, club: 'DOCTRINA' },
  { search: 'Luis Diaz', name: 'Luis Díaz', pos: 'LW', num: 7, club: 'DOCTRINA' },
  { search: 'Joao Pedro', name: 'João Pedro', pos: 'ST', num: 10, club: 'DOCTRINA' },
  { search: 'Lerma', name: 'Jefferson Lerma', pos: 'CDM', num: 16, club: 'DOCTRINA' },
  { search: 'Xhaka', name: 'Granit Xhaka', pos: 'CDM', num: 34, club: 'DOCTRINA' },
  { search: 'Senny Mayulu', name: 'Senny Mayulu', pos: 'CAM', num: 41, club: 'Toluca' },
  { search: 'Marc Casado', name: 'Marc Casadó', pos: 'CDM', num: 17, club: 'jeffer' },
  { search: 'Denilson', name: 'Denílson', pos: 'CDM', num: 15, club: 'Liverpool' },
  { search: 'Merino', name: 'Mikel Merino', pos: 'CM', num: 23, club: 'DOCTRINA' },
  { search: 'Enzo Boyomo', name: 'Enzo Boyomo', pos: 'CB', num: 44, club: 'DOCTRINA' },
  { search: 'Semih Kilicsoy', name: 'Semih Kılıçsoy', pos: 'ST', num: 99, club: 'DOCTRINA' },
  { search: 'Romeo Lavia', name: 'Roméo Lavia', pos: 'CDM', num: 45, club: 'DOCTRINA' },
  { search: 'Davy Klaassen', name: 'Davy Klaassen', pos: 'CM', num: 20, club: 'Toluca' },
  { search: 'Pedro Neto', name: 'Pedro Neto', pos: 'RW', num: 77, club: 'Racing' }
]

async function run() {
  console.log('--- STARTING BULK SYNC ---')

  for (const p of PLAYER_DATA) {
    // 1. Find club
    const { data: clubs } = await supabase
      .from('clubs')
      .select('id, name')
      .ilike('name', `%${p.club}%`)

    if (!clubs || clubs.length === 0) {
      console.log(`Club not found for ${p.club}. Skipping ${p.name}`)
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
      console.log(`Updating existing player: ${players[0].name} -> ${p.name} (Club: ${clubs[0].name})`)
      await supabase.from('players').update(commonData).eq('id', players[0].id)
    } else {
      console.log(`Creating new player: ${p.name} (Club: ${clubs[0].name})`)
      await supabase.from('players').insert(commonData)
    }
  }

  console.log('--- BULK SYNC COMPLETED ---')
}

run()
