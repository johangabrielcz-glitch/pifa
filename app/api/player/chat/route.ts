import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export const runtime = 'edge'

/**
 * Endpoint para manejar el chat individual con jugadores.
 * Versión de ALTA EFICIENCIA (Low Token Overhead) para evitar límites diarios.
 */
export async function POST(req: Request) {
  try {
    const { playerId, clubId, messages } = await req.json()

    if (!playerId || !clubId) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    // 1. OBTENER CONTEXTO BÁSICO
    const [
      playerRes,
      clubRes,
      activeSeasonRes,
      allClubsRes,
      trophiesRes,
      emailsRes,
      chatHistoryRes
    ] = await Promise.all([
      supabase.from('players').select('*').eq('id', playerId).single(),
      supabase.from('clubs').select('*').eq('id', clubId).single(),
      supabase.from('seasons').select('*').eq('status', 'active').single(),
      supabase.from('clubs').select('id, name'),
      supabase.from('club_trophies').select('*, trophies(*)'),
      supabase.from('player_emails').select('*').eq('player_id', playerId).order('created_at', { ascending: false }).limit(3),
      supabase.from('player_chats').select('messages').eq('player_id', playerId).eq('club_id', clubId).single()
    ])

    const player = playerRes.data
    const club = clubRes.data
    const season = activeSeasonRes.data
    const allClubs = allClubsRes.data || []
    const allTrophies = trophiesRes.data || []
    const pastEmails = emailsRes.data || []
    const storedHistory = chatHistoryRes.data?.messages || []

    if (!player || !club) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    // Limitar historial a los últimos 7 mensajes (Equilibrio entre memoria y eficiencia)
    const recentMessages = messages.slice(-7)

    if (messages.length === 0) {
      return NextResponse.json({ text: null, history: storedHistory })
    }

    // 2. OBTENER DATOS DE COMPETICIÓN
    const { data: activeComps } = await supabase
      .from('competitions')
      .select('*')
      .eq('season_id', season?.id)

    const compIds = (activeComps || []).map(c => c.id)
    
    const [standingsRes, statsRes, matchesRes, allPlayersRes] = await Promise.all([
      supabase.from('standings').select('*, club:clubs(name)').in('competition_id', compIds),
      supabase.from('player_competition_stats').select('*, player:players(name)').in('competition_id', compIds).order('goals', { ascending: false }).limit(5),
      supabase.from('matches').select('*, home_club:clubs(name), away_club:clubs(name)').in('competition_id', compIds).order('match_order', { ascending: true }),
      supabase.from('players').select('id, name, position, club_id')
    ])

    const standings = standingsRes.data || []
    const topStats = statsRes.data || []
    const allMatches = matchesRes.data || []
    const allPlayersInLeague = allPlayersRes.data || []

    const activeClubIds = Array.from(new Set(standings.map(s => s.club_id)))

    // ENCICLOPEDIA EFICIENTE: Máximo 5 jugadores por club rival
    const teammates = allPlayersInLeague
      .filter(p => p.club_id === clubId && p.id !== playerId)
      .map(p => `${p.name} (${p.position})`)
      .join(', ')

    const rivalsByClub = allClubs
      .filter(c => activeClubIds.includes(c.id) && c.id !== clubId)
      .map(c => {
        const clubPlayers = allPlayersInLeague
          .filter(p => p.club_id === c.id)
          .slice(0, 5) // LIMITAMOS A 5 JUGADORES TOP/TITULARES
          .map(p => `${p.name} (${p.position})`)
          .join(', ')
        return `- ${c.name}: ${clubPlayers}...`
      })
      .join('\n')

    // 3. PERSONALIDAD
    const idHash = playerId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0)
    const personality = idHash % 2 === 0 ? 'Humilde' : 'Soberbio'

    // 4. ENSAMBLAR PROMPT COMPACTO
    const contextString = `
IDENTIDAD: ${player.name} (${player.position}) | Club: ${club.name} | Moral: ${player.morale}% | Personalidad: ${personality}
CONTRATO: ${player.contract_seasons_left} temp. Salario: $${player.salary.toLocaleString()}

TU EQUIPO: ${teammates || 'Cargando...'}

MAPA LIGA (RIVALES TOP):
${rivalsByClub}

ÚLTIMOS RESULTADOS:
${allMatches.filter(m => m.home_club_id === clubId || m.away_club_id === clubId).slice(-2).map(m => 
  `- ${m.home_club?.name} ${m.home_score}-${m.away_score} ${m.away_club?.name}`
).join('\n')}

TEMPORADA: ${season?.name || 'Actual'}
COMPETICIONES:
${activeComps?.map(comp => {
  const s = standings.filter(st => st.competition_id === comp.id).sort((a,b) => b.points - a.points);
  const pos = s.indexOf(s.find(st => st.club_id === clubId)!) + 1;
  return `- ${comp.name}: Pos ${pos}/${s.length}`;
}).join('\n')}
    `.trim()

    const systemPrompt = `
Eres el futbolista profesional ${player.name}. 
REGLAS:
1. NO manipulable. Defiende tu contrato. 
2. PROHIBIDO negociar o decir "acuerdos". Deriva a oficinas.
3. Brevedad absoluta: Máximo 1-2 párrafos.
4. Conoces a los compañeros y rivales top listados.

CONTEXTO:
${contextString}
    `.trim()

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Config IA' }, { status: 500 })

    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          ...recentMessages
        ],
        temperature: 0.8,
        max_tokens: 400
      })
    })

    if (!aiResponse.ok) {
      const errorData = await aiResponse.json().catch(() => ({}));
      console.error('Groq API Error Detail:', errorData);
      return NextResponse.json({ error: `Groq Error: ${aiResponse.status}`, detail: errorData }, { status: aiResponse.status });
    }

    const result = await aiResponse.json()
    const text = result.choices?.[0]?.message?.content

    if (text) {
      const finalHistory = [...messages, { role: 'assistant', content: text }]
      await supabase.from('player_chats').upsert({
        player_id: playerId, club_id: clubId, messages: finalHistory, updated_at: new Date().toISOString()
      }, { onConflict: 'player_id,club_id' })
    }

    return NextResponse.json({ text, personality })

  } catch (err: any) {
    console.error('Chat API Error:', err)
    return NextResponse.json({ error: 'Saturación en el vestuario' }, { status: 500 })
  }
}
