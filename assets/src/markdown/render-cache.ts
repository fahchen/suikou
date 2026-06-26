import { openDB, type IDBPDatabase } from "idb"

// Persistent, content-hash-keyed cache for a view's final render output —
// markdown `RenderedBlock[]` or raw `ThemedToken[][]` — backing an in-memory
// map. Survives a full reload (iOS Safari evicting a backgrounded tab) so a
// revisit paints directly, skipping both parse and tokenization. Keyed by
// content_hash only (tokenization is theme-independent, so one entry serves
// every theme), so changed content never reads a stale entry. Bump BUSTER when a
// stored shape changes.
const DB_NAME = "suikou-highlight"
const STORE = "render"
// v2: keys dropped the theme component and token colours became `var(--shiki-*)`.
// v3: force-drop any stale entries cached by a pre-fix build.
const BUSTER = "v3"
// ponytail: global count cap, oldest-first overflow; per-key LRU if it matters.
const MAX_ENTRIES = 400

interface Row {
  value: unknown
  ts: number
}

const memory = new Map<string, unknown>()
let dbp: Promise<IDBPDatabase> | null = null

function db(): Promise<IDBPDatabase> {
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade: (d) => {
        d.createObjectStore(STORE)
      }
    })
  }
  return dbp
}

const namespaced = (key: string) => `${BUSTER}|${key}`

/**
 * In-memory hit for `key` from this session, or undefined. Synchronous so a hook
 * can seed initial state with the cached render and skip the plain-content flash.
 */
export function peekCached<T>(key: string): T | undefined {
  return memory.get(key) as T | undefined
}

/**
 * Cached value for `key`: memory first, then IndexedDB (which warms memory on a
 * hit). Undefined when absent or IndexedDB is unusable.
 */
export async function loadCached<T>(key: string): Promise<T | undefined> {
  const hit = memory.get(key)
  if (hit !== undefined) return hit as T

  try {
    const row = (await (await db()).get(STORE, namespaced(key))) as Row | undefined
    if (row === undefined) return undefined
    memory.set(key, row.value)
    return row.value as T
  } catch {
    return undefined
  }
}

/** Caches `value` for `key` in memory and IndexedDB, trimming the store to cap. */
export async function saveCached<T>(key: string, value: T): Promise<void> {
  memory.set(key, value)
  try {
    const d = await db()
    await d.put(STORE, { value, ts: Date.now() } satisfies Row, namespaced(key))
    await prune(d)
  } catch {
    // IndexedDB unavailable (private mode, quota): keep the in-memory entry only.
  }
}

// Bound the store: on overflow drop the oldest entries by write time.
// getAllKeys/getAll return in matching key order, so they zip by index.
async function prune(d: IDBPDatabase): Promise<void> {
  const keys = await d.getAllKeys(STORE)
  if (keys.length <= MAX_ENTRIES) return

  const rows = (await d.getAll(STORE)) as Row[]
  const victims = keys
    .map((key, i) => ({ key, ts: rows[i]?.ts ?? 0 }))
    .sort((a, b) => a.ts - b.ts)
    .slice(0, keys.length - MAX_ENTRIES)

  const tx = d.transaction(STORE, "readwrite")
  await Promise.all(victims.map(({ key }) => tx.store.delete(key)))
  await tx.done
}
