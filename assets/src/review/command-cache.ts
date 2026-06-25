// Synchronous localStorage cache for `load_*` command replies. A forced reload
// (iOS Safari evicting a backgrounded tab) paints the last-good reply on the
// first frame, then the command revalidates in the background — stale-while-
// revalidate, so there's no skeleton flash between the cached and fresh render.
//
// `BUSTER` is the data-shape version: bump it whenever a cached reply's shape
// changes so deployed clients drop old entries instead of rendering them wrong.
const BUSTER = "v1"

interface Entry<T> {
  buster: string
  data: T
}

export function readCommandCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const entry = JSON.parse(raw) as Entry<T>
    return entry.buster === BUSTER ? entry.data : null
  } catch {
    return null
  }
}

export function writeCommandCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ buster: BUSTER, data } satisfies Entry<T>))
  } catch {
    // Quota or serialization failure: skip the cache; the command still revalidates.
  }
}
