import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const PLAYERS_TO_CHECK = [
  'Sávio', 'Savinho', 'Samuele Ricci', 'Odilon Kossounou', 'Nordi Mukiele', 
  'Pervis Estupiñán', 'Anthony Elanga', 'Gabriel Martinelli',
  'Steven Gerrard', 'Marcus Rashford', 'Neymar Jr', 'Robert Lewandowski', 
  'Kenan Yıldız', 'Marcus Thuram', 'Franck Ribéry', 'Jarell Quansah', 
  'Presnel Kimpembe', 'Ollie Watkins', 'Willian Pacho', 'Mike Maignan',
  'Nick Pope', 'Ryan Flamingo', 'Zion Suzuki'
]

async function run() {
  console.log('--- CHECKING FOR DUPLICATES ---')

  const { data: allPlayers } = await supabase
    .from('players')
    .select('id, name')

  if (!allPlayers) return

  const seen = new Map()
  const toDelete = []

  for (const p of allPlayers) {
    const norm = p.name.toLowerCase().trim()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents

    // Only check if it's in our list
    const isTarget = PLAYERS_TO_CHECK.some(t => {
      const tNorm = t.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      return norm.includes(tNorm) || tNorm.includes(norm)
    })

    if (isTarget) {
      if (seen.has(norm)) {
        toDelete.push(p.id)
        console.log(`Duplicate found: ${p.name} (ID: ${p.id})`)
      } else {
        seen.set(norm, p.id)
      }
    }
  }

  if (toDelete.length > 0) {
    console.log(`Deleting ${toDelete.length} duplicates...`)
    const { error } = await supabase.from('players').delete().in('id', toDelete)
    if (error) console.error(error)
    else console.log('Cleanup successful.')
  } else {
    console.log('No duplicates found.')
  }
}

run()
