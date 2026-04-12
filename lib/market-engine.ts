import { supabaseAdmin as supabase } from './supabase'
import { MarketOffer, Notification, Player, Club } from './types'
import { sendPushToClub } from './push-notifications'

export async function createOffer(
  player: Player,
  buyerClubId: string,
  amount: number,
  previousOfferId: string | null = null
) {
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

  // C. Move player
  await supabase.from('players').update({ 
    club_id: buyerClubId, 
    is_on_sale: false, 
    sale_price: null 
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

  // C. Move player
  await supabase.from('players').update({ 
    club_id: offer.buyer_club_id, 
    is_on_sale: false, 
    sale_price: null 
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

  return true
}
