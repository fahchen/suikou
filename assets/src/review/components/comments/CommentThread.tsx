import { useEffect, useMemo, useState } from "react"
import { Check, CornerDownRight, Pencil } from "lucide-react"

import { useMusubiCommand } from "../../../musubi"
import { renderMarkdown } from "../../markdown"
import { AnchorLabel, CommentActionButton, ConfirmDeleteIconButton, ResolveToggle } from "./CommentActions"
import { CommentCard } from "./CommentCard"
import { Composer } from "./Composer"
import { AuthorBadge } from "./AuthorBadge"
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
  const reopenCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "reopen_comment")
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
    reopenCmd
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
        metaLine={
          anchorLabel ? (
            <span className="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-muted">
              <AnchorLabel label={anchorLabel} focused={focused} onFocus={onFocus} />
              {!pending && <span className="shrink-0 text-muted/60 @max-[24rem]/card:hidden">R{comment.authored_round}</span>}
            </span>
          ) : undefined
        }
        summaryText={comment.body}
        rightLabel={
          comment.resolved && comment.resolved_by?.kind === "agent" && comment.resolved_by.name ? (
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
            {collapsed && !pending && (
              <ResolveToggle resolved={comment.resolved} onResolve={resolveComment} onReopen={reopenComment} />
            )}
          </div>
        }
        body={
          <div
            className="md-body px-3 pb-1.5 text-xs leading-[1.5] text-ink"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        }
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
          // Reactions and the action buttons share one footer row so a
          // short comment doesn't carry two near-empty strips. `flex-wrap`
          // drops the buttons to their own line once a narrow card (phone,
          // side rail) can't fit them beside the chips.
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-2.5 pb-2">
            <Reactions
              reactions={comment.reactions}
              targetId={comment.id}
              target="comment"
              commentsProxy={commentsProxy}
              className="min-w-0 px-0.5"
            />
            <div className="ml-auto flex items-center gap-0.5">
              {/* The header carries this pair while collapsed; rendering it here
                  too would leave a second, inert copy in every collapsed card. */}
              {!collapsed && !pending && (
                <ResolveToggle
                  resolved={comment.resolved}
                  reveal="comment-hover"
                  onResolve={resolveComment}
                  onReopen={reopenComment}
                />
              )}
              {pending ? (
                <CommentActionButton icon={Pencil} label="Edit" reveal="comment-hover" onClick={() => setEditing(true)} />
              ) : canReply && !replying ? (
                <CommentActionButton icon={CornerDownRight} label="Reply" reveal="comment-hover" onClick={() => setReplying(true)} />
              ) : null}
            </div>
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
