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
 * Endpoint de generación de noticias robusto: MAPA DE ROSTERS + CLASIFICACIÓN + LÓGICA ANTI-ALUCINACIÓN.
 */
export async function POST(req: Request) {
  try {
    const { clubId, isManual = false, isMatchTrigger = false, matchId = null, isMarketTrigger = false, textData = null } = await req.json()
    
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'IA no configurada' }, { status: 500 })

    // 1. OBTENER INFORMACIÓN DE VERDAD ABSOLUTA (Rosters, Clubes, Mercado, Clasificación)
    const [playersRes, clubsRes, marketRes, standingsRes] = await Promise.all([
      supabase.from('players').select('id, name, club_id'),
      supabase.from('clubs').select('id, name'),
      supabase.from('market_history').select('*, player:players(name), from_club:clubs!market_history_from_club_id_fkey(name), to_club:clubs!market_history_to_club_id_fkey(name)').order('created_at', { ascending: false }).limit(6),
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

    const standingsTable = standings.map((s, i) => `${i + 1}. ${s.club?.name}: ${s.points}pts (PJ:${s.played})`).join(' / ')

    let context = ""
    let participantsIds = new Set<string>()

    // CASO A: Partido (CON FILTRO DE PARTICIPANTES REALES)
    if (isMatchTrigger && matchId) {
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
          if (row.assists) row.assists.forEach((a: any) => participantsIds.add(a.player_id))
        })
      }

      const participantNames = Array.from(participantsIds)
        .map(id => allPlayers.find(p => p.id === id)?.name)
        .filter(Boolean)
        .join(', ')

      context = `
        EVENTO: FINAL DE PARTIDO
        INFRAESTRUCTURA: ${m?.competition?.name}
        MARCADOR: ${m?.home_club?.name} ${m?.home_score} - ${m?.away_score} ${m?.away_club?.name}
        JUGADORES QUE REALMENTE ESTUVIERON EN EL CAMPO (ÚNICOS PERMITIDOS): ${participantNames}
        HITOS REALES: ${annData?.map(row => {
          const goalsDesc = row.goals?.map((g: any) => `${allPlayers.find(p => p.id === g.player_id)?.name} (GOL)`).join(', ')
          return goalsDesc || ''
        }).filter(Boolean).join(' | ')}
      `
    } 
    else if (isMarketTrigger) {
      context = `BOMBAZO DE MERCADO: ${textData}`
    }
    else {
      const { data: club } = await supabase.from('clubs').select('name').eq('id', clubId).single()
      context = `NOTICIA GENERAL: Enfoque en ${club?.name || 'la liga'}`
    }

    const marketContext = marketHistory.map(t => `- ${t.player?.name} de ${t.from_club?.name} a ${t.to_club?.name}`).join('\n')

    const systemPrompt = `
ERES EL DIRECTOR DE "PIFA DAILY". ERES UN PERIODISTA DE DATOS, NO UN ESCRITOR DE FICCIÓN.
REGLAS ABSOLUTAS (CUMPLIMIENTO AL 1000%):
1. **FILTRO DE IDENTIDAD**: SOLO puedes hablar de los jugadores listados en el Mapa de Rosters.
2. **FILTRO DE PARTIDO (CRUCIAL)**: En crónicas de partidos, SOLO nombra a los jugadores de la lista "JUGADORES QUE REALMENTE ESTUVIERON EN EL CAMPO". Está TERMINANTEMENTE PROHIBIDO mencionar a una estrella si no jugó. 
3. **TABLA DE POSICIONES**: Usa la clasificación actual para dar contexto. No inventes crisis en los líderes ni gloria en los colistas.
4. **PROHIBIDO INVENTAR EVENTOS**: No inventes lesiones, despidos, peleas internas ni fichajes si no vienen en el "CONTEXTO ACTUAL".
5. **IDIOMA**: Responde SIEMPRE en ESPAÑOL.
6. **ESQUEMA JSON**: Usa estas llaves exactas: "title", "content", "emoji", "category", "color".

CLASIFICACIÓN ACTUAL:
${standingsTable}

MAPA DE ROSTERS (TODOS LOS JUGADORES EXISTENTES):
${rosterMap}

ÚLTIMOS MOVIMIENTOS REALES:
${marketContext}

ESTILO: Sensacionalista pero basado 100% en los datos de arriba. Máximo 1 párrafo por noticia.
Responde ÚNICAMENTE en JSON puro (Array de objetos).
    `.trim()

    const userPrompt = `CONTEXTO REAL DE ESTE MOMENTO: ${context}\nGenera 3 noticias breves y veraces ahora.`

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
            temperature: 0.6, // Temperatura reducida para mayor veracidad
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
      } catch (e) { console.warn(`Error en ${model}:`, e) }
    }

    if (newsItems.length === 0) return NextResponse.json({ error: 'IA no disponible' }, { status: 429 })

    const toInsert = newsItems
      .map((item: any) => {
        const title = item.title || item.titulo || item.headline || 'NOTICIA DE ÚLTIMA HORA'
        const content = item.content || item.contenido || item.body || ''
        if (!content || content.length < 10) return null

        return {
          club_id: isMatchTrigger ? null : clubId, 
          title: title.toString().toUpperCase().slice(0, 100),
          content: content.toString(),
          emoji: item.emoji || '🗞️',
          category: item.category || 'gossip',
          summary: item.color || '#00FF85'
        }
      })
      .filter(Boolean)
      .slice(0, 3)

    if (toInsert.length === 0) return NextResponse.json({ error: 'Error de validación de noticias' }, { status: 400 })

    const { data: inserted } = await supabase.from('news').insert(toInsert).select()

    if (toInsert.length > 0 && toInsert[0].title) {
      sendPushToAll(`🗞️ ${toInsert[0].title}`, toInsert[0].content, { type: 'news_alert' })
    }

    return NextResponse.json({ inserted, model: usedModel })

  } catch (error: any) {
    console.error('Fatal News Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
