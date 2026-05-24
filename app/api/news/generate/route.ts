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
    const { clubId, isManual = false, isMatchTrigger = false, matchId = null, isMarketTrigger = false, textData = null, marketEvent = null } = await req.json()
    
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'IA no configurada' }, { status: 500 })

    // 1. OBTENER INFORMACIÓN DE VERDAD ABSOLUTA
    const [playersRes, clubsRes, marketRes, standingsRes, seasonsRes] = await Promise.all([
      supabase.from('players').select('id, name, club_id'),
      supabase.from('clubs').select('id, name'),
      supabase.from('market_history').select('*, player:players(name), from_club:clubs!market_history_from_club_id_fkey(name), to_club:clubs!market_history_to_club_id_fkey(name)').order('created_at', { ascending: false }).limit(5),
      // Standings con competición y temporada — para separar cada liga correctamente
      supabase
        .from('standings')
        .select('*, club:clubs(id, name), competition:competitions(id, name, type, status, season:seasons(id, name, status))')
        .order('points', { ascending: false }),
      supabase.from('seasons').select('id, name, status, updated_at')
    ])

    const allPlayers = playersRes.data || []
    const allClubs = clubsRes.data || []
    const marketHistory = marketRes.data || []
    const allStandings = standingsRes.data || []
    const allSeasons = (seasonsRes.data || []) as any[]

    // Temporada objetivo: la activa; si no hay, la última finalizada (modo retrospectiva)
    const activeSeason = allSeasons.find((s) => s.status === 'active') || null
    const lastFinished = [...allSeasons]
      .filter((s) => s.status === 'finished')
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0] || null
    const targetSeason = activeSeason || lastFinished
    const retrospective = !activeSeason && !!lastFinished
    const seasonLabel = targetSeason
      ? `${targetSeason.name} — ${activeSeason ? 'EN CURSO' : 'FINALIZADA (modo retrospectiva)'}`
      : 'Sin temporada registrada'

    // Escopar standings SOLO a la temporada objetivo (evita mezclar ciclos pasados)
    const standings = targetSeason
      ? allStandings.filter((s: any) => s.competition?.season?.id === targetSeason.id)
      : []

    const rosterMap = allClubs.map(c => {
      const pNames = allPlayers.filter(p => p.club_id === c.id).map(p => p.name).join(', ')
      return `${c.name}: [${pNames || 'Sin jugadores'}]`
    }).join(' | ')

    // Agrupar standings por competición para que el modelo no mezcle ligas
    const standingsByComp = new Map<string, { compName: string; rows: any[] }>()
    for (const s of standings) {
      const compId = s.competition?.id || 'unknown'
      const compName = s.competition?.name || 'Competición desconocida'
      if (!standingsByComp.has(compId)) {
        standingsByComp.set(compId, { compName, rows: [] })
      }
      standingsByComp.get(compId)!.rows.push(s)
    }

    // Construir tabla legible por competición
    const standingsTable = Array.from(standingsByComp.values()).map(({ compName, rows }) => {
      const table = rows
        .sort((a, b) => b.points - a.points)
        .map((s, i) => `${i + 1}. ${s.club?.name} (${s.points}pts, GF:${s.goals_for ?? 0} GC:${s.goals_against ?? 0})`)
        .join(', ')
      return `[${compName}]: ${table}`
    }).join('\n')

    let context = ""
    let participantsIds = new Set<string>()
    let mode: 'match' | 'market' | 'general' = 'general'

    // CASO A: Partido
    if (isMatchTrigger && matchId) {
      mode = 'match'
      const { data: m } = await supabase
        .from('matches')
        .select('*, home_club:clubs!matches_home_club_id_fkey(name), away_club:clubs!matches_away_club_id_fkey(name), competition:competitions(id, name, type, status, season:seasons(name, status))')
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

      const match = m as any
      const comp = match?.competition
      const compType = comp?.type
      const groupName = match?.group_name
      const isKnockout = compType === 'cup' || (compType === 'groups_knockout' && !groupName)
      const roundName = match?.round_name || (match?.matchday ? `Jornada ${match.matchday}` : '—')
      const isFinal = String(match?.round_name || '').startsWith('Final')
      const seasonName = comp?.season?.name || (targetSeason?.name ?? '—')
      const scorers = annData?.map(row => row.goals?.map((g: any) => allPlayers.find(p => p.id === g.player_id)?.name).join(', ')).filter(Boolean).join(' | ') || 'sin goleadores'

      const base = `COMPETICIÓN: ${comp?.name} (${compType}). TEMPORADA: ${seasonName}. FASE: ${roundName}. PARTIDO: ${match?.home_club?.name} ${match?.home_score} - ${match?.away_score} ${match?.away_club?.name}. PARTICIPANTES PERMITIDOS: ${participantNames}. GOLES: ${scorers}.`

      if (isKnockout) {
        // Eliminatoria: calcular agregado entre ambos clubes y quién avanza (no hay tabla)
        const homeId = match?.home_club_id
        const awayId = match?.away_club_id
        let aggLine = ''
        if (homeId && awayId) {
          const { data: tie } = await supabase
            .from('matches')
            .select('home_club_id, away_club_id, home_score, away_score')
            .eq('competition_id', comp?.id)
            .eq('status', 'finished')
            .or(`and(home_club_id.eq.${homeId},away_club_id.eq.${awayId}),and(home_club_id.eq.${awayId},away_club_id.eq.${homeId})`)
          const legs = ((tie as any[] | null) || []).filter((x) => x.home_score != null && x.away_score != null)
          const goalsFor = (cid: string) => legs.reduce((sum, x) => sum + (x.home_club_id === cid ? (x.home_score || 0) : x.away_club_id === cid ? (x.away_score || 0) : 0), 0)
          if (legs.length >= 2) {
            const aggHome = goalsFor(homeId)
            const aggAway = goalsFor(awayId)
            const advancer = aggHome > aggAway ? match?.home_club?.name : aggAway > aggHome ? match?.away_club?.name : null
            aggLine = ` GLOBAL DE LA ELIMINATORIA (ida y vuelta): ${match?.home_club?.name} ${aggHome} - ${aggAway} ${match?.away_club?.name}.` + (advancer ? ` AVANZA: ${advancer}.` : ' Empate en el global (se resuelve por goles de visitante o penales).')
          } else {
            const hs = match?.home_score || 0
            const as2 = match?.away_score || 0
            const advancer = hs > as2 ? match?.home_club?.name : as2 > hs ? match?.away_club?.name : match?.home_club?.name
            aggLine = ` AVANZA: ${advancer}.`
          }
        }
        context = base + aggLine + (isFinal ? ' ES LA FINAL: el ganador queda CAMPEÓN del torneo.' : '') + ' (Eliminatoria: NO existe tabla de posiciones.)'
      } else {
        // Liga / fase de grupos: impacto en la clasificación de esta competición
        const matchCompStandings = standings
          .filter((s: any) => s.competition?.id === comp?.id)
          .sort((a: any, b: any) => b.points - a.points)
          .map((s: any, i: number) => `${i + 1}. ${s.club?.name} (${s.points}pts)`)
          .join(', ')
        context = base + ` CLASIFICACIÓN DE ESTA COMPETICIÓN: ${matchCompStandings || 'No disponible'}`
      }
    }
    // CASO B: Mercado
    else if (isMarketTrigger) {
      mode = 'market'
      context = `TEMPORADA: ${seasonLabel}. EVENTO MERCADO${marketEvent ? ` [${marketEvent}]` : ''}: ${textData}`
    }
    // CASO C: General — enfocado en el club y su competición real
    else {
      mode = 'general'
      const { data: club } = await supabase.from('clubs').select('id, name').eq('id', clubId).single()
      
      // Encontrar en qué competiciones aparece este club, su posición y si la competición sigue en curso
      const clubStandingsInfo = standings
        .filter((s: any) => s.club?.id === clubId)
        .map((s: any) => {
          const compRows = standings
            .filter((r: any) => r.competition?.id === s.competition?.id)
            .sort((a: any, b: any) => b.points - a.points)
          const pos = compRows.findIndex((r: any) => r.club?.id === clubId) + 1
          const compStatus = s.competition?.status === 'finished' ? 'FINALIZADA' : 'EN CURSO'
          return `${s.competition?.name} [${compStatus}]: posición ${pos}° con ${s.points}pts (GF:${s.goals_for ?? 0} GC:${s.goals_against ?? 0}, PJ:${s.played ?? 0})`
        })
        .join(' | ')

      context = `TEMPORADA: ${seasonLabel}. ENFOQUE: ${club?.name}. SITUACIÓN DEL CLUB: ${clubStandingsInfo || 'No tiene partidos registrados aún'}`
    }


    const marketContext = marketHistory.map(t => `- JUGADOR: ${t.player?.name} (DE: ${t.from_club?.name || 'Agente Libre'} -> A: ${t.to_club?.name})`).join('\n')

    // 2. DEFINICIÓN DE PROMPTS MODULARES
    const COMMON_RULES = `REGLAS DE ORO:
1. IDIOMA: SIEMPRE ESPAÑOL.
2. VERACIDAD: Si un jugador no está en el MAPA DE ROSTERS, no existe.
3. PRIORIDAD: Los "DATOS ACTUALES" mandan sobre cualquier otra cosa.
4. COMPETICIONES SEPARADAS: Hay varias competiciones con clubes distintos. NUNCA mezcles la clasificación de una competición con la de otra. Cada club pertenece a su propia liga o torneo.
5. ROLES: Presta mucha atención a quién es el COMPRADOR y quién el VENDEDOR. No los inviertas.
6. JSON: Responde solo JSON con llaves [title, content, emoji, category, color].
7. LONGITUD: Máximo 1 párrafo por noticia.
8. TEMPORADA Y ESTADO: respeta el estado real. Si una competición está FINALIZADA, NO hables de jornadas futuras ni de "lucha por el título" en presente; trátala como cerrada (campeón ya definido). En modo RETROSPECTIVA, redacta como balance del ciclo, en pasado.
9. FASE/COPA: en eliminatorias NO existe tabla de posiciones; habla de la ronda (octavos, cuartos, semifinal, final), del GLOBAL de la eliminatoria y de quién avanza o queda eliminado.`

    const MODE_RULES = {
      match: `MODO CRONISTA DEPORTIVO:
- Céntrate en el resultado, la FASE y los participantes del partido.
- PROHIBIDO mencionar a jugadores que no estén en la lista de PARTICIPANTES PERMITIDOS del partido.
- Si el contexto indica una ELIMINATORIA, habla de la ronda, del GLOBAL y de quién avanza/queda eliminado; si es la FINAL, corona al campeón. NO menciones tabla de posiciones.
- Si es LIGA o fase de grupos, comenta el impacto en la CLASIFICACIÓN de esa competición (solo la indicada). NUNCA uses datos de clasificación de otra competición.
- La categoría (category) de estas noticias debe ser "match".`,
      market: `MODO INSIDER DE MERCADO:
- Céntrate en la bomba del fichaje o movimiento.
- Si los datos dicen "INTERÉS" u "OFERTA", aclara que NO es oficial aún.
- Si los datos dicen "OFICIAL" o "FICHAJE", trátalo como un hecho consumado.
- Analiza el impacto deportivo para ambos clubes.
- No hables de resultados de partidos.`,
      general: `MODO REPORTE DE LIGA:
- El foco es el club y competición indicados en DATOS ACTUALES.
- Usa la SITUACIÓN DEL CLUB para hablar de su posición real, puntos, goles y racha.
- NUNCA inventes posiciones ni puntos. Usa SOLO los datos de clasificación provistos.
- Si el club está en varias competiciones, diferéncialas claramente.`
    }

    const systemPrompt = `ERES EL DIRECTOR DE "PIFA DAILY".
${COMMON_RULES}

${MODE_RULES[mode]}

TEMPORADA: ${seasonLabel}${retrospective ? ' — Escribe en modo RETROSPECTIVA (balance del ciclo, en pasado).' : ''}

CLASIFICACIONES POR COMPETICIÓN (cada bloque es una liga/torneo independiente, NO las mezcles):
${standingsTable || 'Sin datos de clasificación disponibles'}

MAPA DE ROSTERS: ${rosterMap}
HISTORIAL RECIENTE DE MERCADO:
${marketContext || 'Sin movimientos recientes'}`.trim()

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
            temperature: 0.5,
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
