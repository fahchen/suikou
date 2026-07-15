import { useEffect, useMemo, useState } from "react"
import { Check, CornerDownRight, Pencil, RotateCcw } from "lucide-react"

import { useMusubiCommand } from "../../../musubi"
import { renderMarkdown } from "../../markdown"
import { CommentActionButton, ConfirmDeleteIconButton } from "./CommentActions"
import { CommentCard } from "./CommentCard"
import { Composer } from "./Composer"
import { Reply } from "./Reply"
import { inlineThreadCollapsedKey, type Comment, type CommentsStoreProxy } from "./shared"

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
  const unresolveCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "unresolve_comment")
  const replyCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "reply")
  const [editing, setEditing] = useState(false)
  const [replying, setReplying] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(inlineThreadCollapsedKey(comment.id)) === "1")
  const hasPendingReply = comment.replies.some((reply) => reply.status === "pending")
  const deleteComment = () => {
    if (commentsProxy) deleteCmd.dispatch({ comment_id: comment.id }).catch(() => undefined)
  }
  const resolveComment = () => {
    if (!commentsProxy) return
    resolveCmd
      .dispatch({ comment_id: comment.id })
      .then(() => setCollapsed(true))
      .catch(() => undefined)
  }
  const reopenComment = () => {
    if (!commentsProxy) return
    unresolveCmd
      .dispatch({ comment_id: comment.id })
      .then(() => setCollapsed(false))
      .catch(() => undefined)
  }
  const canReply = !pending && !hasPendingReply

  useEffect(() => {
    localStorage.setItem(inlineThreadCollapsedKey(comment.id), collapsed ? "1" : "0")
  }, [collapsed, comment.id])

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
    <>
      <CommentCard
        comment={comment}
        className="p-2.5 text-left"
        headerClassName="gap-1.5 pt-0 pb-0"
        collapsible
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((value) => !value)}
        summaryText={comment.body}
        metaLine={
          anchor ? (
            <button
              type="button"
              onClick={onFocusLine}
              className="shrink-0 cursor-pointer rounded-ctrl px-1.5 py-0.5 font-mono text-xs font-semibold text-muted hover:bg-soft hover:text-accent-bright"
            >
              {label}
            </button>
          ) : (
            <span className="shrink-0 font-mono text-xs font-semibold text-muted">{label}</span>
          )
        }
        headerActions={
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {(!collapsed || pending) && (
              <ConfirmDeleteIconButton
                size="sm"
                reveal="comment-hover"
                onConfirm={deleteComment}
              />
            )}
            {!pending &&
              (comment.resolved ? (
                <CommentActionButton
                  icon={RotateCcw}
                  label="Reopen"
                  size="sm"
                  onClick={reopenComment}
                />
              ) : (
                <CommentActionButton
                  icon={Check}
                  label="Resolve"
                  size="sm"
                  tone="approve"
                  onClick={resolveComment}
                />
              ))}
          </div>
        }
        body={
          <div
            className="md-body mt-2 text-xs leading-[1.45] text-ink"
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
            <div className="mt-2 rounded-[8px] bg-canvas/55 px-2 py-1.5 text-xs leading-[1.45] text-text">
              {latestReply.body}
            </div>
          ) : undefined
        }
        actions={
          <div className="mt-2 flex items-center gap-2 text-2xs font-semibold text-muted">
            {comment.replies.length > 0 && <span className="tabular-nums">{comment.replies.length} replies</span>}
            <span className="flex-1" />
            {pending ? (
              <CommentActionButton icon={Pencil} label="Edit" size="sm" reveal="comment-hover" onClick={() => setEditing(true)} />
            ) : canReply && !replying ? (
              <CommentActionButton icon={CornerDownRight} label="Reply" size="sm" reveal="comment-hover" onClick={() => setReplying(true)} />
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
    </>
  )
}
