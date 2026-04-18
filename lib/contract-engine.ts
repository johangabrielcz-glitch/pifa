import { supabaseAdmin as supabase } from './supabase'
import { Player, Club, Season } from './types'
import { sendPushToClub, sendPushToAll } from './push-notifications'

// =============================================
// CONTRACT ENGINE — Salarios, Contratos, Ventana de Mercado
// =============================================

/**
 * Verifica si un jugador puede ser utilizado para partidos.
 * Requiere: salario pagado, contrato activo, y que no quiera irse.
 */
export function canUsePlayer(player: Player): { available: boolean; reason: string | null } {
  if (player.wants_to_leave) {
    return { available: false, reason: 'En busca de equipo' }
  }
  if (player.contract_status === 'free_agent') {
    return { available: false, reason: 'Agente libre' }
  }
  if (player.contract_status === 'renewal_pending') {
    return { available: false, reason: 'Renovación pendiente' }
  }
  if (!player.salary_paid_this_season) {
    return { available: false, reason: 'Salario impago' }
  }
  return { available: true, reason: null }
}

/**
 * Obtiene el estado actual de la temporada (si hay activa y si la ventana está abierta)
 */
export async function getSeasonState(): Promise<{
  hasActiveSeason: boolean
  activeSeason: Season | null
  transferWindowOpen: boolean
  isPreseason: boolean
}> {
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('*')
    .eq('status', 'active')
    .single()

  if (activeSeason) {
    return {
      hasActiveSeason: true,
      activeSeason: activeSeason as Season,
      transferWindowOpen: (activeSeason as Season).transfer_window_open ?? false,
      isPreseason: false
    }
  }

  // No hay temporada activa — verificar si existe alguna en draft (pretemporada)
  const { data: draftSeasons } = await supabase
    .from('seasons')
    .select('*')
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1)

  const draftSeason = draftSeasons?.[0] as Season | undefined

  return {
    hasActiveSeason: false,
    activeSeason: null,
    transferWindowOpen: draftSeason ? draftSeason.transfer_window_open ?? false : false,
    isPreseason: true
  }
}

/**
 * Paga el salario de un jugador individual. Descuenta del budget del club.
 */
export async function paySalary(playerId: string, clubId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Obtener jugador y club
    const [playerRes, clubRes] = await Promise.all([
      supabase.from('players').select('*').eq('id', playerId).eq('club_id', clubId).single(),
      supabase.from('clubs').select('*').eq('id', clubId).single()
    ])

    const player = playerRes.data as Player | null
    const club = clubRes.data as Club | null

    if (!player || !club) return { success: false, error: 'Jugador o club no encontrado' }
    if (player.salary_paid_this_season) return { success: false, error: 'Salario ya pagado esta temporada' }
    if (player.contract_status === 'free_agent') return { success: false, error: 'El jugador es agente libre' }
    if (player.wants_to_leave) return { success: false, error: 'El jugador está en busca de equipo' }

    const salary = player.salary ?? 25000
    if (club.budget < salary) {
      return { success: false, error: `Presupuesto insuficiente. Necesitas $${salary.toLocaleString()} y tienes $${club.budget.toLocaleString()}` }
    }

    // 2. Descontar salario del budget y marcar como pagado (operaciones atómicas secuenciales)
    const { error: budgetError } = await supabase
      .from('clubs')
      .update({ budget: club.budget - salary, updated_at: new Date().toISOString() })
      .eq('id', clubId)

    if (budgetError) throw budgetError

    const { error: playerError } = await supabase
      .from('players')
      .update({ salary_paid_this_season: true, updated_at: new Date().toISOString() })
      .eq('id', playerId)

    if (playerError) throw playerError

    return { success: true }
  } catch (err: any) {
    console.error('Error paying salary:', err)
    return { success: false, error: err.message || 'Error al pagar salario' }
  }
}

/**
 * Paga TODOS los salarios pendientes de un club. Falla parcialmente si no hay suficiente budget.
 */
export async function payAllSalaries(clubId: string): Promise<{ success: boolean; paid: number; failed: number; error?: string }> {
  try {
    // 1. Obtener club y jugadores con salario pendiente
    const [clubRes, playersRes] = await Promise.all([
      supabase.from('clubs').select('*').eq('id', clubId).single(),
      supabase.from('players').select('*')
        .eq('club_id', clubId)
        .eq('salary_paid_this_season', false)
        .eq('wants_to_leave', false)
        .in('contract_status', ['active', 'renewal_pending'])
    ])

    const club = clubRes.data as Club | null
    const players = (playersRes.data as Player[]) || []

    if (!club) return { success: false, paid: 0, failed: 0, error: 'Club no encontrado' }
    if (players.length === 0) return { success: true, paid: 0, failed: 0 }

    let budget = club.budget
    let paid = 0
    let failed = 0
    const paidIds: string[] = []

    // 2. Pagar en orden de salario (más baratos primero para maximizar pagos)
    const sorted = [...players].sort((a, b) => (a.salary ?? 25000) - (b.salary ?? 25000))

    for (const player of sorted) {
      const salary = player.salary ?? 25000
      if (budget >= salary) {
        budget -= salary
        paidIds.push(player.id)
        paid++
      } else {
        failed++
      }
    }

    // 3. Actualizar en batch
    if (paidIds.length > 0) {
      await supabase
        .from('players')
        .update({ salary_paid_this_season: true, updated_at: new Date().toISOString() })
        .in('id', paidIds)

      await supabase
        .from('clubs')
        .update({ budget, updated_at: new Date().toISOString() })
        .eq('id', clubId)
    }

    return { success: true, paid, failed }
  } catch (err: any) {
    console.error('Error paying all salaries:', err)
    return { success: false, paid: 0, failed: 0, error: err.message || 'Error al pagar salarios' }
  }
}

/**
 * Decrementa en 1 la duración del contrato de TODOS los jugadores.
 * Los que llegan a 0 → contract_status = 'renewal_pending'.
 * Llamar al FINALIZAR una temporada.
 */
export async function decrementContracts(seasonId: string): Promise<{ success: boolean; expired: number; error?: string }> {
  try {
    // Verificar que no se haya decrementado ya para esta temporada
    const { data: season } = await supabase
      .from('seasons')
      .select('contracts_decremented')
      .eq('id', seasonId)
      .single()

    if ((season as any)?.contracts_decremented) {
      return { success: true, expired: 0, error: 'Contratos ya decrementados para esta temporada' }
    }

    // 1. Obtener todos los jugadores con contrato activo
    const { data: allPlayers } = await supabase
      .from('players')
      .select('id, contract_seasons_left, contract_status, club_id, name')
      .in('contract_status', ['active', 'renewal_pending'])

    if (!allPlayers || allPlayers.length === 0) {
      await supabase.from('seasons').update({ contracts_decremented: true }).eq('id', seasonId)
      return { success: true, expired: 0 }
    }

    let expired = 0

    // 2. Decrementar cada jugador
    for (const player of allPlayers) {
      const newSeasons = Math.max(0, (player.contract_seasons_left ?? 1) - 1)
      
      if (newSeasons === 0) {
        // Contrato expirado → renewal_pending
        await supabase.from('players').update({
          contract_seasons_left: 0,
          contract_status: 'renewal_pending',
          updated_at: new Date().toISOString()
        }).eq('id', player.id)
        expired++

        // Notificar al club
        if (player.club_id) {
          await supabase.from('notifications').insert({
            club_id: player.club_id,
            title: '📋 Contrato Expirado',
            message: `El contrato de ${player.name} ha expirado. Debe ser renovado o quedará como agente libre.`,
            type: 'contract_expired',
            data: { player_id: player.id, player_name: player.name }
          })
        }
      } else {
        await supabase.from('players').update({
          contract_seasons_left: newSeasons,
          updated_at: new Date().toISOString()
        }).eq('id', player.id)
      }
    }

    // 3. Marcar temporada como decrementada
    await supabase.from('seasons').update({ 
      contracts_decremented: true,
      transfer_window_open: false, // Cerrar mercado al finalizar
      updated_at: new Date().toISOString() 
    }).eq('id', seasonId)

    // 4. Resetear pagos de salarios para el próximo ciclo
    await resetSalaryPayments()

    return { success: true, expired }
  } catch (err: any) {
    console.error('Error decrementing contracts:', err)
    return { success: false, expired: 0, error: err.message }
  }
}

/**
 * Revierte el decremento de contratos (cuando se BORRA una temporada que ya fue finalizada).
 * Incrementa en 1 el contrato de todos los jugadores.
 * Reestablece renewal_pending → active para los que tenían 0.
 */
export async function revertContractDecrement(seasonId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: season } = await supabase
      .from('seasons')
      .select('contracts_decremented')
      .eq('id', seasonId)
      .single()

    if (!(season as any)?.contracts_decremented) {
      // Nunca se decrementaron, solo resetear pagos
      return { success: true }
    }

    // Incrementar contratos de todos los jugadores en 1
    const { data: allPlayers } = await supabase
      .from('players')
      .select('id, contract_seasons_left, contract_status')
      .in('contract_status', ['active', 'renewal_pending'])

    if (allPlayers) {
      for (const player of allPlayers) {
        const wasExpired = player.contract_status === 'renewal_pending' && player.contract_seasons_left === 0
        await supabase.from('players').update({
          contract_seasons_left: (player.contract_seasons_left ?? 0) + 1,
          contract_status: wasExpired ? 'active' : player.contract_status,
          updated_at: new Date().toISOString()
        }).eq('id', player.id)
      }
    }

    return { success: true }
  } catch (err: any) {
    console.error('Error reverting contract decrement:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Resetea todos los pagos de salario (salary_paid_this_season = false).
 * Llamar al eliminar una temporada.
 */
export async function resetSalaryPayments(): Promise<{ success: boolean; error?: string }> {
  try {
    await supabase
      .from('players')
      .update({ salary_paid_this_season: false, updated_at: new Date().toISOString() })
      .eq('salary_paid_this_season', true)

    return { success: true }
  } catch (err: any) {
    console.error('Error resetting salary payments:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Alterna la ventana de transferencias para una temporada.
 */
export async function toggleTransferWindow(seasonId: string, open: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('seasons')
      .update({ transfer_window_open: open, updated_at: new Date().toISOString() })
      .eq('id', seasonId)

    if (error) throw error

    // Notificar a todos los clubes
    const message = open ? '🟢 La ventana de fichajes está ABIERTA. ¡Negocia tus traspasos!' : '🔴 La ventana de fichajes se ha CERRADO.'
    const { data: clubs } = await supabase.from('clubs').select('id')
    if (clubs) {
      for (const club of clubs) {
        await supabase.from('notifications').insert({
          club_id: club.id,
          title: open ? '📢 Mercado Abierto' : '📢 Mercado Cerrado',
          message,
          type: 'transfer_window',
          data: { transfer_window: open }
        })
      }
    }

    // Push broadcast
    sendPushToAll(
      open ? '📢 Mercado de Fichajes ABIERTO' : '📢 Mercado de Fichajes CERRADO',
      message
    )

    return { success: true }
  } catch (err: any) {
    console.error('Error toggling transfer window:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Verifica si la ventana de transferencias está abierta.
 */
export async function isTransferWindowOpen(): Promise<boolean> {
  // Buscar cualquier temporada (activa o draft) con ventana abierta
  const { data } = await supabase
    .from('seasons')
    .select('transfer_window_open')
    .in('status', ['active', 'draft'])
    .eq('transfer_window_open', true)
    .limit(1)

  return (data && data.length > 0) ?? false
}

/**
 * Marca a un jugador como "En busca de equipo". Irreversible.
 * Dispara noticia y push a todo el mundo.
 */
export async function markPlayerSeeking(playerId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: player } = await supabase
      .from('players')
      .select('*, club:clubs(*)')
      .eq('id', playerId)
      .single()

    if (!player) return { success: false, error: 'Jugador no encontrado' }

    const p = player as any

    // Marcar como irrevocable
    await supabase.from('players').update({
      wants_to_leave: true,
      contract_status: 'free_agent',
      is_on_sale: false,
      sale_price: null,
      updated_at: new Date().toISOString()
    }).eq('id', playerId)

    // Notificar al club dueño
    if (p.club_id) {
      await supabase.from('notifications').insert({
        club_id: p.club_id,
        title: '⚠️ Jugador quiere irse',
        message: `${p.name} ha decidido buscar otro equipo. Ya no estará disponible para partidos.`,
        type: 'player_seeking_transfer',
        data: { player_id: playerId, player_name: p.name }
      })

      sendPushToClub(
        p.club_id,
        `⚠️ ${p.name} quiere irse`,
        `${p.name} ha declarado que busca un nuevo club. Ya no podrá ser convocado.`
      )
    }

    // Push broadcast al mundo
    const clubName = p.club?.name || 'su club'
    sendPushToAll(
      `🔥 ${p.name} en busca de equipo`,
      `${p.name} ha roto con ${clubName} y busca un nuevo destino.`,
      { type: 'player_seeking_transfer', player_id: playerId }
    )

    // Trigger news
    try {
      fetch('/api/news/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isMarketTrigger: true,
          marketEvent: 'player_seeking',
          textData: `BOMBAZO: La estrella ${p.name} del club ${clubName} (ACTUAL) ha decidido IRSE. Ha declarado públicamente que busca un nuevo destino y no jugará más para el ${clubName}. Su moral está rota y quiere forzar su salida como agente libre.`
        })
      }).catch(() => {})
    } catch (e) {}

    return { success: true }
  } catch (err: any) {
    console.error('Error marking player as seeking:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Ficha un agente libre. Gratis (sin coste de traspaso).
 * Asigna nuevo contrato, salario y rol.
 */
export async function signFreeAgent(
  playerId: string,
  buyerClubId: string,
  salary: number,
  contractSeasons: number,
  role: 'essential' | 'important' | 'rotation'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: player } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .single()

    if (!player) return { success: false, error: 'Jugador no encontrado' }
    const p = player as Player
    if (p.contract_status !== 'free_agent') {
      return { success: false, error: 'El jugador no es agente libre' }
    }

    const oldClubId = p.club_id

    // Transferir jugador al nuevo club con contrato nuevo
    await supabase.from('players').update({
      club_id: buyerClubId,
      contract_seasons_left: contractSeasons,
      salary: salary,
      squad_role: role,
      contract_status: 'active',
      wants_to_leave: false,
      salary_paid_this_season: false,
      morale: 100, // Reset moral al fichar
      is_on_sale: false,
      sale_price: null,
      updated_at: new Date().toISOString()
    }).eq('id', playerId)

    // Registrar en historial
    await supabase.from('market_history').insert({
      player_id: playerId,
      from_club_id: oldClubId,
      to_club_id: buyerClubId,
      amount: 0,
      type: 'free_agent'
    })

    // Notificar al nuevo club
    const { data: buyerClub } = await supabase.from('clubs').select('name').eq('id', buyerClubId).single()
    
    await supabase.from('notifications').insert({
      club_id: buyerClubId,
      title: '✅ Agente Libre Fichado',
      message: `${p.name} se ha unido a tu club como agente libre.`,
      type: 'offer_accepted',
      data: { player_id: playerId, player_name: p.name }
    })

    // Notificar al club anterior
    if (oldClubId && oldClubId !== buyerClubId) {
      await supabase.from('notifications').insert({
        club_id: oldClubId,
        title: '📤 Jugador fichado como agente libre',
        message: `${p.name} ha sido fichado por ${(buyerClub as any)?.name || 'otro club'} como agente libre.`,
        type: 'offer_accepted',
        data: { player_id: playerId, player_name: p.name }
      })
    }

    // Trigger news
    try {
      const buyerName = (buyerClub as any)?.name || 'Un nuevo club'
      fetch('/api/news/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isMarketTrigger: true,
          marketEvent: 'free_agent_signing',
          textData: `FICHAJE: El club ${buyerName} (COMPRADOR) ha fichado al agente libre ${p.name} (ex-jugador sin equipo). Firma por ${contractSeasons} temporadas con un sueldo de $${salary.toLocaleString()}. Refuerzo a coste cero.`
        })
      }).catch(() => {})
    } catch (e) {}

    return { success: true }
  } catch (err: any) {
    console.error('Error signing free agent:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Accepts a promotion demand from a player email.
 * Upgrades their role and salary as requested.
 */
export async function acceptPromotionDemand(emailId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Get the email with action data
    const { data: email, error: emailError } = await supabase
      .from('player_emails')
      .select('*, player:players(id, name, club_id, squad_role, salary, morale)')
      .eq('id', emailId)
      .single()

    if (emailError || !email) throw new Error('Email no encontrado')
    if ((email as any).action_taken) throw new Error('Esta demanda ya fue aceptada')
    if ((email as any).email_type !== 'promotion_demand') throw new Error('Este email no es una demanda de promoción')

    const actionData = (email as any).action_data as { requested_role: string; requested_salary: number }
    if (!actionData) throw new Error('No hay datos de acción')

    const player = (email as any).player
    if (!player) throw new Error('Jugador no encontrado')

    // 2. Update player role + salary + morale boost
    const newMorale = Math.min(100, (player.morale ?? 75) + 10)
    const { error: updateError } = await supabase
      .from('players')
      .update({
        squad_role: actionData.requested_role,
        salary: actionData.requested_salary,
        morale: newMorale,
        updated_at: new Date().toISOString()
      })
      .eq('id', player.id)

    if (updateError) throw updateError

    // 3. Mark email as action taken
    await supabase
      .from('player_emails')
      .update({ action_taken: true })
      .eq('id', emailId)

    return { success: true }
  } catch (err: any) {
    console.error('Error accepting promotion demand:', err)
    return { success: false, error: err.message }
  }
}
