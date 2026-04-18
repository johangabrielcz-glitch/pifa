import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { sendPushToAll } from '@/lib/push-notifications'

// Cascada de Inteligencia (Failover)
const MODELS_HIERARCHY = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.3-70b-versatile',
  'qwen/qwen3-32b'
]

/**
 * Endpoint de generación de noticias modular: Especializa el prompt según el gatillo.
 */
export async function POST(req: Request) {
  try {
    const { clubId, isManual = false, isMatchTrigger = false, matchId = null, isMarketTrigger = false, textData = null } = await req.json()
    
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'IA no configurada' }, { status: 500 })

    // 1. OBTENER INFORMACIÓN DE VERDAD ABSOLUTA
    const [playersRes, clubsRes, marketRes, standingsRes] = await Promise.all([
      supabase.from('players').select('id, name, club_id'),
      supabase.from('clubs').select('id, name'),
      supabase.from('market_history').select('*, player:players(name), from_club:clubs!market_history_from_club_id_fkey(name), to_club:clubs!market_history_to_club_id_fkey(name)').order('created_at', { ascending: false }).limit(5),
      supabase.from('standings').select('*, club:clubs(name)').order('points', { ascending: false })
    ])

    const allPlayers = playersRes.data || []
    const allClubs = clubsRes.data || []
    const marketHistory = marketRes.data || []
    const standings = standingsRes.data || []

    const rosterMap = allClubs.map(c => {
      const pNames = allPlayers.filter(p => p.club_id === c.id).map(p => p.name).join(', ')
      return `${c.name}: [${pNames || 'Sin jugadores'}]`
    }).join(' | ')

    const standingsTable = standings.map((s, i) => `${i + 1}. ${s.club?.name} (${s.points}pts)`).join(' / ')

    let context = ""
    let participantsIds = new Set<string>()
    let mode: 'match' | 'market' | 'general' = 'general'

    // CASO A: Partido
    if (isMatchTrigger && matchId) {
      mode = 'match'
      const { data: m } = await supabase
        .from('matches')
        .select('*, home_club:clubs!matches_home_club_id_fkey(name), away_club:clubs!matches_away_club_id_fkey(name), competition:competitions(name)')
        .eq('id', matchId)
        .single()
      
      const { data: annData } = await supabase.from('match_annotations').select('*').eq('match_id', matchId)
      
      if (annData) {
        annData.forEach(row => {
          if (row.starting_xi) row.starting_xi.forEach((id: string) => participantsIds.add(id))
          if (row.substitutes_in) {
            row.substitutes_in.forEach((s: any) => {
              const sid = typeof s === 'string' ? s : s.player_in
              if (sid) participantsIds.add(sid)
            })
          }
          if (row.goals) row.goals.forEach((g: any) => participantsIds.add(g.player_id))
        })
      }

      const participantNames = Array.from(participantsIds)
        .map(id => allPlayers.find(p => p.id === id)?.name)
        .filter(Boolean)
        .join(', ')

      context = `PARTIDO: ${m?.home_club?.name} ${m?.home_score} - ${m?.away_score} ${m?.away_club?.name}. PARTICIPANTES PERMITIDOS: ${participantNames}. GOLES: ${annData?.map(row => row.goals?.map((g: any) => allPlayers.find(p => p.id === g.player_id)?.name).join(', ')).filter(Boolean).join(' | ')}`
    } 
    // CASO B: Mercado
    else if (isMarketTrigger) {
      mode = 'market'
      context = `EVENTO MERCADO: ${textData}`
    }
    // CASO C: General
    else {
      mode = 'general'
      const { data: club } = await supabase.from('clubs').select('name').eq('id', clubId).single()
      context = `ENFOQUE: ${club?.name || 'La Liga'}`
    }

    const marketContext = marketHistory.map(t => `- JUGADOR: ${t.player?.name} (DE: ${t.from_club?.name || 'Agente Libre'} -> A: ${t.to_club?.name})`).join('\n')

    // 2. DEFINICIÓN DE PROMPTS MODULARES
    const COMMON_RULES = `REGLAS DE ORO:
1. IDIOMA: SIEMPRE ESPAÑOL.
2. VERACIDAD: Si un jugador no está en el MAPA DE ROSTERS, no existe. 
3. PRIORIDAD: Los "DATOS ACTUALES" mandan sobre cualquier otra cosa. Si dicen que algo ocurrió, ocurrió, aunque el Mapa de Rosters parezca decir lo contrario (puede estar un segundo desactualizado).
4. ROLES: Presta mucha atención a quién es el COMPRADOR y quién el VENDEDOR. No los inviertas.
5. JSON: Responde solo JSON con llaves [title, content, emoji, category, color].
6. LONGITUD: Máximo 1 párrafo por noticia.`

    const MODE_RULES = {
      match: `MODO CRONISTA DEPORTIVO: 
- Céntrate solo en el resultado y los participantes del partido. 
- PROHIBIDO mencionar a jugadores que no estén en la lista de PARTICIPANTES PERMITIDOS del partido.
- Usa la clasificación para decir si el equipo sube o baja.`,
      market: `MODO INSIDER DE MERCADO:
- Céntrate en la bomba del fichaje o movimiento. 
- Si los datos dicen "INTERÉS" u "OFERTA", aclara que NO es oficial aún, es un rumor fuerte o negociación.
- Si los datos dicen "OFICIAL" o "FICHAJE", trátalo como un hecho consumado.
- Analiza el impacto deportivo de este movimiento para ambos clubes. 
- No hables de resultados de partidos.`,
      general: `MODO REPORTE DE LIGA:
- Analiza el estado de los clubes según su posición en la clasificación.
- Crea ambiente sobre la competición actual.`
    }

    const systemPrompt = `ERES EL DIRECTOR DE "PIFA DAILY".
${COMMON_RULES}

${MODE_RULES[mode]}

CLASIFICACIÓN ACTUAL: ${standingsTable}
MAPA DE ROSTERS: ${rosterMap}
HISTORIAL RECIENTE: ${marketContext}
`.trim()

    const userPrompt = `DATOS ACTUALES: ${context}\nGenera 3 noticias veraces.`

    let newsItems: any[] = []
    let usedModel = ''

    for (const model of MODELS_HIERARCHY) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            temperature: 0.6,
            response_format: { type: 'json_object' }
          })
        })

        if (groqRes.ok) {
          const groqData = await groqRes.json()
          const parsed = JSON.parse(groqData.choices?.[0]?.message?.content || '{}')
          newsItems = Array.isArray(parsed) ? parsed : (parsed.news || parsed.articles || Object.values(parsed)[0])
          if (!Array.isArray(newsItems)) newsItems = [parsed]
          if (newsItems.length > 0) { usedModel = model; break }
        }
      } catch (e) {}
    }

    if (newsItems.length === 0) return NextResponse.json({ error: 'Fallo IA' }, { status: 429 })

    const toInsert = newsItems
      .map((item: any) => {
        const title = (item.title || item.titulo || 'BOMBAZO').toString().toUpperCase().slice(0, 100)
        const content = item.content || item.contenido || ''
        if (content.length < 10) return null
        return {
          club_id: isMatchTrigger ? null : clubId, 
          title,
          content: content.toString(),
          emoji: item.emoji || '🗞️',
          category: item.category || 'gossip',
          summary: item.color || '#00FF85'
        }
      })
      .filter(Boolean)
      .slice(0, 3)

    if (toInsert.length === 0) return NextResponse.json({ error: 'Data inválida' }, { status: 400 })

    const { data: inserted } = await supabase.from('news').insert(toInsert).select()

    if (toInsert.length > 0 && toInsert[0].title) {
      sendPushToAll(`🗞️ ${toInsert[0].title}`, toInsert[0].content, { type: 'news_alert' })
    }

    return NextResponse.json({ inserted, model: usedModel })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
