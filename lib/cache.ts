/**
 * In-memory session cache with TTL. Used to avoid refetching low-frequency data
 * (season state, transfer window, global clubs list) on every navigation.
 *
 * The cache lives in memory only (no localStorage / sessionStorage), so it
 * resets on hard refresh. Call invalidate() on logout to clear cross-account.
 */

interface Entry<T> {
  value: T
  expiresAt: number
}

const store = new Map<string, Entry<any>>()
const inflight = new Map<string, Promise<any>>()

const DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Memoize an async function by key. Cached results expire after ttlMs.
 * Concurrent calls with the same key share a single in-flight promise so we
 * don't fire duplicate requests during a render storm.
 */
export async function memoized<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL
): Promise<T> {
  const now = Date.now()
  const cached = store.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.value as T
  }

  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>

  const promise = fn()
    .then(value => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs })
      return value
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}

/**
 * Clear all cache entries (no prefix) or only those starting with `prefix`.
 * Use on logout or when the user performs an action that may invalidate data
 * (e.g. accepting an offer should bust the season/transfer-window cache).
 */
export function invalidate(prefix?: string) {
  if (!prefix) {
    store.clear()
    return
  }
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}
