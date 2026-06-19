import { useState } from "react";
import { observer } from "mobx-react-lite";

import type { Comment, Reply } from "./types";
import { CommentBody } from "./CommentBody";
import { useReviewCommands } from "./commands";
import { relativeTime, fullTimestamp } from "./time";
import { Button } from "@/components/ui/button";

/** Renders the reply thread under a comment. */
export const CommentReplies = observer(function CommentReplies(props: {
  replies: Comment["replies"];
}) {
  const commands = useReviewCommands();

  return (
    <>
      {props.replies.map((reply) => (
        <ReplyCard
          key={reply.id}
          reply={reply}
          editPending={commands.editReply.isPending}
          deletePending={commands.deleteReply.isPending}
          onEdit={(body) => void commands.editReply.dispatch({ reply_id: reply.id, body })}
          onDelete={() => void commands.deleteReply.dispatch({ reply_id: reply.id })}
        />
      ))}
    </>
  );
});

function ReplyCard(props: {
  reply: Reply;
  editPending: boolean;
  deletePending: boolean;
  onEdit: (body: string) => void;
  onDelete: () => void;
}) {
  const { reply, editPending, deletePending, onEdit, onDelete } = props;
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(reply.body);
  const editable = reply.author === "human" && reply.status === "pending";

  function cancel() {
    setBody(reply.body);
    setEditing(false);
  }

  function save() {
    const nextBody = body.trim();
    if (!nextBody) return;
    onEdit(nextBody);
    setEditing(false);
  }

  return (
    <div
      className={`rounded-lg border px-2.5 py-1.5 ${
        reply.author === "agent" ? "border-active-line-border bg-reply-agent" : "border-line bg-reply"
      }`}
    >
      <div className="mb-0.5 flex items-baseline gap-2 text-[12px]">
        <strong className="text-heading">{reply.author === "agent" ? "Agent" : "You"}</strong>
        <span className="text-[11px] text-faint" title={fullTimestamp(reply.inserted_at)}>
          {relativeTime(reply.inserted_at)}
        </span>
        {editable && !editing && (
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-1.5 py-0.5 text-muted-foreground"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-1.5 py-0.5 text-destructive hover:text-destructive"
              disabled={deletePending}
              onClick={onDelete}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            autoFocus
            className="min-h-12 w-full resize-y rounded-lg border border-line bg-control px-2 py-1.5 text-[13px] focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25"
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={cancel}>
              Cancel
            </Button>
            <Button size="sm" disabled={editPending || !body.trim()} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <CommentBody body={reply.body} />
      )}
    </div>
  );
}
