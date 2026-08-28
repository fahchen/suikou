import { useMemo, useState } from "react"
import { observer } from "mobx-react-lite"
import { Pencil } from "lucide-react"

import { useMusubiCommand } from "../../../musubi"
import { renderMarkdown } from "../../markdown"
import { AuthorBadge } from "./AuthorBadge"
import { CommentActionButton, ConfirmDeleteIconButton } from "./CommentActions"
import { Composer } from "./Composer"
import { Reactions } from "./Reactions"
import type { CommentReply, CommentsStoreProxy } from "./shared"
import { TimeAgo } from "../../../components/ui/time-ago"

export const Reply = observer(function Reply({
  reply,
  commentsProxy,
}: {
  reply: CommentReply
  commentsProxy: CommentsStoreProxy | null
}) {
  const agent = reply.author.kind === "agent"
  const pending = reply.status === "pending"
  const bodyHtml = useMemo(() => renderMarkdown(reply.body), [reply.body])
  const editCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "edit_reply")
  const deleteCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "delete_reply")
  const [editing, setEditing] = useState(false)
  const deleteReply = () => {
    if (commentsProxy) deleteCmd.dispatch({ reply_id: reply.id }).catch(() => undefined)
  }

  if (editing) {
    return (
      <Composer
        anchorLabel={null}
        initialBody={reply.body}
        submitLabel="Save"
        className=""
        pending={editCmd.isPending}
        onSubmit={(body) => {
          if (!commentsProxy) return
          editCmd.dispatch({ reply_id: reply.id, body }).then(() => setEditing(false)).catch(() => undefined)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <>
      <div
        className={`group/reply rounded-ctrl px-3 py-2 ring-1 ring-inset ${
          agent ? "bg-accent-softer ring-accent-edge" : "bg-soft ring-hair-strong"
        }`}
      >
        <div className="mb-1 flex items-center gap-1.5">
          <AuthorBadge author={reply.author} size="sm" />
          {pending && (
            <span className="inline-flex items-center rounded-full bg-amber-soft px-1.5 py-px text-2xs font-bold tracking-wide text-amber ring-1 ring-inset ring-amber-edge">
              pending
            </span>
          )}
          <TimeAgo iso={reply.inserted_at} />
          <span className="flex-1" />
          {pending && (
            <ConfirmDeleteIconButton
              reveal="reply-hover"
              onConfirm={deleteReply}
            />
          )}
        </div>
        <div
          className="md-body text-xs leading-[1.5] text-text"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
        {!pending && (
          <Reactions reactions={reply.reactions} targetId={reply.id} target="reply" commentsProxy={commentsProxy} className="pt-1.5" />
        )}
        {pending && (
          <div className="mt-1.5 flex justify-end">
            <CommentActionButton icon={Pencil} label="Edit" reveal="reply-hover" onClick={() => setEditing(true)} />
          </div>
        )}
      </div>
    </>
  )
})
