import { NextRequest, NextResponse } from 'next/server'
import { adminTransferPlayer } from '@/lib/market-engine'

export async function POST(req: NextRequest) {
  try {
    const { playerId, toClubId } = await req.json()
    if (!playerId || !toClubId) {
      return NextResponse.json({ error: 'playerId y toClubId requeridos' }, { status: 400 })
    }
    const result = await adminTransferPlayer(playerId, toClubId)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[admin/transfer-player] Error:', err)
    return NextResponse.json({ error: err?.message || 'Error interno' }, { status: 500 })
  }
}
