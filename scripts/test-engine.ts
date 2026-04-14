import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function test() {
  const { data: matches } = await supabase
    .from('matches')
    .select('id, status, notes')
    .order('played_at', { ascending: false })
    .limit(1)

  console.log('Most recent match:', matches)

  if (matches && matches.length > 0) {
    const matchId = matches[0].id

    const { data: annotations } = await supabase
      .from('match_annotations')
      .select('*')
      .eq('match_id', matchId)
    
    console.log('Annotations:', JSON.stringify(annotations, null, 2))
  }
}
test()
