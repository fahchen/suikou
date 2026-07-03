import type { ReviewStructure } from "./use-review-structure"
import type { ReviewSnapshot } from "./types"

/** Review-scoped rollup of the post-resnapshot signals (A10): how many files'
 * bytes shifted since the round was minted, and how many published comment
 * anchors drifted to a fuzzy match. Pure — derives from already-live state
 * (structure's disk `content_hash` vs the round's snapshotted hash, plus the
 * per-comment `drifted` flag), so no extra server call is needed. */
export interface ResnapshotSummary {
  filesChanged: number
  driftedAnchors: number
}

export function resnapshotSummary(
  structure: ReviewStructure,
  files: ReviewSnapshot["body"]["files"],
): ResnapshotSummary {
  const entryByPath = new Map(structure.files.map((f) => [f.path, f]))
  let filesChanged = 0
  let driftedAnchors = 0
  for (const file of files) {
    const entry = entryByPath.get(file.path)
    const diskHash = entry?.content_hash ?? null
    const roundHash = file.current_round.content_hash ?? null
    if (diskHash && roundHash && diskHash !== roundHash) filesChanged += 1
    for (const c of file.comments.items) {
      if (c.status === "published" && c.drifted) driftedAnchors += 1
    }
  }
  return { filesChanged, driftedAnchors }
}
