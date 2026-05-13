import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('--- STARTING CLEANUP ---')

  // 1. Get all players
  const { data: players } = await supabase
    .from('players')
    .select('id, name, club_id')

  if (!players) return

  const seenNames = new Map()
  const toDelete = []

  for (const p of players) {
    const normalizedName = p.name.toLowerCase().trim()
    if (seenNames.has(normalizedName)) {
      toDelete.push(p.id)
      console.log(`Duplicate found: ${p.name} (ID: ${p.id})`)
    } else {
      seenNames.set(normalizedName, p.id)
    }
  }

  if (toDelete.length > 0) {
    console.log(`Deleting ${toDelete.length} duplicates...`)
    const { error } = await supabase
      .from('players')
      .delete()
      .in('id', toDelete)
    
    if (error) console.error('Delete error:', error)
    else console.log('Duplicates deleted.')
  } else {
    console.log('No duplicates found.')
  }

  // 2. Final check for the requested transfers
  const EXPECTED = [
    { name: 'Stanislav Lobotka', club: 'Al Sadd SC' },
    { name: 'Rafa Silva', club: 'citlalideidad' },
    { name: 'Christian Pulisic', club: 'DOCTRINA FC' },
    { name: 'Gleison Bremer', club: 'jeffer fc' },
    { name: 'Renan Lodi', club: 'Jamex FC' },
    { name: 'Marquinhos', club: 'Al Sadd SC' },
    { name: 'Erling Haaland', club: 'jeffer fc' },
    { name: 'Noa Lang', club: 'boca Juniors' },
    { name: 'Dan Ndoye', club: 'boca Juniors' },
    { name: 'Ivan Provedel', club: 'boca Juniors' },
    { name: 'Francisco Conceição', club: 'DOCTRINA FC' },
    { name: 'Josip Stanišić', club: 'citlalideidad' },
    { name: 'Rasmus Højlund', club: 'DOCTRINA FC' },
    { name: 'Harry Kane', club: 'DOCTRINA FC' },
    { name: 'Bruno Fernandes', club: 'DOCTRINA FC' },
    { name: 'Virgil van Dijk', club: 'DOCTRINA FC' },
    { name: 'Luis Díaz', club: 'DOCTRINA FC' },
    { name: 'João Pedro', club: 'DOCTRINA FC' },
    { name: 'Jefferson Lerma', club: 'DOCTRINA FC' },
    { name: 'Granit Xhaka', club: 'DOCTRINA FC' },
    { name: 'Senny Mayulu', club: 'Toluca fc' },
    { name: 'Marc Casadó', club: 'jeffer fc' },
    { name: 'Denílson', club: 'Liverpool c.f' },
    { name: 'Mikel Merino', club: 'DOCTRINA FC' },
    { name: 'Enzo Boyomo', club: 'DOCTRINA FC' },
    { name: 'Semih Kılıçsoy', club: 'DOCTRINA FC' },
    { name: 'Roméo Lavia', club: 'DOCTRINA FC' },
    { name: 'Davy Klaassen', club: 'Toluca fc' },
    { name: 'Pedro Neto', club: 'Racing Club haitiano' }
  ]

  console.log('--- VERIFYING POSITIONS AND CLUBS ---')
  for (const exp of EXPECTED) {
    const { data: p } = await supabase
      .from('players')
      .select('id, name, club:clubs(name)')
      .ilike('name', `%${exp.name}%`)
      .single()

    if (p) {
      if (p.club?.name !== exp.club) {
        console.log(`[WRONG CLUB] ${p.name} is in ${p.club?.name}, should be in ${exp.club}`)
        // Fix it
        const { data: c } = await supabase.from('clubs').select('id').eq('name', exp.club).single()
        if (c) await supabase.from('players').update({ club_id: c.id }).eq('id', p.id)
      } else {
        // console.log(`[OK] ${p.name} is in ${p.club.name}`)
      }
    } else {
      console.log(`[MISSING] ${exp.name} not found!`)
    }
  }

  console.log('--- CLEANUP AND VERIFICATION COMPLETED ---')
}

run()
