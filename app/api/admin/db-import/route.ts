import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { MIGRATION_TABLES } from '@/lib/migration-tables'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const runtime = 'nodejs'

// Restore endpoint. INTENTIONALLY public — there is no admin session to
// authenticate against in the destination project (it's empty). Safety comes
// from migration_count_admins(): once any admin row exists, this endpoint
// refuses to run.
//
// A full export JSON can be tens of MB — way past Vercel's hard ~4.5MB
// serverless request-body limit (a platform limit; can't be raised via Next
// config, hence the 413 "Content Too Large"). So the restore is split into
// three actions the client drives in sequence, each with a small body:
//   'begin' — guard checks, truncate destination, enable replica mode
//   'chunk' — insert one small slice of one table's rows
//   'end'   — restore replication role
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const action = body?.action

    if (action === 'begin') {
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
      try {
        await (supabase as any).rpc('migration_truncate_all')
      } catch (truncateErr) {
        await (supabase as any).rpc('migration_set_replication', { replica: false }).catch(() => {})
        throw truncateErr
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'chunk') {
      const table = body?.table
      const rows = Array.isArray(body?.rows) ? body.rows : null
      if (typeof table !== 'string' || !MIGRATION_TABLES.includes(table) || !rows) {
        return NextResponse.json({ error: 'Chunk inválido' }, { status: 400 })
      }
      if (rows.length === 0) {
        return NextResponse.json({ ok: true, inserted: 0 })
      }
      const { error } = await (supabase.from(table) as any).insert(rows, { defaultToNull: false })
      if (error) {
        return NextResponse.json({ ok: false, inserted: 0, error: error.message })
      }
      return NextResponse.json({ ok: true, inserted: rows.length })
    }

    if (action === 'end') {
      await (supabase as any).rpc('migration_set_replication', { replica: false }).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
  } catch (err: any) {
    console.error('[db-import]', err)
    return NextResponse.json({ error: err?.message || 'Error al importar' }, { status: 500 })
  }
}
