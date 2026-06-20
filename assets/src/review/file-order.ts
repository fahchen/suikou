import type { ReviewFileEntry } from "./types"

/**
 * Canonical review-file order: a flat list sorted by full path. Every file-list
 * surface (switcher, all-files stack, board card) renders this same order so
 * what you see, step through, and open all line up.
 *
 * ## Examples
 *
 *     orderedReviewFiles([{ path: "src/b.ts" }, { path: "a.ts" }])
 *     //=> [{ path: "a.ts" }, { path: "src/b.ts" }]
 */
export function orderedReviewFiles(
  files: ReadonlyArray<ReviewFileEntry>
): ReviewFileEntry[] {
  return [...files].sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * Returns the files immediately before/after the one matching `artifactId` in
 * canonical order. Yields `null` at each end, or for both when the artifact
 * isn't in the list (so callers can simply disable the corresponding control).
 *
 * ## Examples
 *
 *     adjacentReviewFiles(files, "art-2")
 *     //=> { prev: <entry art-1>, next: <entry art-3> }
 */
export function adjacentReviewFiles(
  files: ReadonlyArray<ReviewFileEntry>,
  artifactId: string
): { prev: ReviewFileEntry | null; next: ReviewFileEntry | null } {
  const ordered = orderedReviewFiles(files)
  const index = ordered.findIndex((f) => f.artifact_id === artifactId)
  if (index === -1) return { prev: null, next: null }
  return {
    prev: index > 0 ? ordered[index - 1] : null,
    next: index < ordered.length - 1 ? ordered[index + 1] : null
  }
}
