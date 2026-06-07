import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { IMAGE_COLUMNS, STORAGE_BUCKET } from '@/lib/migration-tables'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300 // images can be slow

// Admin-only. After a DB import, this scans the columns that hold absolute
// Storage URLs (clubs.shield_url, players.photo_url, ...) and for any URL that
// does NOT live in the current project's storage host, downloads the file from
// the source and re-uploads it to this project's pifa-assets bucket, then
// rewrites the column in place.
//
// Requires the old project to still be reachable (its public URLs respond).

const FETCH_RETRIES = 3

function currentStorageHost(): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  return base ? `${base}/storage/v1/object/public/` : ''
}

async function fetchWithRetry(url: string): Promise<Blob | null> {
  for (let i = 0; i < FETCH_RETRIES; i++) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (res.ok) return await res.blob()
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 300 * (i + 1)))
  }
  return null
}

function extFromUrl(url: string): string {
  const clean = url.split('?')[0]
  const m = clean.match(/\.([a-zA-Z0-9]{2,5})$/)
  return m ? m[1].toLowerCase() : 'bin'
}

export async function POST(req: NextRequest) {
  try {
    const role = req.headers.get('x-admin-role')
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Solo admin puede migrar imágenes' }, { status: 403 })
    }

    const localHost = currentStorageHost()
    if (!localHost) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_SUPABASE_URL no configurada' }, { status: 500 })
    }

    // Cache: same old URL → same new URL even when it appears in many rows.
    const cache = new Map<string, string>()
    const failed: { url: string; reason: string }[] = []
    let migrated = 0

    for (const { table, column } of IMAGE_COLUMNS) {
      const { data, error } = await supabase
        .from(table)
        .select(`id, ${column}`)
        .not(column, 'is', null)
      if (error) {
        failed.push({ url: `${table}.${column}`, reason: `read: ${error.message}` })
        continue
      }
      const rows = (data as any[]) || []
      for (const row of rows) {
        const oldUrl: string = row[column]
        if (!oldUrl || typeof oldUrl !== 'string') continue
        // Already pointing to the local project — skip.
        if (oldUrl.startsWith(localHost)) continue

        let newUrl = cache.get(oldUrl)
        if (!newUrl) {
          const blob = await fetchWithRetry(oldUrl)
          if (!blob) {
            failed.push({ url: oldUrl, reason: 'fetch failed' })
            continue
          }
          const ext = extFromUrl(oldUrl)
          const path = `migrated/${Math.random().toString(36).slice(2)}-${Date.now()}.${ext}`
          const { error: upErr } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(path, blob, { upsert: true, contentType: blob.type || `image/${ext}` })
          if (upErr) {
            failed.push({ url: oldUrl, reason: `upload: ${upErr.message}` })
            continue
          }
          const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
          newUrl = pub.publicUrl
          cache.set(oldUrl, newUrl)
        }

        const { error: updErr } = await (supabase.from(table) as any)
          .update({ [column]: newUrl })
          .eq('id', row.id)
        if (updErr) {
          failed.push({ url: oldUrl, reason: `update ${table}: ${updErr.message}` })
          continue
        }
        migrated++
      }
    }

    return NextResponse.json({ migrated, unique: cache.size, failed })
  } catch (err: any) {
    console.error('[storage-migrate]', err)
    return NextResponse.json({ error: err?.message || 'Error al migrar imágenes' }, { status: 500 })
  }
}
