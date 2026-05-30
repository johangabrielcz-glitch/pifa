'use client'

import { useEffect } from 'react'

/**
 * Recovers from Next.js "ChunkLoadError" / "Failed to load chunk" failures.
 *
 * These happen after a new deployment: a tab that loaded the previous build
 * tries to lazily fetch a code-split chunk (e.g. from next/dynamic) whose
 * hashed filename no longer exists in the new deployment → 404. The standard
 * recovery is to reload once so the browser fetches the fresh HTML + chunk map.
 *
 * Failures usually surface as an unhandled promise rejection (the dynamic
 * import() rejecting) or a window error event, so we listen for both. A short
 * sessionStorage guard prevents reload loops if a chunk is genuinely gone.
 */
const RELOAD_KEY = 'pifa_chunk_reloaded_at'
const RELOAD_COOLDOWN_MS = 10_000

const CHUNK_ERROR_RE =
  /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to load chunk|Loading CSS chunk|error loading dynamically imported module|Importing a module script failed|dynamically imported module/i

function looksLikeChunkError(value: unknown): boolean {
  if (!value) return false
  if (typeof value === 'string') return CHUNK_ERROR_RE.test(value)
  const anyVal = value as { name?: string; message?: string }
  return CHUNK_ERROR_RE.test(`${anyVal.name ?? ''} ${anyVal.message ?? ''}`)
}

export function reloadForChunkError(): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return // already tried recently → avoid loop
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // sessionStorage may be unavailable; reload anyway
  }
  window.location.reload()
}

export function ChunkReloadHandler() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (looksLikeChunkError(e?.message) || looksLikeChunkError(e?.error)) reloadForChunkError()
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      if (looksLikeChunkError(e?.reason)) reloadForChunkError()
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}

export { looksLikeChunkError }
