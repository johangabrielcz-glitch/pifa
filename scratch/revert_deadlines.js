
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function getEnv() {
  const envLocalPath = path.join(process.cwd(), '.env.local');
  const envPath = path.join(process.cwd(), '.env');
  let content = '';
  if (fs.existsSync(envLocalPath)) content = fs.readFileSync(envLocalPath, 'utf8');
  else if (fs.existsSync(envPath)) content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) env[key.trim()] = value.join('=').trim().replace(/^["']|["']$/g, '');
  });
  return env;
}

const env = getEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function revertDeadlines() {
  const { data: comp } = await supabase
    .from('competitions')
    .select('id, name, season_id')
    .ilike('name', '%Liga Alpha%')
    .single();
  if (!comp) { console.error('No se encontró Liga Alpha'); return; }

  console.log(`📋 Competencia: ${comp.name}`);

  // Valores ORIGINALES (antes del cambio de hoy)
  const originals = {
    'Jornada 10': '2026-04-29T04:49:30.01+00:00',
    'Jornada 11': '2026-04-30T04:49:30.01+00:00',
    'Jornada 12': '2026-05-01T04:49:30.01+00:00',
  };

  let total = 0;
  for (const [round, deadline] of Object.entries(originals)) {
    const { data: matches, error: fetchErr } = await supabase
      .from('matches')
      .select('id')
      .eq('competition_id', comp.id)
      .eq('round_name', round);

    if (fetchErr || !matches) { console.error(`Error fetching ${round}`); continue; }

    const { error } = await supabase
      .from('matches')
      .update({ deadline })
      .eq('competition_id', comp.id)
      .eq('round_name', round);

    if (error) {
      console.error(`❌ Error en ${round}: ${error.message}`);
    } else {
      console.log(`✅ ${round} → ${deadline} (${matches.length} partidos)`);
      total += matches.length;
    }
  }

  console.log(`\n✅ Revertidos ${total} partidos a sus valores originales.`);
}

revertDeadlines();
