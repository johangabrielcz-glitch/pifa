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
 * Endpoint de generación de noticias con MAPA DE ROSTERS y FILTRO DE PARTICIPACIÓN.
 */
export async function POST(req: Request) {
  try {
    const { clubId, isManual = false, isMatchTrigger = false, matchId = null, isMarketTrigger = false, textData = null } = await req.json()
    
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'IA no configurada' }, { status: 500 })

    // 1. OBTENER INFORMACIÓN BASE DE LA LIGA
    const [playersRes, clubsRes, marketRes] = await Promise.all([
      supabase.from('players').select('id, name, club_id'),
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
    let participantsIds = new Set<string>()

    // CASO A: Partido (CON FILTRO DE PARTICIPANTES REALES)
    if (isMatchTrigger && matchId) {
      const { data: m } = await supabase
        .from('matches')
        .select('*, home_club:clubs!matches_home_club_id_fkey(name), away_club:clubs!matches_away_club_id_fkey(name), competition:competitions(name)')
        .eq('id', matchId)
        .single()
      
      const { data: annData } = await supabase.from('match_annotations').select('*').eq('match_id', matchId)
      
      // Recopilar IDs de todos los que pisaron el campo
      if (annData) {
        annData.forEach(row => {
          if (row.starting_xi) row.starting_xi.forEach((id: string) => participantsIds.add(id))
          if (row.substitutes_in) {
            row.substitutes_in.forEach((s: any) => {
              const sid = typeof s === 'string' ? s : s.player_in
              if (sid) participantsIds.add(sid)
            })
          }
          // Asegurar goleadores/asistentes
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
        LIGA/COPA: ${m?.competition?.name}
        RESULTADO: ${m?.home_club?.name} ${m?.home_score} - ${m?.away_score} ${m?.away_club?.name}
        JUGADORES QUE PARTICIPARON (ÚNICA LISTA DE CRÓNICA): ${participantNames}
        HITOS (Goles/MVP): ${annData?.map(row => {
          const goalsDesc = row.goals?.map((g: any) => `${allPlayers.find(p => p.id === g.player_id)?.name} (GOL)`).join(', ')
          return goalsDesc || ''
        }).filter(Boolean).join(' | ')}
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
ERES EL DIRECTOR DE "PIFA DAILY". ESTE ES UN UNIVERSO PARALELO AISLADO.
REGLAS INQUEBRANTABLES (CUMPLIMIENTO AL 100%):
1. **FILTRO DE PARTIDO (CRÍTICO)**: En crónicas de partidos, SOLO puedes nombrar a jugadores que aparezcan en la lista "JUGADORES QUE PARTICIPARON". Si un jugador está en el Mapa de Rosters pero NO jugó el partido, tienes PROHIBIDO mencionarlo. No inventes que una estrella jugó si no está en la lista de participantes.
2. **PROHIBIDO INVENTAR FICHAJES**: Solo reporta fichajes si se dan en el "CONTEXTO ACTUAL" o "BOMBAZO". NUNCA imagines traspasos.
3. **MAPA DE ROSTERS ES EL LÍMITE**: Solo existen los jugadores y clubes listados. No menciones nombres externos (Real Madrid, Messi, etc.).
4. **MERCADO PASADO**: La lista de "MOVIMIENTOS REALES" es solo informativa, no los reportes como nuevos.

MAPA DE ROSTERS:
${rosterMap}

ÚLTIMOS MOVIMIENTOS REALES (PARA TU INFORMACIÓN):
${marketContext}

ESTILO: Sensacionalista, amarillista, usa "BOMBAZO", "ESCÁNDALO". Máximo 1 párrafo por noticia.
IDIOMA: Responde SIEMPRE en ESPAÑOL.
Responde ÚNICAMENTE en JSON puro (Array de objetos).
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
      club_id: isMatchTrigger ? null : clubId, 
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
