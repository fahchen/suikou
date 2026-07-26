import { useEffect, useMemo, useState } from "react"
import { Check, CornerDownRight, Pencil, RotateCcw } from "lucide-react"

import { useMusubiCommand } from "../../../musubi"
import { renderMarkdown } from "../../markdown"
import { AuthorBadge } from "./AuthorBadge"
import { CommentActionButton, ConfirmDeleteIconButton } from "./CommentActions"
import { CommentCard } from "./CommentCard"
import { Composer } from "./Composer"
import { Reactions } from "./Reactions"
import { Reply } from "./Reply"
import { INLINE_COMMENT_MAX_WIDTH_CLASS, inlineThreadCollapsedKey, type Comment, type CommentsStoreProxy } from "./shared"

export function CommentThread({
  comment,
  commentsProxy,
  className = "my-1.5 ml-14 mr-3.5",
  focused = false,
  onFocus,
}: {
  comment: Comment
  commentsProxy: CommentsStoreProxy | null
  className?: string
  focused?: boolean
  onFocus?: () => void
}) {
  const anchor = comment.anchor?.type === "line_range" ? comment.anchor : null
  const pending = comment.status === "pending"
  const bodyHtml = useMemo(() => renderMarkdown(comment.body), [comment.body])
  const editCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "edit_comment")
  const deleteCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "delete_comment")
  const resolveCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "resolve_comment")
  const unresolveCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "unresolve_comment")
  const replyCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "reply")
  const [editing, setEditing] = useState(false)
  const [replying, setReplying] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(inlineThreadCollapsedKey(comment.id)) === "1")
  const hasPendingReply = comment.replies.some((reply) => reply.status === "pending")

  useEffect(() => {
    localStorage.setItem(inlineThreadCollapsedKey(comment.id), collapsed ? "1" : "0")
  }, [collapsed, comment.id])

  const range = anchor
    ? `line ${anchor.start_line}${anchor.end_line > anchor.start_line ? `–${anchor.end_line}` : ""}`
    : comment.scope === "artifact"
      ? "whole file"
      : "comment"
  const anchorLabel = anchor ? `L${anchor.start_line}${anchor.end_line > anchor.start_line ? `-${anchor.end_line}` : ""}` : null
  const deleteComment = () => {
    if (commentsProxy) setRemoving(true)
  }
  const resolveComment = () => {
    if (!commentsProxy) return
    resolveCmd
      .dispatch({ comment_id: comment.id })
      .then(() => {
        setCollapsed(true)
      })
      .catch(() => undefined)
  }
  const reopenComment = () => {
    if (!commentsProxy) return
    unresolveCmd
      .dispatch({ comment_id: comment.id })
      .then(() => {
        setCollapsed(false)
      })
      .catch(() => undefined)
  }
  const canReply = !pending && !hasPendingReply

  if (editing) {
    return (
      <Composer
        anchorLabel={range}
        initialType={comment.critique_type}
        initialBody={comment.body}
        submitLabel="Save"
        pending={editCmd.isPending}
        className={`${className} ${INLINE_COMMENT_MAX_WIDTH_CLASS}`}
        onSubmit={(body, type) => {
          if (!commentsProxy) return
          editCmd.dispatch({ comment_id: comment.id, body, critique_type: type }).then(() => setEditing(false)).catch(() => undefined)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div
      className={`grid transition-all duration-200 ease-out ${className} ${INLINE_COMMENT_MAX_WIDTH_CLASS}`}
      style={{
        gridTemplateRows: removing ? "0fr" : "1fr",
        opacity: removing ? 0 : 1,
        ...(removing ? { marginTop: 0, marginBottom: 0 } : {}),
      }}
      onTransitionEnd={(event) => {
        if (removing && event.propertyName === "opacity" && commentsProxy)
          deleteCmd.dispatch({ comment_id: comment.id }).catch(() => setRemoving(false))
      }}
    >
      <div className="min-h-0 overflow-hidden">
        <CommentCard
        comment={comment}
        className=""
        headerClassName="gap-1.5 px-3 py-2"
        focused={focused}
        collapsible
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((value) => !value)}
        onFocus={onFocus}
        metaLine={
          anchorLabel ? (
            <span className="inline-flex items-center gap-1 font-mono text-xs text-muted">
              {anchorLabel}
              {pending ? "" : <span className="text-muted/60 @max-[20rem]/hdr:hidden">R{comment.authored_round}</span>}
            </span>
          ) : undefined
        }
        summaryText={comment.body}
        rightLabel={
          // Any agent may call a comment addressed, so name the one that did —
          // it is what the human weighs before reopening. Their own resolves
          // need no label; they were there.
          comment.resolved && comment.resolved_by?.kind === "agent" ? (
            <span className="flex shrink-0 items-center gap-1 text-2xs text-muted">
              <Check size={11} aria-hidden />
              <AuthorBadge author={comment.resolved_by} size="sm" />
            </span>
          ) : undefined
        }
        headerActions={
          <div className="-mr-1 ml-auto flex shrink-0 items-center gap-0.5">
            {(!collapsed || pending) && (
              <ConfirmDeleteIconButton
                reveal="comment-hover"
                onConfirm={deleteComment}
              />
            )}
            {!pending &&
              (comment.resolved ? (
                <CommentActionButton
                  icon={RotateCcw}
                  label="Reopen"
                  onClick={reopenComment}
                />
              ) : (
                <CommentActionButton
                  icon={Check}
                  label="Resolve"
                  tone="approve"
                  onClick={resolveComment}
                />
              ))}
          </div>
        }
        body={
          <div
            className="md-body px-3 pb-2.5 text-xs leading-[1.5] text-ink"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        }
        reactions={<Reactions reactions={comment.reactions} targetId={comment.id} target="comment" commentsProxy={commentsProxy} />}
        replies={
          comment.replies.length > 0 ? (
            <div className="mx-3 mb-2.5 flex flex-col gap-2">
              {comment.replies.map((reply) => (
                <Reply key={reply.id} reply={reply} commentsProxy={commentsProxy} />
              ))}
            </div>
          ) : undefined
        }
        actions={
          <div className="flex items-center justify-between gap-0.5 px-2.5 pb-2">
            <div className="flex items-center gap-0.5">
              {!pending &&
                (comment.resolved ? (
                  <CommentActionButton icon={RotateCcw} label="Reopen" reveal="comment-hover" onClick={reopenComment} />
                ) : (
                  <CommentActionButton icon={Check} label="Resolve" tone="approve" reveal="comment-hover" onClick={resolveComment} />
                ))}
            </div>
            {pending ? (
              <CommentActionButton icon={Pencil} label="Edit" reveal="comment-hover" onClick={() => setEditing(true)} />
            ) : canReply && !replying ? (
              <CommentActionButton icon={CornerDownRight} label="Reply" reveal="comment-hover" onClick={() => setReplying(true)} />
            ) : (
              null
            )}
          </div>
        }
        composer={
          replying ? (
            <Composer
              anchorLabel={null}
              submitLabel="Reply"
              draftKey={`suikou-reply:${comment.id}`}
              className="mx-2.5 mb-2.5"
              pending={replyCmd.isPending}
              onSubmit={(body) => {
                if (!commentsProxy) return
                replyCmd.dispatch({ comment_id: comment.id, body }).then(() => setReplying(false)).catch(() => undefined)
              }}
              onCancel={() => setReplying(false)}
            />
          ) : undefined
        }
      />
      </div>
    </div>
  )
}
