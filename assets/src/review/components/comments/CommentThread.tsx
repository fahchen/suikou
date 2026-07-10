import { useEffect, useMemo, useState } from "react"
import { Check, CornerDownRight, Pencil, RotateCcw } from "lucide-react"

import { useMusubiCommand } from "../../../musubi"
import { renderMarkdown } from "../../markdown"
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
  compact = false,
  focused = false,
  onFocus,
}: {
  comment: Comment
  commentsProxy: CommentsStoreProxy | null
  className?: string
  compact?: boolean
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
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(inlineThreadCollapsedKey(comment.id)) === "1")
  const hasPendingReply = comment.replies.some((reply) => reply.status === "pending")
  const effectiveCollapsed = compact ? false : collapsed

  useEffect(() => {
    if (compact) return
    localStorage.setItem(inlineThreadCollapsedKey(comment.id), collapsed ? "1" : "0")
  }, [collapsed, comment.id, compact])

  const range = anchor
    ? `line ${anchor.start_line}${anchor.end_line > anchor.start_line ? `–${anchor.end_line}` : ""}`
    : "comment"
  const anchorLabel = anchor ? `${anchor.start_line}${anchor.end_line > anchor.start_line ? `-${anchor.end_line}` : ""}L` : null
  const deleteComment = () => {
    if (commentsProxy) deleteCmd.dispatch({ comment_id: comment.id }).catch(() => undefined)
  }
  const resolveComment = () => {
    if (!commentsProxy) return
    resolveCmd
      .dispatch({ comment_id: comment.id })
      .then(() => {
        if (!compact) setCollapsed(true)
      })
      .catch(() => undefined)
  }
  const reopenComment = () => {
    if (!commentsProxy) return
    unresolveCmd
      .dispatch({ comment_id: comment.id })
      .then(() => {
        if (!compact) setCollapsed(false)
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
        chrome={!compact}
        className={compact ? "m-0" : undefined}
        onSubmit={(body, type) => {
          if (commentsProxy) editCmd.dispatch({ comment_id: comment.id, body, critique_type: type }).catch(() => undefined)
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <>
        <CommentCard
        comment={comment}
        className={`${className} ${compact ? "" : INLINE_COMMENT_MAX_WIDTH_CLASS}`.trim()}
        headerClassName="gap-1.5 px-3 py-2"
        compact={compact}
        focused={focused}
        collapsible={!compact}
        collapsed={effectiveCollapsed}
        onToggleCollapse={() => setCollapsed((value) => !value)}
        onFocus={onFocus}
        metaLine={
          anchorLabel ? (
            <span className="inline-flex items-center font-mono text-[11px] text-muted">
              {anchorLabel}
              {pending ? "" : ` · R${comment.authored_round}`}
            </span>
          ) : undefined
        }
        summaryText={comment.body}
        headerActions={
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {!effectiveCollapsed && (
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
            className="md-body px-3 pb-2.5 text-[12.5px] leading-[1.5] text-ink"
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
          <div className="flex items-center justify-end gap-0.5 px-2.5 pb-2">
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
                if (commentsProxy) replyCmd.dispatch({ comment_id: comment.id, body }).catch(() => undefined)
                setReplying(false)
              }}
              onCancel={() => setReplying(false)}
            />
          ) : undefined
        }
      />
    </>
  )
}
