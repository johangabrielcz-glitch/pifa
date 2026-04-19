import { supabaseAdmin as supabase } from './supabase'
import { MarketOffer, Notification, Player, Club, ClauseNegotiation, SquadRole } from './types'
import { sendPushToClub, sendPushToAll } from './push-notifications'
import { isTransferWindowOpen } from './contract-engine'

export async function createOffer(
  player: Player,
  buyerClubId: string,
  amount: number,
  previousOfferId: string | null = null
) {
  // 0. Guard: Check transfer window
  const windowOpen = await isTransferWindowOpen()
  if (!windowOpen) throw new Error('La ventana de fichajes está cerrada. No se pueden hacer ofertas.')

  // 1. Create the offer
  const { data: offer, error: offerError } = await supabase
    .from('market_offers')
    .insert({
      player_id: player.id,
      buyer_club_id: buyerClubId,
      seller_club_id: player.club_id,
      amount: amount,
      status: 'pending',
      previous_offer_id: previousOfferId
    })
    .select()
    .single()

  if (offerError) throw offerError

  // 2. Clear previous offer if it was a counter
  if (previousOfferId) {
    await supabase
      .from('market_offers')
      .update({ status: 'countered' })
      .eq('id', previousOfferId)
  }

  // 3. Get buyer name for notification
  const { data: buyerClub } = await supabase.from('clubs').select('name').eq('id', buyerClubId).single()
  const buyerName = buyerClub?.name || 'Un club'

  // 4. Send notification to seller
  const { error: notifError } = await supabase
    .from('notifications')
    .insert({
      club_id: player.club_id,
      title: 'Nueva Oferta Recibida',
      message: `${buyerName.toUpperCase()} ha ofrecido $${amount.toLocaleString()} por ${player.name}.`,
      type: 'offer_received',
      data: { 
        offer_id: offer.id, 
        player_id: player.id, 
        buyer_club_id: buyerClubId,
        buyer_name: buyerName,
        player_name: player.name,
        amount: amount
      }
    })

  if (notifError) console.error('Notification error:', notifError)

  // -- PUSH NOTIFICATION --
  sendPushToClub(
    player.club_id, 
    '⚽ Nueva Oferta Recibida', 
    `${buyerName.toUpperCase()} ha ofrecido $${amount.toLocaleString()} por ${player.name}.`,
    { type: 'offer_received', offer_id: offer.id }
  )

  // -- AUTO NEWS TRIGGER --
  try {
    const { data: sellerClub } = await supabase.from('clubs').select('name').eq('id', player.club_id).single()
    const sellerName = sellerClub?.name || 'su club actual'
    
    fetch('/api/news/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        isMarketTrigger: true, 
        marketEvent: 'offer', 
        textData: `INTERÉS: El club ${buyerName} ha filtrado su interés y presentado una oferta de $${amount} por ${player.name}, actualmente jugador del ${sellerName}.` 
      })
    }).catch(() => {})
  } catch (e) {}

  return offer
}

export async function handleOfferResponse(
  offerId: string,
  response: 'accept' | 'reject' | 'counter' | 'cancel',
  counterAmount?: number
) {
  // 1. Get the offer details - Using explicit FK names
  const { data: offer, error: fetchError } = await supabase
    .from('market_offers')
    .select('*, player:players(*), buyer_club:clubs!buyer_club_fk(*), seller_club:clubs!seller_club_fk(*)')
    .eq('id', offerId)
    .single()

  if (fetchError) throw fetchError

  if (response === 'accept') {
    return await executeTransfer(offer)
  }

  if (response === 'reject') {
    await supabase.from('market_offers').update({ status: 'rejected' }).eq('id', offerId)
    
    // Notify buyer
    await supabase.from('notifications').insert({
      club_id: offer.buyer_club_id,
      title: 'Oferta Rechazada',
      message: `${offer.seller_club?.name.toUpperCase()} ha rechazado tu oferta por ${offer.player.name}.`,
      type: 'offer_rejected',
      data: { 
        player_id: offer.player_id,
        player_name: offer.player?.name,
        seller_name: offer.seller_club?.name
      }
    })

    // -- PUSH NOTIFICATION --
    sendPushToClub(
      offer.buyer_club_id,
      '❌ Oferta Rechazada',
      `${offer.seller_club?.name.toUpperCase()} ha rechazado tu oferta por ${offer.player.name}.`,
      { type: 'offer_rejected', player_id: offer.player_id }
    )
  }

  if (response === 'counter' && counterAmount) {
    await supabase.from('market_offers').update({ status: 'countered' }).eq('id', offerId)

    // Notify original buyer about the counter
    await supabase.from('notifications').insert({
      club_id: offer.buyer_club_id,
      title: 'Contraoferta Recibida',
      message: `${offer.seller_club?.name.toUpperCase()} pide $${counterAmount.toLocaleString()} por ${offer.player.name}.`,
      type: 'offer_countered',
      data: { 
        offer_id: offerId, 
        player_id: offer.player.id, 
        amount: counterAmount,
        player_name: offer.player?.name,
        seller_name: offer.seller_club?.name
      }
    })

    // -- PUSH NOTIFICATION --
    sendPushToClub(
      offer.buyer_club_id,
      '💰 Contraoferta Recibida',
      `${offer.seller_club?.name.toUpperCase()} pide $${counterAmount.toLocaleString()} por ${offer.player.name}.`,
      { type: 'offer_countered', offer_id: offerId }
    )
  }

  if (response === 'cancel') {
    await supabase.from('market_offers').update({ status: 'cancelled' }).eq('id', offerId)
    
    // 1. Physically delete previous "Nueva Oferta" or "Contraoferta" notifications for the recipient
    const { error: delError } = await supabase
      .from('notifications')
      .delete()
      .filter('data->>offer_id', 'eq', offerId)

    if (delError) console.error('Error deleting notifications:', delError)
  }
}

export async function buyPlayerDirectly(player: Player, buyerClubId: string) {
  // 0. Guard: Check transfer window
  const windowOpen = await isTransferWindowOpen()
  if (!windowOpen) throw new Error('La ventana de fichajes está cerrada. No se pueden realizar compras.')

  if (!player.is_on_sale || !player.sale_price) {
    throw new Error('Este jugador no está a la venta directa.')
  }

  const amount = player.sale_price

  // 1. Get clubs info
  const { data: latestBuyer } = await supabase.from('clubs').select('*').eq('id', buyerClubId).single()
  const { data: latestSeller } = await supabase.from('clubs').select('*').eq('id', player.club_id).single()

  if (!latestBuyer || latestBuyer.budget < amount) {
    throw new Error('No tienes presupuesto suficiente para esta compra.')
  }

  // 2. Perform transfer
  // A. Subtract from buyer
  await supabase.from('clubs').update({ budget: latestBuyer.budget - amount }).eq('id', buyerClubId)

  // B. Add to seller
  await supabase.from('clubs').update({ budget: (latestSeller?.budget || 0) + amount }).eq('id', player.club_id)

  // C. Move player with new default contract
  await supabase.from('players').update({ 
    club_id: buyerClubId, 
    is_on_sale: false, 
    sale_price: null,
    // Reset contract for new club
    contract_seasons_left: 3,
    salary: 25000,
    squad_role: 'rotation',
    salary_paid_this_season: false,
    morale: 100,
    wants_to_leave: false,
    contract_status: 'active',
    updated_at: new Date().toISOString()
  }).eq('id', player.id)

  // D. Invalidate all pending offers
  await supabase
    .from('market_offers')
    .update({ status: 'cancelled' })
    .eq('player_id', player.id)
    .eq('status', 'pending')

  // E. Record history
  await supabase.from('market_history').insert({
    player_id: player.id,
    from_club_id: player.club_id,
    to_club_id: buyerClubId,
    amount: amount,
    type: 'sale'
  })

  // F. Notify both - Special message for direct buy
  await supabase.from('notifications').insert([
    {
      club_id: buyerClubId,
      title: 'Compra Directa Completada',
      message: `¡Has comprado a ${player.name} de ${latestSeller?.name} al contado por $${amount.toLocaleString()}!`,
      type: 'transfer_complete',
      data: { player_id: player.id, player_name: player.name, seller_name: latestSeller?.name }
    },
    {
      club_id: player.club_id,
      title: '¡Jugador Vendido!',
      message: `${latestBuyer.name.toUpperCase()} ha pagado la cláusula de $${amount.toLocaleString()} por ${player.name}. El jugador ha sido transferido.`,
      type: 'transfer_complete',
      data: { player_id: player.id, player_name: player.name, buyer_name: latestBuyer.name }
    }
  ])

  // -- PUSH NOTIFICATIONS --
  sendPushToClub(
    buyerClubId,
    '✅ Compra Directa Completada',
    `¡Has fichado a ${player.name} por $${amount.toLocaleString()}!`,
    { type: 'transfer_complete', player_id: player.id }
  )
  sendPushToClub(
    player.club_id,
    '🚨 ¡Clausulazo!',
    `${latestBuyer.name.toUpperCase()} ha pagado la cláusula de $${amount.toLocaleString()} por ${player.name}.`,
    { type: 'transfer_complete', player_id: player.id }
  )

  // -- AUTO NEWS TRIGGER --
  try {
    fetch('/api/news/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        isMarketTrigger: true, 
        marketEvent: 'clausula', 
        textData: `¡BOMBAZO! El club ${latestBuyer.name} (COMPRADOR) ha robado a la estrella ${player.name} de las manos del ${latestSeller?.name} (VENDEDOR) ejecutando su cláusula por $${amount}. El traspaso es OFICIAL.` 
      })
    }).catch(() => {})
  } catch (e) {}

  return true
}

async function executeTransfer(offer: any) {
  const { player, buyer_club, seller_club, amount } = offer

  // 1. Validate budget again
  const { data: latestBuyer } = await supabase.from('clubs').select('budget').eq('id', offer.buyer_club_id).single()
  
  if (!latestBuyer || latestBuyer.budget < amount) {
    throw new Error('El club comprador no tiene fondos suficientes para completar esta operación.')
  }

  // 2. Atomic updates
  // A. Subtract from buyer
  await supabase.from('clubs').update({ budget: latestBuyer.budget - amount }).eq('id', offer.buyer_club_id)

  // B. Add to seller
  const { data: latestSeller } = await supabase.from('clubs').select('budget').eq('id', offer.seller_club_id).single()
  await supabase.from('clubs').update({ budget: (latestSeller?.budget || 0) + amount }).eq('id', offer.seller_club_id)

  // C. Move player with new default contract
  await supabase.from('players').update({ 
    club_id: offer.buyer_club_id, 
    is_on_sale: false, 
    sale_price: null,
    // Reset contract for new club
    contract_seasons_left: 3,
    salary: 25000,
    squad_role: 'rotation',
    salary_paid_this_season: false,
    morale: 100,
    wants_to_leave: false,
    contract_status: 'active',
    updated_at: new Date().toISOString()
  }).eq('id', offer.player_id)

  // D. Update offer status
  await supabase.from('market_offers').update({ status: 'accepted' }).eq('id', offer.id)

  // E. Invalidate other pending offers
  await supabase
    .from('market_offers')
    .update({ status: 'cancelled' })
    .eq('player_id', offer.player_id)
    .neq('id', offer.id)
    .eq('status', 'pending')

  // F. Record history
  await supabase.from('market_history').insert({
    player_id: offer.player_id,
    from_club_id: offer.seller_club_id,
    to_club_id: offer.buyer_club_id,
    amount: amount,
    type: 'sale'
  })

  // G. Notify both
  await supabase.from('notifications').insert([
    {
      club_id: offer.buyer_club_id,
      title: 'Fichaje Completado',
      message: `¡Has fichado a ${player.name} de ${offer.seller_club?.name} por $${amount.toLocaleString()}!`,
      type: 'transfer_complete',
      data: { player_id: offer.player_id, player_name: player.name, seller_name: offer.seller_club?.name }
    },
    {
      club_id: offer.seller_club_id,
      title: 'Jugador Vendido',
      message: `Has vendido a ${player.name} a ${offer.buyer_club?.name} por $${amount.toLocaleString()}.`,
      type: 'transfer_complete',
      data: { player_id: offer.player_id, player_name: player.name, buyer_name: offer.buyer_club?.name }
    }
  ])

  // -- PUSH NOTIFICATIONS --
  sendPushToClub(
    offer.buyer_club_id,
    '✅ Fichaje Completado',
    `¡Has fichado a ${player.name} de ${offer.seller_club?.name} por $${amount.toLocaleString()}!`,
    { type: 'transfer_complete', player_id: offer.player_id }
  )
  sendPushToClub(
    offer.seller_club_id,
    '🤝 Traspaso Cerrado',
    `Has vendido a ${player.name} al ${offer.buyer_club?.name} por $${amount.toLocaleString()}.`,
    { type: 'transfer_complete', player_id: offer.player_id }
  )

  // -- AUTO NEWS TRIGGER --
  try {
    fetch('/api/news/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        isMarketTrigger: true, 
        marketEvent: 'transfer', 
        textData: `OFICIAL: El club ${offer.buyer_club?.name} (COMPRADOR) completó la compra de la estrella ${player.name} pagándole $${amount} al ${offer.seller_club?.name} (VENDEDOR). El jugador ya viste su nueva camiseta.` 
      })
    }).catch(() => {})
  } catch (e) {}

  return true
}

/**
 * Aumenta la cláusula de rescisión de un jugador descontando la diferencia del presupuesto del club.
 */
export async function updateReleaseClause(playerId: string, clubId: string, newAmount: number) {
  const { data: player } = await supabase.from('players').select('*').eq('id', playerId).single()
  const { data: club } = await supabase.from('clubs').select('*').eq('id', clubId).single()

  if (!player || !club) throw new Error('Jugador o Club no encontrado')
  if (newAmount <= (player.release_clause || 0)) throw new Error('El nuevo valor debe ser superior al actual')

  const cost = newAmount - (player.release_clause || 0)

  if (club.budget < cost) throw new Error('Presupuesto insuficiente para blindar al jugador')

  await supabase.from('clubs').update({ budget: club.budget - cost }).eq('id', clubId)
  await supabase.from('players').update({ 
    release_clause: newAmount,
    updated_at: new Date().toISOString()
  }).eq('id', playerId)

  return { success: true, cost }
}

/**
 * Inicia o recupera una negociación de cláusula entre un club y un jugador.
 */
export async function startClauseNegotiation(playerId: string, buyerClubId: string) {
  const windowOpen = await isTransferWindowOpen()
  if (!windowOpen) throw new Error('Mercado cerrado')

  const { data: player } = await supabase.from('players').select('is_one_club_man').eq('id', playerId).single()
  if (player?.is_one_club_man) throw new Error('Este jugador es un One Club Man y ha jurado lealtad eterna a sus colores. Es innegociable.')

  const { data: activeSeason } = await supabase.from('seasons').select('id').eq('status', 'active').single()
  if (!activeSeason) throw new Error('No hay temporada activa')

  // Verificar si ya existe una negociación bloqueada o aceptada
  const { data: existing } = await supabase
    .from('clause_negotiations')
    .select('*')
    .eq('player_id', playerId)
    .eq('buyer_club_id', buyerClubId)
    .eq('season_id', activeSeason.id)
    .single()

  if (existing) {
    if (existing.status === 'blocked') throw new Error('El jugador ha rechazado negociar contigo esta temporada.')
    return existing
  }

  // Crear nueva negociación
  const { data: created, error } = await supabase
    .from('clause_negotiations')
    .insert({
      player_id: playerId,
      buyer_club_id: buyerClubId,
      season_id: activeSeason.id,
      status: 'active',
      patience: 100
    })
    .select()
    .single()

  if (error) throw error
  
  // -- DIFUSIÓN DE INTENTO DE CLAUSULAZO --
  try {
    const { data: p } = await supabase.from('players').select('name, club:clubs(name)').eq('id', playerId).single()
    const { data: b } = await supabase.from('clubs').select('name').eq('id', buyerClubId).single()
    
    if (p && b) {
      const title = `🚨 INTENTO DE CLAUSULAZO`
      const body = `El ${b.name} de PIFA está intentando convencer a ${p.name} para activar su cláusula de rescisión y abandonar el ${(p as any).club?.name || 'club'}.`
      
      // Push a todos
      sendPushToAll(title, body, { type: 'market_alert' })
      
      // Generar Noticia con IA
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || ''
      fetch(`${baseUrl}/api/news/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          isMarketTrigger: true, 
          marketEvent: 'interes', 
          textData: `RUMOR: El ${b.name} ha iniciado conversaciones directas con ${p.name} con la intención de pagar su cláusula de blindaje. Se reporta que las negociaciones están en curso.` 
        })
      }).catch(() => {})
    }
  } catch (e) {
    console.error('Error broadcasting clause attempt:', e)
  }

  return created
}

/**
 * Ejecuta el traspaso por cláusula una vez el jugador ha aceptado las condiciones.
 */
export async function transferPlayerByClause(negotiationId: string) {
  const { data: neg, error: negError } = await supabase
    .from('clause_negotiations')
    .select('*, player:players(*), buyer_club:clubs(*)')
    .eq('id', negotiationId)
    .single()

  if (negError || !neg || !neg.deal_terms) throw new Error('Condiciones no válidas')
  
  const player = neg.player as Player
  const buyer = neg.buyer_club as Club
  const amount = player.release_clause || 700000
  const salary = neg.deal_terms.salary

  // Validar presupuesto (cláusula + primer salario)
  if (buyer.budget < (amount + salary)) {
    throw new Error('No tienes presupuesto para pagar la cláusula y el salario acordado.')
  }

  // 1. Pago de cláusula
  // Restar al comprador
  await supabase.from('clubs').update({ budget: buyer.budget - amount }).eq('id', buyer.id)
  
  // Sumar al vendedor
  const { data: seller } = await supabase.from('clubs').select('budget').eq('id', player.club_id).single()
  if (seller) {
    await supabase.from('clubs').update({ budget: seller.budget + amount }).eq('id', player.club_id)
  }

  // 2. Mover jugador y actualizar contrato
  await supabase.from('players').update({
    club_id: buyer.id,
    is_on_sale: false,
    sale_price: null,
    contract_seasons_left: neg.deal_terms.seasons,
    salary: neg.deal_terms.salary,
    squad_role: neg.deal_terms.squad_role,
    salary_paid_this_season: false,
    morale: 100,
    wants_to_leave: false,
    contract_status: 'active',
    updated_at: new Date().toISOString()
  }).eq('id', player.id)

  // 3. Marcar negociación como aceptada
  await supabase.from('clause_negotiations').update({ status: 'accepted' }).eq('id', negotiationId)

  // 4. Limpiar ofertas y registrar historial
  await supabase.from('market_offers').update({ status: 'cancelled' }).eq('player_id', player.id)
  
  await supabase.from('market_history').insert({
    player_id: player.id,
    from_club_id: player.club_id,
    to_club_id: buyer.id,
    amount: amount,
    type: 'sale'
  })

  // 5. Notificar
  await supabase.from('notifications').insert([
    {
      club_id: buyer.id,
      title: '¡Clausulazo Completado!',
      message: `¡Has fichado a ${player.name} pagando su cláusula de $${amount.toLocaleString()}!`,
      type: 'transfer_complete'
    },
    {
      club_id: player.club_id,
      title: 'Perdida por Cláusula',
      message: `${buyer.name.toUpperCase()} ha pagado la cláusula de ${player.name} ($${amount.toLocaleString()}).`,
      type: 'transfer_complete'
    }
  ])

  // -- PUSH --
  sendPushToAll('💣 ¡CLAUSULAZO BOMBA!', `${buyer.name} ha fichado a ${player.name} tras pagar su cláusula.`, { type: 'transfer_complete' })
  sendPushToClub(player.club_id, '🚨 ¡Clausulazo!', `${buyer.name} ha ejecutado la cláusula de ${player.name}. El jugador abandona el club inmediatamente.`, { type: 'transfer_complete' })

  // -- NEWS --
  try {
    fetch('/api/news/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        isMarketTrigger: true, 
        marketEvent: 'clausula', 
        textData: `¡CLAUSULAZO! ${buyer.name} ha pagado la cláusula de $${amount} por ${player.name}. El jugador aceptó las condiciones y abandona el ${seller?.name || 'club'} tras cerrarse la negociación directa.` 
      })
    }).catch(() => {})
  } catch (e) {}

  return { success: true }
}

/**
 * Rescinde el contrato de un jugador pagando el doble de su salario.
 */
export async function firePlayer(playerId: string, clubId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Obtener datos
    const { data: player } = await supabase.from('players').select('*, club:clubs(name, budget)').eq('id', playerId).single()
    if (!player || player.club_id !== clubId) throw new Error('Jugador no encontrado o no pertenece al club')

    const cost = (player.salary || 25000) * 2
    if (player.club.budget < cost) {
      throw new Error(`Presupuesto insuficiente. Rescindir el contrato cuesta $${cost.toLocaleString()} (Salario x2).`)
    }

    // 2. Ejecutar rescisión
    
    // A. Primero intentar liberar al jugador (Este paso suele ser el que falla por RLS)
    const { error: releaseError } = await supabase.from('players').update({
      club_id: null,
      contract_status: 'free_agent',
      wants_to_leave: true, 
      is_on_sale: false,
      sale_price: null,
      salary_paid_this_season: false,
      morale: 20, 
      updated_at: new Date().toISOString()
    }).eq('id', playerId)

    if (releaseError) {
      console.error('Error releasing player:', releaseError)
      if (releaseError.code === '42501') {
        throw new Error('Permiso denegado por la base de datos (RLS). Debes aplicar el script de reparación de permisos SQL.')
      }
      throw new Error(`Error al liberar al jugador: ${releaseError.message}`)
    }

    // B. Si la liberación tuvo éxito, proceder a cobrar al club
    const { error: budgetError } = await supabase.from('clubs').update({ 
      budget: player.club.budget - cost,
      updated_at: new Date().toISOString()
    }).eq('id', clubId)

    if (budgetError) {
      console.error('Error updating budget during release:', budgetError)
      // Nota: En un mundo ideal esto sería una transacción. 
      // Si falla aquí, el jugador queda libre pero el club no pagó.
      throw new Error('El jugador fue liberado pero hubo un error al descontar el presupuesto.')
    }

    // C. Limpiar historial de negociaciones activas
    await supabase.from('clause_negotiations').delete().eq('player_id', playerId)

    // D. Registrar en historial
    const { error: historyError } = await supabase.from('market_history').insert({
      player_id: playerId,
      from_club_id: clubId,
      to_club_id: null,
      amount: cost,
      type: 'release'
    })

    if (historyError) console.warn('History log error:', historyError)

    // 3. Notificaciones y Difusión
    const title = `🚨 CONTRATO RESCINDIDO`
    const body = `${player.club.name.toUpperCase()} ha despedido a ${player.name} tras pagar una indemnización de $${cost.toLocaleString()}.`
    
    sendPushToAll(title, body, { type: 'market_alert' })
    
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || ''
      fetch(`${baseUrl}/api/news/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          isMarketTrigger: true, 
          marketEvent: 'rescindid', 
          textData: `BOMBA: El club ${player.club.name} ha decidido DESPEDIR a ${player.name}. El club ha pagado $${cost} para rescindir su contrato unilateralmente. El jugador ahora es agente libre y su moral está por los suelos.` 
        })
      }).catch(() => {})
    } catch (e) {}

    return { success: true }
  } catch (err: any) {
    console.error('Error firing player:', err)
    return { success: false, error: err.message || 'Error desconocido al despedir al jugador' }
  }
}
