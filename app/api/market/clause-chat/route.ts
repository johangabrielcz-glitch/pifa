import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { sendPushToAll } from '@/lib/push-notifications'

export const runtime = 'edge'

const MODELS_HIERARCHY = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.3-70b-versatile',
  'qwen/qwen3-32b'
]

export async function POST(req: Request) {
  try {
    const { playerId, clubId, negotiationId, messages } = await req.json()

    if (!playerId || !clubId || !negotiationId) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    // 1. OBTENER CONTEXTO COMPLETO
    const [
      playerRes,
      buyerClubRes,
      negotiationRes,
      activeSeasonRes,
      trophiesRes,
      allClubsRes
    ] = await Promise.all([
      supabase.from('players').select('*, club:clubs(*)').eq('id', playerId).single(),
      supabase.from('clubs').select('*').eq('id', clubId).single(),
      supabase.from('clause_negotiations').select('*').eq('id', negotiationId).single(),
      supabase.from('seasons').select('*').eq('status', 'active').single(),
      supabase.from('club_trophies').select('*, trophies(*)'),
      supabase.from('clubs').select('id, name')
    ])

    const player = playerRes.data
    const buyerClub = buyerClubRes.data
    const negotiation = negotiationRes.data
    const season = activeSeasonRes.data
    const allTrophies = trophiesRes.data || []
    const allClubs = allClubsRes.data || []

    if (!player || !buyerClub || !negotiation) {
      return NextResponse.json({ error: 'Contexto no encontrado' }, { status: 404 })
    }

    if (negotiation.status === 'blocked') {
      return NextResponse.json({ text: "Ya te dije que no me interesa hablar contigo. Mi agente tiene órdenes claras.", status: 'blocked' })
    }

    const sellerClub = player.club
    
    // 2. CÁLCULO DE MÉTRICAS (LEALTAD Y PALMARÉS)
    const countTrophies = (cid: string | undefined) => cid ? allTrophies.filter(t => t.club_id === cid).length : 0
    const buyerTrophies = countTrophies(clubId)
    const sellerTrophies = countTrophies(player.club_id)

    // Lealtad Dinámica: Base (50) + Tiempo en club + Influencia de Moral
    const joinDate = new Date(player.created_at)
    const now = new Date()
    const daysInClub = Math.floor((now.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24))
    const yearsBonus = Math.floor(daysInClub / 365) * 15 // 15 puntos por año
    const moraleBonus = (player.morale - 50) * 0.4 // -20 a +20
    const loyaltyScore = Math.min(100, Math.max(0, 50 + yearsBonus + moraleBonus))

    // 3. PERSONALIDAD Y ROLES
    // 3. DETERMINAR PERSONALIDAD BASADA EN LEALTAD
    let personality = 'Profesional Equilibrado'
    if (player.is_one_club_man) personality = 'One Club Man (Lealtad Absoluta)'
    else if (loyaltyScore < 40) personality = 'Estrella Ambiciosa y Mercenaria'
    else if (loyaltyScore > 75) personality = 'Futbolista Humilde y Fiel'

    // 4. ENSAMBLAR PROMPT DE HIERRO
    const contextString = `
IDENTIDAD: ${player.name} (${player.position})
PERSONALIDAD: ${personality} | Lealtad: ${loyaltyScore}% | Moral: ${player.morale}%
CLUB ACTUAL: ${sellerClub?.name} (Títulos: ${sellerTrophies}) | Salario Actual: $${player.salary.toLocaleString()} ANUALES
CLUB INTERESADO (COMPRADOR): ${buyerClub.name} (Títulos: ${buyerTrophies})
OBJETIVO SALARIAL (3X): $${(player.salary * 3).toLocaleString()} ANUALES

REGLAS DE NEGOCIACIÓN (EXTREMA AGRESIVIDAD):
1. Eres escéptico y CORTANTE. Sientes que el club comprador quiere "comprar tu alma".
2. Si la oferta salarial es menor al DOBLE de lo actual, trátalo como un insulto personal.
3. Si el club comprador es inferior en títulos, sé sarcástico y prepotente.
4. PACIENCIA ACTUAL: ${negotiation.patience}/100. SI TE MOLESTAN, PIERDE PACIENCIA AGRESIVAMENTE.
    `.trim()

    const systemPrompt = `
Eres el futbolista ${player.name}. Estás hablando con el DT del ${buyerClub.name} que quiere pagar tu cláusula.
Responderás SIEMPRE en ESPAÑOL.

REGLAS SÁDICAS:
1. NO seas fácil de convencer. Sé agresivo, seco y defiende tu prestigio.
2. EVALUACIÓN DE OFERTA (VALORES ANUALES):
   - SALARIO: Tu base es $${player.salary.toLocaleString()} anuales. Tu objetivo es **$${(player.salary * 3).toLocaleString()} anuales**. Si te ofrecen menos de eso, oféndete.
   - ¡IMPORTANTE!: No menciones salarios semanales, todo es en valores ANUALES.
   - ROL: Quieres ser "Jugador Clave" o "Estrella" si tu media es alta (>80).
   - TIEMPO: Ambiciosos prefieren 1-2 años. Humildes prefieren 4-5 años.
3. Si la oferta es mediocre en alguno de estos puntos, reduce tu paciencia (5-20 pts).
4. NUNCA menciones el bloque [INTERNAL_STATE] ni su JSON en tu respuesta. ES SECRETO.

FORMATO:
Escribe un párrafo natural de respuesta que NO contenga etiquetas técnicas.
Al final, añade ÚNICAMENTE UNA VEZ el bloque: [INTERNAL_STATE] { "patience_loss": number, "deal_accepted": boolean, "deal_terms": object | null } [/INTERNAL_STATE]
    `.trim()

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Config IA' }, { status: 500 })

    // 5. LLAMADA A IA
    const isGreeting = messages.length === 0
    let text = ''
    let usedModel = ''
    
    // Ajustar el prompt para el saludo inicial (VAGO PARA AUMENTAR RIESGO)
    const greetingPrompt = isGreeting 
      ? `\nESTE ES TU PRIMER MENSAJE. Abre la conversación con prepotencia. NO digas lo que quieres todavía; haz que el DT se esfuerce y se arriesgue con una primera propuesta. Sé críptico y desafiante.`
      : ''

    for (const model of MODELS_HIERARCHY) {
      try {
        const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt + greetingPrompt }, 
              ...messages.slice(-6)
            ],
            temperature: 0.7,
            max_tokens: 600
          })
        })

        if (aiResponse.ok) {
          const result = await aiResponse.json()
          text = result.choices?.[0]?.message?.content
          if (text) {
            usedModel = model
            break
          }
        }
      } catch (err) { continue }
    }

    if (!text) return NextResponse.json({ error: 'IA no disponible' }, { status: 429 })

    // 6. PROCESAR ESTADO INTERNO (LIMPIEZA AGRESIVA)
    const stateMatch = text.match(/\[INTERNAL_STATE\]([\s\S]*?)\[\/INTERNAL_STATE\]/i)
    let internalState: any = { patience_loss: 5, deal_accepted: false, deal_terms: null }
    
    // Limpieza total y recursiva
    let publicText = text
      .split('[INTERNAL_STATE]')[0] // Cortar todo desde el primer tag
      .replace(/\[\/INTERNAL_STATE\]/gi, '')
      .replace(/\[INTERNAL_STATE\]/gi, '')
      .trim()
    
    // Segunda pasada por si la IA repitió el tag al final
    publicText = publicText.replace(/\{.*"patience_loss".*\}/gi, '').trim()

    if (stateMatch) {
      try {
        internalState = JSON.parse(stateMatch[1])
      } catch (e) { console.error('Error parsing IA state', e) }
    }

    // 7. ACTUALIZAR BASE DE DATOS (Multiplicador x2)
    const rawPatienceLoss = internalState.patience_loss || 5
    const escalatedLoss = rawPatienceLoss * 2 // Ajustado a x2 según feedback
    const newPatience = Math.max(0, negotiation.patience - escalatedLoss)
    const isNowBlocked = newPatience <= 0

    const updateData: any = {
      patience: newPatience,
      updated_at: new Date().toISOString()
    }

    if (isNowBlocked) {
      updateData.status = 'blocked'
      
      // -- DIFUSIÓN DE FRACASO DE CLAUSULAZO --
      try {
        const title = `❌ NEGOCIACIÓN ROTA`
        const body = `${player.name} ha rechazado la propuesta del ${buyerClub.name} y jura lealtad al ${sellerClub?.name || 'club'}.`
        
        // Push a todos
        sendPushToAll(title, body, { type: 'market_alert' })
        
        // Generar Noticia con IA
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || ''
        fetch(`${baseUrl}/api/news/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            isMarketTrigger: true, 
            marketEvent: 'fracaso', 
            textData: `OFICIAL: ${player.name} permanecerá en el ${sellerClub?.name || 'club'}. El jugador se ha mostrado ofendido por el acercamiento del ${buyerClub.name} y ha roto relaciones con ellos.` 
          })
        }).catch(() => {})
      } catch (e) {
        console.error('Error broadcasting failure:', e)
      }
    }
    if (internalState.deal_accepted && internalState.deal_terms) {
      updateData.deal_terms = internalState.deal_terms
    }

    await supabase.from('clause_negotiations').update(updateData).eq('id', negotiationId)

    return NextResponse.json({ 
      text: publicText, 
      patience: newPatience, 
      status: updateData.status || negotiation.status,
      deal_accepted: !!(internalState.deal_accepted && internalState.deal_terms)
    })

  } catch (err: any) {
    console.error('Clause Chat API Error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
