import type { ReviewStructure } from "./use-review-structure"

export type DiffRefs = NonNullable<ReviewStructure["refs"]>

/** Whether a git_diff side's creation SHA differs from its currently-resolved
 * SHA. A missing current SHA does not count as a move — that is the branch
 * deleted case. */
function sideMoved(creation: string | null, current: string | null): boolean {
  return creation !== null && current !== null && creation !== current
}

/** Either side's creation SHA still exists but no longer resolves — the branch
 * was deleted since the review was created. */
export function refsBranchDeleted(refs: DiffRefs): boolean {
  const baseGone = refs.creation_base_sha !== null && refs.base_sha === null
  const headGone = refs.creation_head_sha !== null && refs.head_sha === null
  return baseGone || headGone
}

/** True iff a side moved and neither side vanished. Vanished takes priority so
 * "branch deleted" is never masked by the softer "refs moved" state. */
export function refsMoved(refs: DiffRefs): boolean {
  if (refsBranchDeleted(refs)) return false
  return refs.refs_moved || sideMoved(refs.creation_base_sha, refs.base_sha) ||
    sideMoved(refs.creation_head_sha, refs.head_sha)
}

export function shortSha(sha: string | null): string | null {
  return sha ? sha.slice(0, 7) : null
}

/** `ref@sha` label for one side of a diff. Falls back to the creation SHA when
 * the branch is gone, and to the ref name alone when no SHA is known. */
export function formatRefLabel(
  ref: string | null,
  currentSha: string | null,
  creationSha: string | null
): string {
  const short = shortSha(currentSha) ?? shortSha(creationSha)
  if (ref === null) return short ?? "–"
  if (short === null) return ref
  return `${ref}@${short}`
}

/** `base@sha..head@sha`, ready for the workspace breadcrumb. */
export function formatRefsRange(refs: DiffRefs): string {
  const base = formatRefLabel(refs.base_ref, refs.base_sha, refs.creation_base_sha)
  const head = formatRefLabel(refs.head_ref, refs.head_sha, refs.creation_head_sha)
  return `${base}..${head}`
}

/** Human tooltip explaining which sides moved and by how much. */
export function formatMovedTitle(refs: DiffRefs): string {
  const parts: string[] = []
  if (sideMoved(refs.creation_base_sha, refs.base_sha)) {
    parts.push(`base ${shortSha(refs.creation_base_sha)} → ${shortSha(refs.base_sha)}`)
  }
  if (sideMoved(refs.creation_head_sha, refs.head_sha)) {
    parts.push(`head ${shortSha(refs.creation_head_sha)} → ${shortSha(refs.head_sha)}`)
  }
  return parts.length === 0 ? "Refs moved since this review was created" : parts.join("; ")
}

/** Which side of the diff vanished, if any — for the banner copy. */
export function vanishedSide(refs: DiffRefs): "base" | "head" | "both" | null {
  const baseGone = refs.creation_base_sha !== null && refs.base_sha === null
  const headGone = refs.creation_head_sha !== null && refs.head_sha === null
  if (baseGone && headGone) return "both"
  if (baseGone) return "base"
  if (headGone) return "head"
  return null
}
