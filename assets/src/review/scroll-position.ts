import type { DocView } from "../stores/ui-store"

// Single localStorage entry holding every remembered single-file scroll offset,
// so the page lands where the reviewer left off after a file switch or a hard
// reload. Rendered and raw views have different content heights, so each gets
// its own key (`${artifactId}:${view}`). Kept as one flat map under one key —
// entries are never pruned (one number per file/view is tiny); revisit if a
// huge multi-file review ever makes the map worth trimming.
const STORAGE_KEY = "suikou-scroll-positions"

type OffsetMap = Record<string, number>

/** Storage key for a file's scroll offset in a given view. */
export function scrollPositionKey(artifactId: string, view: DocView): string {
  return `${artifactId}:${view}`
}

/** The saved scroll offset for a key, or null when none is stored. */
export function loadScrollOffset(key: string): number | null {
  const value = readMap()[key]
  return typeof value === "number" && value > 0 ? value : null
}

/** Persist a scroll offset for a key; a non-positive offset clears the entry. */
export function saveScrollOffset(key: string, offset: number): void {
  const map = readMap()
  if (offset > 0) map[key] = Math.round(offset)
  else if (key in map) delete map[key]
  else return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Storage full or unavailable (private mode): scroll memory is best-effort.
  }
}

function readMap(): OffsetMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === "object") return parsed as OffsetMap
  } catch {
    // Corrupt JSON — start from an empty map rather than throwing.
  }
  return {}
}
