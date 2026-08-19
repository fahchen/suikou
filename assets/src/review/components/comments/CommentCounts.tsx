import { Badge } from "../../../components/ui/badge"
import type { Comment } from "./shared"

export type CommentCounts = { open: number; blockers: number; pending: number }

/** The status-bar rollup for one file's comments: published-and-unresolved,
 * how many of those are fix_required, and unpublished drafts. */
export function countComments(comments: Comment[]): CommentCounts {
  const published = comments.filter((c) => c.status === "published" && !c.resolved)
  return {
    open: published.length,
    blockers: published.filter((c) => c.critique_type === "fix_required").length,
    pending: comments.filter((c) => c.status === "pending").length,
  }
}

/** Renders a rollup as chips — the same vocabulary the status bar uses
 * (`N open`, `M blockers`), so a file row reads the same everywhere. */
export function CommentCountChips({ counts }: { counts: CommentCounts }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {counts.open > 0 && <Badge variant="open">{counts.open} open</Badge>}
      {counts.blockers > 0 && (
        <Badge variant="blocker">
          {counts.blockers} {counts.blockers === 1 ? "blocker" : "blockers"}
        </Badge>
      )}
      {counts.pending > 0 && <Badge variant="pending">{counts.pending} draft</Badge>}
      {counts.open === 0 && counts.blockers === 0 && counts.pending === 0 && <Badge>resolved</Badge>}
    </span>
  )
}
