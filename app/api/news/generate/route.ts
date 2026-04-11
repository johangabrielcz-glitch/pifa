import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const { clubId, isManual = false, isMatchTrigger = false, matchId = null } = await req.json()
    
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
    // CASO B: Manual o Refresco Diario (3 o 6 noticias)
    else {
      if (!clubId) return NextResponse.json({ error: 'Club ID required' }, { status: 400 })
      
      const { data: enrollment } = await supabase
        .from('competition_clubs')
        .select('competition_id, competition:competitions(*)')
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

      context = `
        COMPETICIONES ACTIVAS:
        ${competitionDetails.map((c: any) => `- ${c.name} (Tipo: ${c.type})`).join('\n')}

        DATOS DE LA LIGA:
        - Club del Usuario: ${club?.name}
        - Jugadores del Club: ${clubPlayers.map((p: any) => p.name).join(', ')}
        - Resultados: ${recentMatches.map(m => `[${m.competition?.name}] ${m.home_club?.name} ${m.home_score}-${m.away_score} ${m.away_club?.name}`).join(', ')}
        - Goleadores (Jugador - Club): ${leagueScorers.map(s => `${s.player?.name} (${s.club?.name}) [${s.goals} goles]`).join(', ')}
      `
    }

    const promptBody = isMatchTrigger ? `
      Genera EXACTAMENTE 1 noticia (crónica) sobre el partido finalizado que te proporciono.
      Tono: MUY AMARILLISTA, sensacionalista y polémico.
      Regla: Usa el nombre real de la competición: "${matchData.competition?.name}".
      ` : isManual ? `
      Genera EXACTAMENTE 3 noticias polémicas centradas en el club ${clubId}. 
      Incluye chismes, mercado y rendimiento.
      Usa los nombres reales de las competencias: ${competitionDetails.map(c => `"${c.name}"`).join(', ')}.
      ` : `
      Genera EXACTAMENTE 6 noticias polémicas globales sobre la liga y sus competencias.
      Mezcla resultados, chismes y mercado.

      REGLA DE VERACIDAD:
      SOLO usa las afiliaciones de club indicadas en los "DATOS DE LA LIGA". 
      NO INVENTES de qué club es un jugador. Si un jugador no aparece en la lista de goleadores o jugadores del club, NO menciones su club de origen.
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
    } else {
      newsItems.forEach((item: any) => {
        toInsert.push({ club_id: clubId, title: item.title, content: item.content, emoji: item.emoji, category: item.category, summary: item.color })
      })
    }

    const { data: inserted } = await supabase.from('news').insert(toInsert).select()
    return NextResponse.json(inserted || toInsert)

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
