import { Crosshair } from "lucide-react"

import { CommentThread } from "./CommentThread"
import type { Comment, CommentsStoreProxy } from "./shared"

/** E16: located comments whose anchor can't be placed in what is rendered,
 * gathered in one band above the content instead of clamped to a wrong spot.
 * `reason` says why, in the surface's own terms (a line past the end of the
 * file, an element gone from the page, code not in the current diff). */
export function StrandedComments({
  comments,
  commentsProxy,
  reason,
  focusedCommentId = null,
  onFocusComment,
  className = "",
}: {
  comments: Comment[]
  commentsProxy: CommentsStoreProxy | null
  reason: string
  focusedCommentId?: string | null
  onFocusComment?: (commentId: string | null) => void
  className?: string
}) {
  if (comments.length === 0) return null
  return (
    <div className={`rounded-panel border border-hair-strong bg-soft/40 p-2 font-sans ${className}`}>
      <div className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        <Crosshair size={12} className="text-accent" aria-hidden />
        Stranded {comments.length === 1 ? "comment" : "comments"}
        <span className="font-normal normal-case tracking-normal text-faint">· {reason}</span>
      </div>
      {comments.map((comment) => (
        <CommentThread
          key={comment.id}
          comment={comment}
          commentsProxy={commentsProxy}
          className="my-1"
          focused={focusedCommentId === comment.id}
          onFocus={
            onFocusComment ? () => onFocusComment(focusedCommentId === comment.id ? null : comment.id) : undefined
          }
        />
      ))}
    </div>
  )
}
