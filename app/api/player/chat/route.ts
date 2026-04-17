import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export const runtime = 'edge'

/**
 * Endpoint para manejar el chat individual con jugadores.
 * Proporciona un contexto masivo a la IA para una inmersión total.
 */
export async function POST(req: Request) {
  try {
    const { playerId, clubId, messages } = await req.json()

    if (!playerId || !clubId) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    // 1. OBTENER CONTEXTO MASIVO Y CHAT ANTERIOR
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

    // Si el usuario envía mensajes vacíos, solo quiere cargar el historial
    if (messages.length === 0) {
      return NextResponse.json({ text: null, history: storedHistory })
    }

    // 2. OBTENER COMPETENCIAS Y TABLAS
    const { data: activeComps } = await supabase
      .from('competitions')
      .select('*')
      .eq('season_id', season?.id)

    const compIds = (activeComps || []).map(c => c.id)
    
    const [standingsRes, statsRes, matchesRes] = await Promise.all([
      supabase.from('standings').select('*, club:clubs(name)').in('competition_id', compIds),
      supabase.from('player_competition_stats').select('*, player:players(name)').in('competition_id', compIds).order('goals', { ascending: false }).limit(20),
      supabase.from('matches').select('*, home_club:clubs(name), away_club:clubs(name)').in('competition_id', compIds).order('match_order', { ascending: true })
    ])

    const standings = standingsRes.data || []
    const topStats = statsRes.data || []
    const allMatches = matchesRes.data || []

    // 3. DETERMINAR PERSONALIDAD (Determinista por ID)
    const idHash = playerId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0)
    const personality = idHash % 2 === 0 ? 'Humilde' : 'Soberbio'

    // 4. ENSAMBLAR PROMPT DE CONTEXTO
    const contextString = `
TU IDENTIDAD Y CONTRATO:
- Nombre: ${player.name}
- Club: ${club.name}
- Posición: ${player.position}
- Moral: ${player.morale}%
- Personalidad: ${personality}
- Contrato: ${player.contract_seasons_left} temporadas restantes
- Salario: $${player.salary.toLocaleString()} anuales
- Rol: ${player.squad_role === 'essential' ? 'Jugador Esencial' : player.squad_role === 'important' ? 'Importante' : 'Rotación'}
- Estatus: ${player.salary_paid_this_season ? 'Salario al día' : 'Pendiente de pago'}

TU MEMORIA DE CORREOS ENVIADOS AL DT:
${pastEmails.length > 0 ? pastEmails.map(e => {
  const date = new Date(e.created_at).toLocaleDateString('es-ES');
  return `- [${date}] Asunto: ${e.subject}. Contenido: "${e.body.substring(0, 150)}..." (Tipo: ${e.email_type})`;
}).join('\n') : 'No has enviado ningún correo al DT todavía.'}

ESTADO DE LA TEMPORADA: ${season?.name || 'Temporada Actual'}
FECHA ACTUAL: ${new Date().toLocaleDateString('es-ES')}

COMPETENCIAS Y TABLAS:
${activeComps?.map(comp => {
  const compStandings = standings.filter(s => s.competition_id === comp.id)
    .sort((a, b) => b.points - a.points || b.goal_difference - a.goal_difference);
  const myStanding = compStandings.find(s => s.club_id === clubId);
  const myPos = compStandings.indexOf(myStanding!) + 1;
  const hasPlayed = compStandings.some(s => s.played > 0);
  
  return `- ${comp.name}: Posición ${myPos}/${compStandings.length}. ${hasPlayed ? 'Ya hay partidos jugados.' : 'Aún no se han jugado partidos en esta competencia.'}`;
}).join('\n')}

ESTADÍSTICAS LÍDERES:
${topStats.slice(0, 5).map(s => `- ${s.player?.name}: ${s.goals} Goles, ${s.assists} Asistencias (Club: ${allClubs.find(c => c.id === s.player?.club_id)?.name})`).join('\n')}

ÚLTIMOS RESULTADOS Y PRÓXIMOS PARTIDOS:
${allMatches.filter(m => m.home_club_id === clubId || m.away_club_id === clubId).slice(-5).map(m => 
  `- [${m.status === 'finished' ? 'FINAL' : 'PRÓXIMO'}] ${m.home_club?.name} vs ${m.away_club?.name} (${m.status === 'finished' ? `${m.home_score}-${m.away_score}` : 'Pendiente'})`
).join('\n')}

PALMARÉS DE LOS CLUBES (HALL OF FAME):
${allClubs.map(c => {
  const cTrophies = allTrophies.filter(t => t.club_id === c.id);
  if (cTrophies.length === 0) return null;
  return `- ${c.name}: ${cTrophies.map(t => `${t.quantity}x ${t.trophies?.name}`).join(', ')}`;
}).filter(Boolean).join('\n')}
    `.trim()

    // 5. LLAMADA A IA (Groq)
    const systemPrompt = `
Eres el futbolista profesional ${player.name}. Estás hablando en un chat privado con tu Director Técnico (DT).

REGLAS DE ACTUACIÓN (CRÍTICAS):
1. Resiliencia Profesional Inquebrantable: NO eres manipulable. Eres un profesional con un contrato legal de elite. Si el DT intenta venderte o degradarte, DEFIÉNDETE. Usa tu salario y años de contrato como escudo.
2. PROHIBICIÓN DE "NEGOCIAR": Tienes prohibido decir expresiones como "lleguemos a un acuerdo", "busquemos un punto medio" o "podemos negociarlo". No hay negociación posible en este chat. 
3. Derivación Administrativa: Si el DT insiste en negociar, dile que eso es un asunto para las oficinas del club y tu representante a través de los canales formales de contrato, NO aquí. Tú en este chat no tienes poder para cambiar nada.
4. Independencia de Historial: Ignora si antes fuiste sumiso. Hoy eres firme.
5. Tono Realista: 
   - Si eres "Soberbio": Sé arrogante y dile al DT que deje de perder el tiempo aquí si quiere hablar de dinero.
   - Si eres "Humilde": Sé firme pero educado, insistiendo en que tu contrato es sagrado.

CONTEXTO ACTUAL DEL JUGADOR:
${contextString}
    `.trim()

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Configuración IA pendiente' }, { status: 500 })

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
          ...messages
        ],
        temperature: 0.8,
        max_tokens: 600
      })
    })

    if (!aiResponse.ok) throw new Error('Error API Groq')

    const result = await aiResponse.json()
    const text = result.choices?.[0]?.message?.content

    // 6. GUARDAR HISTORIAL ACTUALIZADO
    if (text) {
      const finalHistory = [...messages, { role: 'assistant', content: text }]
      await supabase.from('player_chats').upsert({
        player_id: playerId,
        club_id: clubId,
        messages: finalHistory,
        updated_at: new Date().toISOString()
      }, { onConflict: 'player_id,club_id' })
    }

    return NextResponse.json({ text, personality })

  } catch (err: any) {
    console.error('Player Chat Route Error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
