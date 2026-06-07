import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { MIGRATION_TABLES, IMAGE_COLUMNS } from '@/lib/migration-tables'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Admin-only: dumps every row of every PIFA table to a single JSON the user
// downloads. The destination project will accept this JSON in /api/admin/db-import.
export async function POST(req: NextRequest) {
  try {
    // Light guard. The session is in localStorage on the client, so the page
    // forwards the parsed role here. Real protection is service-role only on
    // the server.
    const role = req.headers.get('x-admin-role')
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Solo admin puede exportar' }, { status: 403 })
    }

    const tables: Record<string, any[]> = {}
    const tableCounts: Record<string, number> = {}
    const errors: { table: string; error: string }[] = []
    const imageUrls = new Set<string>()
    const imageCols = new Map<string, string[]>()
    for (const c of IMAGE_COLUMNS) {
      const arr = imageCols.get(c.table) || []
      arr.push(c.column)
      imageCols.set(c.table, arr)
    }

    for (const table of MIGRATION_TABLES) {
      try {
        const rows: any[] = []
        // Paginate in chunks of 1000 to avoid hitting row-limit defaults on
        // large tables (matches, market_history…).
        let from = 0
        const size = 1000
        while (true) {
          const { data, error } = await supabase
            .from(table)
            .select('*')
            .range(from, from + size - 1)
          if (error) throw error
          if (!data || data.length === 0) break
          rows.push(...data)
          if (data.length < size) break
          from += size
        }
        tables[table] = rows
        tableCounts[table] = rows.length

        // Harvest image URLs from known columns.
        const cols = imageCols.get(table)
        if (cols) {
          for (const row of rows) {
            for (const col of cols) {
              const url = (row as any)[col]
              if (url && typeof url === 'string') imageUrls.add(url)
            }
          }
        }
      } catch (err: any) {
        // A missing table on the source shouldn't kill the whole export.
        errors.push({ table, error: err?.message || String(err) })
        tables[table] = []
        tableCounts[table] = 0
      }
    }

    return NextResponse.json({
      exported_at: new Date().toISOString(),
      source_url: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
      table_counts: tableCounts,
      image_urls: Array.from(imageUrls),
      tables,
      errors,
    })
  } catch (err: any) {
    console.error('[db-export]', err)
    return NextResponse.json({ error: err?.message || 'Error al exportar' }, { status: 500 })
  }
}
