import { useMemo, useState } from "react"
import { Check, CornerDownRight, Pencil, Trash2 } from "lucide-react"

import { useMusubiCommand } from "../../../musubi"
import { renderMarkdown } from "../../markdown"
import { CommentActionButton } from "./CommentActions"
import { CommentCard } from "./CommentCard"
import { Composer } from "./Composer"
import { Reply } from "./Reply"
import type { Comment, CommentsStoreProxy } from "./shared"

export function SideCommentCard({
  comment,
  commentsProxy,
  onFocusLine,
}: {
  comment: Comment
  commentsProxy: CommentsStoreProxy | null
  onFocusLine: () => void
}) {
  const anchor = comment.anchor?.type === "line_range" ? comment.anchor : null
  const label =
    comment.scope === "artifact"
      ? "File"
      : anchor
        ? `L${anchor.start_line}${anchor.end_line > anchor.start_line ? `-${anchor.end_line}` : ""}`
        : comment.anchor?.type === "element"
          ? "Element"
          : "Anchor"
  const latestReply = comment.replies[comment.replies.length - 1]
  const pending = comment.status === "pending"
  const bodyHtml = useMemo(() => renderMarkdown(comment.body), [comment.body])
  const editCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "edit_comment")
  const deleteCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "delete_comment")
  const resolveCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "resolve_comment")
  const replyCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "reply")
  const [editing, setEditing] = useState(false)
  const [replying, setReplying] = useState(false)

  if (editing) {
    return (
      <div data-side-comment-id={comment.id} className="z-10">
        <Composer
          anchorLabel={label}
          initialType={comment.critique_type}
          initialBody={comment.body}
          submitLabel="Save"
          pending={editCmd.isPending}
          className="m-0"
          onSubmit={(body, type) => {
            if (commentsProxy) editCmd.dispatch({ comment_id: comment.id, body, critique_type: type }).catch(() => undefined)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <CommentCard
      comment={comment}
      className="p-2.5 text-left"
      headerClassName="gap-1.5 pt-0 pb-0"
      rightLabel={
        anchor ? (
          <button
            type="button"
            onClick={onFocusLine}
            className="shrink-0 rounded-ctrl px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted hover:bg-soft hover:text-accent-bright"
          >
            {label}
          </button>
        ) : (
          <span className="shrink-0 font-mono text-[11px] font-semibold text-muted">{label}</span>
        )
      }
      body={
        <div
          className="md-body mt-2 text-[12px] leading-[1.45] text-ink"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      }
      replies={
        comment.replies.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            {comment.replies.map((reply) => (
              <Reply key={reply.id} reply={reply} commentsProxy={commentsProxy} />
            ))}
          </div>
        ) : latestReply ? (
          <div className="mt-2 rounded-[8px] bg-canvas/55 px-2 py-1.5 text-[11.5px] leading-[1.45] text-text">
            {latestReply.body}
          </div>
        ) : undefined
      }
      actions={
        <div className="mt-2 flex items-center gap-2 text-[10.5px] font-semibold text-muted">
          {comment.replies.length > 0 && <span className="tabular-nums">{comment.replies.length} replies</span>}
          <span className="flex-1" />
          {pending && (
            <>
              <CommentActionButton icon={Pencil} label="Edit" size="sm" onClick={() => setEditing(true)} />
              <CommentActionButton
                icon={Trash2}
                label="Delete"
                size="sm"
                onClick={() => {
                  if (commentsProxy) deleteCmd.dispatch({ comment_id: comment.id }).catch(() => undefined)
                }}
              />
            </>
          )}
          {!pending && !comment.resolved && !replying && (
            <>
              <CommentActionButton icon={CornerDownRight} label="Reply" size="sm" onClick={() => setReplying(true)} />
              <CommentActionButton
                icon={Check}
                label="Resolve"
                size="sm"
                tone="approve"
                onClick={() => {
                  if (commentsProxy) resolveCmd.dispatch({ comment_id: comment.id }).catch(() => undefined)
                }}
              />
            </>
          )}
        </div>
      }
      composer={
        replying ? (
          <Composer
            anchorLabel={null}
            submitLabel="Reply"
            draftKey={`suikou-reply:${comment.id}`}
            className="mt-2 mb-0 ml-0 mr-0"
            pending={replyCmd.isPending}
            onSubmit={(body) => {
              if (commentsProxy) replyCmd.dispatch({ comment_id: comment.id, body }).catch(() => undefined)
              setReplying(false)
            }}
            onCancel={() => setReplying(false)}
          />
        ) : undefined
      }
    />
  )
}
