import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export const runtime = 'edge'

/**
 * Endpoint para manejar el chat individual con jugadores.
 * Optimizado para velocidad y fiabilidad reduciendo el contexto a la competencia actual.
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
      supabase.from('player_emails').select('*').eq('player_id', playerId).order('created_at', { ascending: false }).limit(5),
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

    // Limitar historial enviado a Groq (últimos 10 para ligereza)
    const recentMessages = messages.slice(-10)

    if (messages.length === 0) {
      return NextResponse.json({ text: null, history: storedHistory })
    }

    // 2. OBTENER RIVALES DE COMPETENCIA Y COMPAÑEROS
    const { data: activeComps } = await supabase
      .from('competitions')
      .select('*')
      .eq('season_id', season?.id)

    const compIds = (activeComps || []).map(c => c.id)
    
    const [standingsRes, statsRes, matchesRes, allPlayersRes] = await Promise.all([
      supabase.from('standings').select('*, club:clubs(name)').in('competition_id', compIds),
      supabase.from('player_competition_stats').select('*, player:players(name)').in('competition_id', compIds).order('goals', { ascending: false }).limit(20),
      supabase.from('matches').select('*, home_club:clubs(name), away_club:clubs(name)').in('competition_id', compIds).order('match_order', { ascending: true }),
      supabase.from('players').select('id, name, position, club_id') // Obtenemos todos para filtrar en memoria
    ])

    const standings = standingsRes.data || []
    const topStats = statsRes.data || []
    const allMatches = matchesRes.data || []
    const allPlayersInLeague = allPlayersRes.data || []

    // Filtrado Inteligente de Jugadores (Solo competencia actual + mi club)
    const activeClubIds = Array.from(new Set(standings.map(s => s.club_id)))
    if (!activeClubIds.includes(clubId)) activeClubIds.push(clubId)

    const relevantPlayers = allPlayersInLeague.filter(p => activeClubIds.includes(p.club_id))

    const teammates = relevantPlayers
      .filter(p => p.club_id === clubId && p.id !== playerId)
      .map(p => `${p.name} (${p.position})`)
      .join(', ')

    const rivalsByClub = allClubs
      .filter(c => activeClubIds.includes(c.id) && c.id !== clubId)
      .map(c => {
        const clubPlayers = relevantPlayers
          .filter(p => p.club_id === c.id)
          .map(p => `${p.name} (${p.position})`)
          .join(', ')
        return `- ${c.name}: ${clubPlayers || 'Cargando...'}`
      })
      .join('\n')

    // 3. DETERMINAR PERSONALIDAD
    const idHash = playerId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0)
    const personality = idHash % 2 === 0 ? 'Humilde' : 'Soberbio'

    // 4. ENSAMBLAR PROMPT
    const contextString = `
TU IDENTIDAD Y CONTRATO:
- Nombre: ${player.name}
- Club: ${club.name}
- Moral: ${player.morale}%
- Personalidad: ${personality}
- Contrato: ${player.contract_seasons_left} temporadas. Salario: $${player.salary.toLocaleString()}

TU VESTUARIO (COMPAÑEROS):
${teammates || 'No registrados.'}

TU MAPA DE LA COMPETENCIA (RIVALES DIRECTOS):
${rivalsByClub}

TU MEMORIA DE CORREOS AL DT:
${pastEmails.length > 0 ? pastEmails.map(e => `- [${new Date(e.created_at).toLocaleDateString()}] ${e.subject}`).join('\n') : 'Ninguno.'}

ESTADO DE LA TEMPORADA: ${season?.name || 'Actual'}
COMPETENCIAS:
${activeComps?.map(comp => {
  const s = standings.filter(st => st.competition_id === comp.id).sort((a,b) => b.points - a.points);
  const myS = s.find(st => st.club_id === clubId);
  const pos = s.indexOf(myS!) + 1;
  return `- ${comp.name}: Posición ${pos}/${s.length}.`;
}).join('\n')}

LÍDERES:
${topStats.slice(0, 5).map(s => `- ${s.player?.name}: ${s.goals} G`).join('\n')}
    `.trim()

    const systemPrompt = `
Eres el futbolista profesional ${player.name}. Estás en un chat privado con tu DT.

REGLAS CRÍTICAS:
1. Resiliencia: No eres manipulable. Defiende tu contrato. 
2. NO Negociar: Tienes prohibido decir "acordemos" o "negociemos". Deriva a las oficinas del club.
3. Brevedad: Respuestas cortas (máximo 2 párrafos). Lenguaje de fútbol.
4. Social: Conoces a tus compañeros y rivales listados.

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
        max_tokens: 500
      })
    })

    if (!aiResponse.ok) throw new Error('Groq failure')

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
    return NextResponse.json({ error: 'Fallo al conectar con el jugador' }, { status: 500 })
  }
}
