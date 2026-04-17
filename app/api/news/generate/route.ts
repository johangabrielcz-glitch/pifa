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
 * Endpoint de generación de noticias con MAPA DE ROSTERS (Anti-Alucinación).
 */
export async function POST(req: Request) {
  try {
    const { clubId, isManual = false, isMatchTrigger = false, matchId = null, isMarketTrigger = false, textData = null } = await req.json()
    
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'IA no configurada' }, { status: 500 })

    // 1. OBTENER MAPA MAESTRO DE LA LIGA (PARA EVITAR ALUCINACIONES)
    const [playersRes, clubsRes, marketRes] = await Promise.all([
      supabase.from('players').select('name, club_id'),
      supabase.from('clubs').select('id, name'),
      supabase.from('market_history').select('*, player:players(name), from_club:clubs!market_history_from_club_id_fkey(name), to_club:clubs!market_history_to_club_id_fkey(name)').order('created_at', { ascending: false }).limit(6)
    ])

    const allPlayers = playersRes.data || []
    const allClubs = clubsRes.data || []
    const marketHistory = marketRes.data || []

    const rosterMap = allClubs.map(c => {
      const pNames = allPlayers.filter(p => p.club_id === c.id).map(p => p.name).join(', ')
      return `${c.name}: [${pNames || 'Sin jugadores'}]`
    }).join(' | ')

    let context = ""
    let participants: string[] = []

    // CASO A: Partido
    if (isMatchTrigger && matchId) {
      const { data: m } = await supabase
        .from('matches')
        .select('*, home_club:clubs!matches_home_club_id_fkey(name), away_club:clubs!matches_away_club_id_fkey(name), competition:competitions(name)')
        .eq('id', matchId)
        .single()
      
      const { data: ann } = await supabase.from('match_annotations').select('*, player:players(name)').eq('match_id', matchId)

      participants = [m?.home_club_id, m?.away_club_id].filter(Boolean) as string[]
      context = `
        EVENTO: FINAL DE PARTIDO
        LIGA/COPA: ${m?.competition?.name}
        RESULTADO: ${m?.home_club?.name} ${m?.home_score} - ${m?.away_score} ${m?.away_club?.name}
        GOLES/HITOS: ${ann?.map(a => `${a.player?.name} (${a.club_id === m?.home_club_id ? m?.home_club?.name : m?.away_club?.name})`).join(', ')}
      `
    } 
    // CASO B: Mercado
    else if (isMarketTrigger) {
      context = `BOMBAZO INMINENTE: ${textData}`
    }
    // CASO C: General/Manual
    else {
      const { data: club } = await supabase.from('clubs').select('name').eq('id', clubId).single()
      context = `ENFOQUE PRINCIPAL: ${club?.name || 'La Liga'}`
    }

    const marketContext = marketHistory.map(t => `- ${t.player?.name} de ${t.from_club?.name} a ${t.to_club?.name} ($${t.amount?.toLocaleString()})`).join('\n')

    const systemPrompt = `
Eres el director de "PIFA DAILY", un periódico deportivo sensacionalista, polémico y vibrante.
REGLA DE ORO DE VERACIDAD: 
1. TU BIBLIA ES EL MAPA DE ROSTERS. Si un jugador está en el EQUIPO A, NO PUEDES decir que está en el EQUIPO B.
2. PROHIBIDO inventar fichajes de jugadores que ya pertenezcan a un club, a menos que lo des como un RUMOR CLARO (ej: "Suena para el rival").
3. NO inventes nombres de clubes. Solo existen los del Mapa.

MAPA DE ROSTERS (Quién juega dónde):
${rosterMap}

ÚLTIMOS MOVIMIENTOS REALES (No repetir como noticia nueva):
${marketContext}

INSTRUCCIONES:
- Responde UNICAMENTE en JSON (Array de objetos).
- Formato: [{"title": "...", "content": "...", "emoji": "...", "category": "match|gossip|market", "color": "#hex"}]
- Tono: Explosivo, amarillista, usa jerga de fútbol.
    `.trim()

    const userPrompt = `CONTEXTO ACTUAL: ${context}\nGenera las noticias ahora.`

    // CASCADA DE INTELIGENCIA
    let newsItems: any[] = []
    let usedModel = ''

    for (const model of MODELS_HIERARCHY) {
      try {
        console.log(`[News API] Fact-Checking con ${model}`)
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            temperature: 0.8,
            response_format: { type: 'json_object' }
          })
        })

        if (groqRes.ok) {
          const groqData = await groqRes.json()
          const parsed = JSON.parse(groqData.choices?.[0]?.message?.content || '{}')
          newsItems = Array.isArray(parsed) ? parsed : (parsed.news || parsed.articles || Object.values(parsed)[0])
          if (!Array.isArray(newsItems)) newsItems = [parsed]
          
          if (newsItems.length > 0) {
            usedModel = model
            break
          }
        }
      } catch (e) { console.warn(`Error en ${model}:`, e) }
    }

    if (newsItems.length === 0) return NextResponse.json({ error: 'Fallo total' }, { status: 429 })

    // GUARDAR
    const toInsert = newsItems.slice(0, 3).map((item: any) => ({
      club_id: isMatchTrigger ? null : clubId, // Global o Club
      title: item.title,
      content: item.content,
      emoji: item.emoji || '🗞️',
      category: item.category || 'gossip',
      summary: item.color || '#00FF85'
    }))

    const { data: inserted } = await supabase.from('news').insert(toInsert).select()

    if (toInsert.length > 0) {
      sendPushToAll(`🗞️ PIFA Daily: ${toInsert[0].title}`, toInsert[0].content, { type: 'news_alert' })
    }

    return NextResponse.json({ inserted, model: usedModel })

  } catch (error: any) {
    console.error('Fatal News Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
