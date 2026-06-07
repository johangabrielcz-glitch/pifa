import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { MIGRATION_TABLES } from '@/lib/migration-tables'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Allow larger bodies — a full export can be several MB.
export const runtime = 'nodejs'

// Restore endpoint. INTENTIONALLY public — there is no admin session to
// authenticate against in the destination project (it's empty). Safety comes
// from migration_count_admins(): once any admin row exists, this endpoint
// refuses to run.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const dump = body?.dump
    if (!dump || typeof dump !== 'object' || !dump.tables || typeof dump.tables !== 'object') {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }
    if (!Array.isArray(dump.tables.users) || !Array.isArray(dump.tables.clubs)) {
      return NextResponse.json({ error: 'El export no contiene users/clubs' }, { status: 400 })
    }

    // Guard: refuse if destination already has any admin/moderator.
    const { data: countRes, error: countErr } = await (supabase as any).rpc('migration_count_admins')
    if (countErr) {
      return NextResponse.json({
        error: 'Faltan los helpers de migración en la DB. Ejecuta schema.sql primero.',
        details: countErr.message,
      }, { status: 500 })
    }
    const count = typeof countRes === 'number' ? countRes : Number(countRes ?? 0)
    if (count > 0) {
      return NextResponse.json({ error: 'Destino no vacío: ya existen administradores' }, { status: 403 })
    }

    // Bypass FK checks for the duration of the restore.
    await (supabase as any).rpc('migration_set_replication', { replica: true })
    await (supabase as any).rpc('migration_truncate_all')

    const tableCounts: Record<string, number> = {}
    const errors: { table: string; error: string }[] = []

    try {
      for (const table of MIGRATION_TABLES) {
        const rows: any[] = (dump.tables[table] as any[]) || []
        if (rows.length === 0) {
          tableCounts[table] = 0
          continue
        }
        // Chunk inserts to keep payloads manageable on the wire.
        const chunkSize = 500
        let inserted = 0
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize)
          const { error } = await (supabase.from(table) as any).insert(chunk, { defaultToNull: false })
          if (error) {
            errors.push({ table, error: error.message })
            // Keep going so the rest still imports; truncated rows can be retried.
            break
          }
          inserted += chunk.length
        }
        tableCounts[table] = inserted
      }
    } finally {
      // Always restore the replication role even if something blew up.
      await (supabase as any).rpc('migration_set_replication', { replica: false }).catch(() => {})
    }

    return NextResponse.json({ ok: errors.length === 0, table_counts: tableCounts, errors })
  } catch (err: any) {
    console.error('[db-import]', err)
    return NextResponse.json({ error: err?.message || 'Error al importar' }, { status: 500 })
  }
}
