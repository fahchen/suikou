/** Stable emoji for a row that has none of its own — a review always, a project
 * until someone picks one. The id never changes, so the same row keeps the same
 * face across reloads and machines without storing anything. */

// The pictographic blocks, taken whole. They are not solid — each holds
// unassigned gaps and text-presentation symbols — so a hit is probed forward to
// the next usable codepoint instead of the blocks being expanded into a list.
// Indexing the raw span (not a filtered list) keeps the mapping the same on
// engines that ship different Unicode versions.
const RANGES: [number, number][] = [
  [0x1f300, 0x1f5ff], // Misc Symbols and Pictographs
  [0x1f600, 0x1f64f], // Emoticons
  [0x1f680, 0x1f6ff], // Transport and Map
  [0x1f900, 0x1f9ff], // Supplemental Symbols and Pictographs
  [0x1fa70, 0x1faff], // Symbols and Pictographs Extended-A
]

const SPAN = RANGES.reduce((total, [lo, hi]) => total + (hi - lo + 1), 0)

/** Colour by default, and a whole emoji on its own — this drops the skin-tone
 * and hair modifiers, which render as a lone swatch or tuft. */
const PRESENTATION = /\p{Emoji_Presentation}/u
const COMPONENT = /\p{Emoji_Component}/u

/** FNV-1a 32-bit: a few lines, no dependency, and spreads adjacent ids (UUIDs
 * that differ in one character) across the whole span. */
export function hashEmoji(id: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  const start = (hash >>> 0) % SPAN
  for (let step = 0; step < SPAN; step++) {
    const char = String.fromCodePoint(codePointAt((start + step) % SPAN))
    if (PRESENTATION.test(char) && !COMPONENT.test(char)) return char
  }
  return "🌱"
}

/** Walk the ranges as one flat index space. */
function codePointAt(index: number): number {
  let left = index
  for (const [lo, hi] of RANGES) {
    const size = hi - lo + 1
    if (left < size) return lo + left
    left -= size
  }
  return RANGES[0][0]
}
