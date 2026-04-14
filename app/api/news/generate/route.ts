import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendPushToAll } from '@/lib/push-notifications'

export async function POST(req: Request) {
  try {
    const { clubId, isManual = false, isMatchTrigger = false, matchId = null, isMarketTrigger = false, textData = null } = await req.json()
    
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 })

    let context = ""
    let competitionDetails: any[] = []
    let matchData: any = null
    let participants: string[] = []

    // CASO A: Disparador por partido finalizado (1 noticia)
    if (isMatchTrigger && matchId) {
      const { data: m, error: mErr } = await supabase
        .from('matches')
        .select('*, home_club:clubs!matches_home_club_id_fkey(*), away_club:clubs!matches_away_club_id_fkey(*), competition:competitions(*)')
        .eq('id', matchId)
        .single()
      
      if (mErr || !m) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
      matchData = m
      participants = [m.home_club_id, m.away_club_id]

      const { data: annotations } = await supabase
        .from('match_annotations')
        .select('*, player:players(*)')
        .eq('match_id', matchId)

      context = `
        CRÓNICA DE PARTIDO:
        Competición: ${m.competition?.name}
        Resultado: ${m.home_club?.name} ${m.home_score} - ${m.away_score} ${m.away_club?.name}
        Detalles de anotaciones: ${annotations?.map(a => `${a.player?.name || 'Jugador'} marcó para ${a.club_id === m.home_club_id ? m.home_club?.name : m.away_club?.name}`).join(', ')}
      `
    }
    // CASO M: Disparador del Mercado (1 Noticia bomba)
    else if (isMarketTrigger) {
      const { data: pastTransfers } = await supabase
        .from('market_history')
        .select('amount, type, player:players(name), from_club:clubs!market_history_from_club_id_fkey(name), to_club:clubs!market_history_to_club_id_fkey(name)')
        .order('created_at', { ascending: false })
        .limit(5)

      const historyStr = pastTransfers?.map((t: any) => 
        `- ${t.player?.name} fue ${t.type === 'sale' ? 'vendido del' : 'movido del'} ${t.from_club?.name} al ${t.to_club?.name} por $${t.amount}`
      ).join('\n') || 'Ninguno reciente.'

      context = `
        BOMBAZO EN EL MERCADO (REPORTE EXCLUSIVO NO PUBLICADO AÚN):
        ===========================================================
        El siguiente suceso confidencial acaba de ocurrir en las negociaciones o despachos:
        "${textData}"
        ===========================================================

        ÚLTIMAS PUBLICACIONES Y FICHAJES REALIZADOS (PROHIBIDO REPETIRLOS EN LA NOTICIA ACTUAL):
        ${historyStr}
      `
    }
    // CASO B: Manual o Refresco Diario (3 o 6 noticias)
    else {
      if (!clubId) return NextResponse.json({ error: 'Club ID required' }, { status: 400 })
      
      const { data: enrollment } = await supabase
        .from('competition_clubs')
        .select('competition_id, competition:competitions(*, season:seasons(*))')
        .eq('club_id', clubId)
      
      const compIds = enrollment?.map(e => e.competition_id) || []
      competitionDetails = enrollment?.map(e => e.competition) || []

      const [clubRes, recentMatchesRes, futureMatchesRes, topScorersRes, clubPlayersRes] = await Promise.all([
        supabase.from('clubs').select('*').eq('id', clubId).single(),
        supabase.from('matches')
          .select('*, home_club:clubs!matches_home_club_id_fkey(*), away_club:clubs!matches_away_club_id_fkey(*), competition:competitions(*)')
          .in('competition_id', compIds)
          .eq('status', 'finished')
          .order('played_at', { ascending: false })
          .limit(10),
        supabase.from('matches')
          .select('*, home_club:clubs!matches_home_club_id_fkey(*), away_club:clubs!matches_away_club_id_fkey(*), competition:competitions(*)')
          .in('competition_id', compIds)
          .eq('status', 'scheduled')
          .order('match_order', { ascending: true })
          .limit(5),
        supabase.from('player_competition_stats')
          .select('*, player:players(*), club:clubs(*), competition:competitions(*)')
          .in('competition_id', compIds)
          .order('goals', { ascending: false })
          .limit(10),
        supabase.from('players')
          .select('*')
          .eq('club_id', clubId)
          .limit(10)
      ])

      const club = clubRes.data
      const recentMatches = recentMatchesRes.data || []
      const futureMatches = futureMatchesRes.data || []
      const leagueScorers = topScorersRes.data || []
      const clubPlayers = clubPlayersRes.data || []

      const activeComps = competitionDetails.filter((c: any) => c.season?.status === 'active')
      const isOffseason = activeComps.length === 0

      context = `
        ESTADO DEL TIEMPO LIGUERO:
        [ ${isOffseason ? '🚨 PRETEMPORADA / SIN PARTIDOS ACTIVOS' : '🟢 TEMPORADA REGULAR EN JUEGO'} ]
        
        TUS COMPETICIONES INSCRITAS:
        ${competitionDetails.map((c: any) => `- ${c.name} (Estatus: ${c.season?.status === 'active' ? 'Jugándose' : 'En Receso / Finalizada'})`).join('\n')}

        DATOS VERÍDICOS (NO INVENTAR AFUERA DE ESTOS):
        - Club Investigado (Menciónalo): ${club?.name}
        - Plantel de este club: ${clubPlayers.map((p: any) => p.name).join(', ')}
        - Últimos Resultados (Ignorar en pretemporada): ${recentMatches.map(m => `[${m.competition?.name} | Fase/Jornada: ${m.round_name || m.matchday}] ${m.home_club?.name} ${m.home_score}-${m.away_score} ${m.away_club?.name}`).join(' | ')}
        - Goleadores Globales Actuales: ${leagueScorers.map(s => `${s.player?.name} (${s.club?.name}): ${s.goals} goles`).join(', ')}
      `
    }

    const promptBody = isMatchTrigger ? `
      Genera EXACTAMENTE 1 noticia deportiva rompedora sobre el partido finalizado en los datos.
      Tono: MUY AMARILLISTA, tabloide y explosivo.
      Regla: Usa el nombre real de la competición ("${matchData?.competition?.name}") y la fase del torneo si aplica. Habla del fracaso o heroísmo en el resultado.
      ` : isMarketTrigger ? `
      Genera EXACTAMENTE 1 noticia de última hora enfocada ESTRICTAMENTE en el "BOMBAZO EN EL MERCADO" que se te dio en tus datos.
      Tono: Súper dramático, sensacionalista, filtración exclusiva y especulando sobre el dinero pagado o la traición.
      REGLA INQUEBRANTABLE PREVENTIVA: Tienes estrictamente PROHIBIDO hablar de los nombres listados en "ÚLTIMAS PUBLICACIONES Y FICHAJES REALIZADOS", esa lista solo existe para que NO repitas esos nombres antiguos. Céntrate exclusivamente en dictar la noticia de tu "BOMBAZO". Categorízala como 'market'.
      ` : `
      Genera EXACTAMENTE 3 noticias polémicas, tóxicas o virales sobre la liga, dándole énfasis en una de ellas al 'Club Investigado'.
      
      PARÁMETRO STRICTO DE LÍNEA TEMPORAL (LEER CON ATENCIÓN):
      Verifica el "ESTADO DEL TIEMPO LIGUERO" en los datos.
      - SI ESTÁN EN "PRETEMPORADA": Tienes **ESTRICTAMENTE PROHIBIDO** hablar de resultados recientes, crónicas de partidos, puntos o goles en curso. Todo es un espejismo si lo haces. En pretemporada debes centrarte 100% en: Fichajes del mercado, rumores, escándalos de la plantilla en vacaciones, declaraciones del presidente del club, cambios de táctica del DT y tensión de preparación.
      - SI ESTÁN EN "TEMPORADA": Céntrate en criticar rachas de puntos con los Últimos Resultados, alabar o atacar a la mesa de Goleadores mostrada, y especular sobre crisis en el vestuario para la jornada en curso.

      REGLA DE VERACIDAD (PENALIZACIÓN ALUCINATORIA):
      NUNCA filies a un jugador a un club al azar si no figura en los TUS DATOS. Si vas a decir que alguien será fichado o es una estrella de un rival, usa a los listados en los Goleadores globales. Si necesitas hablar de la plantilla local, usa el "Plantel de este club". No inventes equipos que no existen.
    `

    const finalPrompt = `
      Eres el director de "PIFA DAILY". 
      ${promptBody}
      
      DATOS:
      ${context}

      Responde en JSON (Array de objetos):
      - title: Titular explosivo.
      - content: 2-3 líneas de texto.
      - emoji: Un emoji.
      - category: 'match', 'gossip' o 'market'.
      - color: Color neón hexadecimal.
    `

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: 'Solo responde en JSON puro.' }, { role: 'user', content: finalPrompt }],
        temperature: 0.85,
        response_format: { type: 'json_object' }
      })
    })

    const groqData = await groqRes.json()
    let newsItems = []
    try {
      const parsed = JSON.parse(groqData.choices[0].message.content)
      newsItems = Array.isArray(parsed) ? parsed : (parsed.news || parsed.articles || Object.values(parsed)[0])
      if (!Array.isArray(newsItems)) newsItems = [parsed]
    } catch (e) { return NextResponse.json({ error: 'JSON parse error' }, { status: 500 }) }

    // 3. Guardar noticias
    const toInsert: any[] = []
    if (isMatchTrigger) {
      // Guardar la misma noticia para ambos clubes
      const article = newsItems[0]
      participants.forEach(cid => {
        if (cid) toInsert.push({ club_id: cid, title: article.title, content: article.content, emoji: article.emoji, category: 'match', summary: article.color })
      })
    } else if (isMarketTrigger) {
      const article = newsItems[0] || newsItems
      // Insertar global o dirigida al primer club (en Global Chat UI esto se distribuye igual a todos)
      toInsert.push({ club_id: null, title: article.title, content: article.content, emoji: article.emoji || '💰', category: 'market', summary: article.color || '#00FF85' })
    } else {
      newsItems.forEach((item: any) => {
        toInsert.push({ club_id: clubId, title: item.title, content: item.content, emoji: item.emoji, category: item.category, summary: item.color })
      })
    }

    const { data: inserted } = await supabase.from('news').insert(toInsert).select()

    // -- PUSH NOTIFICATIONS (News Globales) --
    if (toInsert.length > 0) {
      const topArticle = toInsert[0]
      const count = toInsert.length
      
      sendPushToAll(
        `${topArticle.emoji || '🗞️'} PIFA Daily: ${topArticle.title}`, 
        count > 1 ? `Y otras ${count - 1} exclusivas acaban de reventar en la prensa. Entra a leerlas...` : `La rotativa acaba de publicar una exclusiva global. ¡Infórmate!`,
        { type: 'news_alert' }
      )
    }

    return NextResponse.json(inserted || toInsert)

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
