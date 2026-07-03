import { useMemo } from "react"

import { orderedReviewFiles } from "./file-order"
import { useReviewStructure } from "./use-review-structure"
import type { ReviewFileEntry, ReviewSnapshot, Verdict } from "./types"

/** One file's derived navigator row: its static entry joined with the live
 * comment/verdict counters the list surfaces (badge, blocker, verdict icon). */
export interface NavigatorRow {
  entry: ReviewFileEntry
  verdict: Verdict | null
  commentCount: number
  unresolved: number
  blockers: number
  reviewed: boolean
}

/** Groups + totals shared by the desktop navigator column and the mobile file
 * sheet. Both surfaces render the same rows, grouped NEEDS REVIEW / REVIEWED /
 * SOFT-REMOVED, so this hook owns the whole computation and each surface only
 * lays it out. `filter` is applied case-insensitively against the file path. */
export interface NavigatorModel {
  /** Longest shared directory prefix, trimmed from each row for scannability. */
  commonPrefix: string
  needsReview: NavigatorRow[]
  reviewed: NavigatorRow[]
  softRemoved: NavigatorRow[]
  /** Rows surviving the filter, across every group — for the empty-state guard. */
  filteredCount: number
  total: number
  softRemovedTotal: number
  reviewedCount: number
  commentsThisRound: number
  unresolvedCount: number
  blockerCount: number
  round: number
}

/** Derives the navigator model from the review structure and live snapshot.
 * Kind-agnostic — works for file_selection and git_diff reviews alike. */
export function useNavigatorModel(
  reviewSnapshot: ReviewSnapshot,
  filter: string,
): NavigatorModel {
  const structure = useReviewStructure()
  const live = reviewSnapshot.body.files ?? []
  const round = reviewSnapshot.body.latest_round ?? 0

  return useMemo(() => {
    const ordered = orderedReviewFiles(structure.file_entries)
    const commonPrefix = commonPathPrefix(ordered.map((e) => e.path))

    const rows: NavigatorRow[] = ordered.map((entry) => {
      const liveRow = live.find((f) => f.path === entry.path)
      const verdict = liveRow?.draft_verdict ?? liveRow?.latest_verdict ?? null
      const items = liveRow?.comments?.items ?? []
      const commentCount = items.length
      const unresolved = items.filter((c) => c.status === "pending" || !c.resolved).length
      // Blockers (G8) are unresolved fix_required threads; a single one keeps
      // the review from a clean approve, so the count surfaces on both the file
      // row and the review-level meter.
      const blockers = items.filter(
        (c) => c.critique_type === "fix_required" && (c.status === "pending" || !c.resolved),
      ).length
      return {
        entry,
        verdict,
        commentCount,
        unresolved,
        blockers,
        reviewed: Boolean(verdict),
      }
    })

    const query = filter.trim().toLowerCase()
    const filtered = query
      ? rows.filter((r) => r.entry.path.toLowerCase().includes(query))
      : rows

    const active = filtered.filter((r) => !r.entry.soft_removed)
    const softRemoved = filtered.filter((r) => r.entry.soft_removed)
    const needsReview = active.filter((r) => !r.reviewed)
    const reviewed = active.filter((r) => r.reviewed)

    return {
      commonPrefix,
      needsReview,
      reviewed,
      softRemoved,
      filteredCount: filtered.length,
      total: rows.filter((r) => !r.entry.soft_removed).length,
      softRemovedTotal: rows.filter((r) => r.entry.soft_removed).length,
      reviewedCount: rows.filter((r) => r.reviewed && !r.entry.soft_removed).length,
      commentsThisRound: rows.reduce((acc, r) => acc + r.commentCount, 0),
      unresolvedCount: rows.reduce((acc, r) => acc + r.unresolved, 0),
      blockerCount: rows.reduce((acc, r) => acc + r.blockers, 0),
      round,
    }
  }, [structure.file_entries, live, filter, round])
}

/** Longest directory prefix (ending with `/`) shared by every path. Trimming it
 * from each row keeps the file list scannable — a project rooted under `lib/`
 * shows `handler.ex` / `runtime/store.ex`, not `lib/handler.ex`. */
function commonPathPrefix(paths: string[]): string {
  if (paths.length === 0) return ""
  const first = paths[0]
  let end = first.lastIndexOf("/") + 1
  for (const path of paths) {
    while (end > 0 && !path.startsWith(first.slice(0, end))) {
      end = first.lastIndexOf("/", end - 2) + 1
    }
    if (end === 0) return ""
  }
  return first.slice(0, end)
}
