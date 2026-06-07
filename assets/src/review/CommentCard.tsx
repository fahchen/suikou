import { useState } from "react";
import { motion } from "motion/react";

import { CRITIQUE_META, type Comment } from "./types";
import { useReviewCommands } from "./commands";
import {
  Crosshair,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Trash2,
  CircleCheck,
  SquarePlus,
} from "lucide-react";
import type { CritiqueType } from "../stores/ui-store";

const TONE_CLASS: Record<string, string> = {
  red: "bg-red-soft text-red",
  amber: "bg-amber-soft text-amber",
  muted: "bg-soft text-muted-foreground",
};

export function CommentCard(props: { comment: Comment }) {
  const { comment } = props;
  const commands = useReviewCommands();
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [editType, setEditType] = useState<CritiqueType>(comment.critique_type);
  const [replyBody, setReplyBody] = useState("");

  const meta = CRITIQUE_META[comment.critique_type];
  const anchorLabel = comment.anchor
    ? comment.anchor.start_line === comment.anchor.end_line
      ? `line ${comment.anchor.start_line}`
      : `lines ${comment.anchor.start_line}-${comment.anchor.end_line}`
    : "unanchored";

  function saveEdit() {
    if (!editBody.trim()) return;
    void commands.editComment.dispatch({
      comment_id: comment.id,
      body: editBody.trim(),
      critique_type: editType,
    });
    setEditing(false);
  }

  function sendReply() {
    if (!replyBody.trim()) return;
    void commands.reply.dispatch({ comment_id: comment.id, body: replyBody.trim() });
    setReplyBody("");
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="rounded-lg border border-line bg-surface text-[13px] shadow-[var(--surface-shadow)]"
    >
      <header className="flex items-center gap-2 border-b border-line-soft px-3 py-2">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          {comment.anchor && <Crosshair size={13} />}
          {anchorLabel}
        </span>

        {comment.carried && comment.original_round != null && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-soft px-1.5 py-0.5 text-[11px] text-muted-foreground"
            title={`Carried from round ${comment.original_round}`}
          >
            <RefreshCw size={11} />R{comment.original_round}
          </span>
        )}

        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TONE_CLASS[meta.tone]}`}>
          {comment.critique_type}
        </span>

        {comment.status === "pending" && (
          <span className="rounded bg-yellow px-1.5 py-0.5 text-[11px] text-ink">Pending</span>
        )}
        {comment.resolved && (
          <span className="rounded bg-soft px-1.5 py-0.5 text-[11px] text-green-text">
            Resolved
          </span>
        )}

        <div className="ml-auto">
          <details className="relative">
            <summary className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-hover">
              <MoreHorizontal size={15} />
            </summary>
            <div className="absolute right-0 z-10 mt-1 flex w-36 flex-col rounded-md border border-line bg-pop p-1 shadow-[var(--surface-shadow)]">
              <button
                type="button"
                className="flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-hover"
                onClick={() => {
                  setEditing(true);
                  setEditBody(comment.body);
                  setEditType(comment.critique_type);
                }}
              >
                <Pencil size={14} />
                Edit
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-red hover:bg-hover"
                onClick={() => void commands.deleteComment.dispatch({ comment_id: comment.id })}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </details>
        </div>
      </header>

      <div className="flex flex-col gap-2 px-3 py-2.5">
        {comment.outdated && (
          <p className="text-[12px] text-amber">
            Lost its anchor — the quoted line changed. Re-anchor or delete.
          </p>
        )}

        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              className="min-h-16 w-full resize-y rounded border border-line bg-control px-2 py-1.5 text-[13px]"
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <select
                className="rounded border border-line bg-control px-2 py-1 text-[12px]"
                value={editType}
                onChange={(e) => setEditType(e.target.value as CritiqueType)}
              >
                <option value="fix_required">fix_required</option>
                <option value="needs_answer">needs_answer</option>
                <option value="note">note</option>
              </select>
              <button
                type="button"
                className="ml-auto rounded px-2 py-1 text-[12px] text-muted-foreground hover:bg-hover"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-blue px-3 py-1 text-[12px] font-medium text-on-accent disabled:opacity-50"
                disabled={commands.editComment.isPending}
                onClick={saveEdit}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap leading-relaxed text-text">{comment.body}</p>
        )}

        {comment.replies.map((reply) => (
          <div
            key={reply.id}
            className={`rounded-md border-l-2 px-2.5 py-1.5 ${
              reply.author === "agent" ? "border-blue bg-reply-agent" : "border-line bg-reply"
            }`}
          >
            <div className="mb-0.5 flex items-center gap-2 text-[12px]">
              <strong className="text-heading">{reply.author === "agent" ? "Agent" : "You"}</strong>
            </div>
            <p className="whitespace-pre-wrap leading-relaxed text-text">{reply.body}</p>
          </div>
        ))}

        {!editing && (
          <div className="mt-1 flex flex-col gap-2 rounded-md border border-line-soft bg-panel p-2">
            <div className="flex items-center">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-muted-foreground hover:bg-hover"
                title="Insert suggestion block"
                onClick={() =>
                  setReplyBody((b) => `${b}${b ? "\n" : ""}\`\`\`suggestion\n\n\`\`\``)
                }
              >
                <SquarePlus size={13} />
                Suggest
              </button>
            </div>
            <textarea
              className="min-h-12 w-full resize-y rounded border border-line bg-control px-2 py-1.5 text-[13px]"
              rows={2}
              placeholder="Reply…"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
            />
            <div className="flex items-center gap-2">
              {!comment.resolved && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[12px] text-text hover:bg-hover disabled:opacity-50"
                  disabled={commands.resolveComment.isPending}
                  onClick={() => void commands.resolveComment.dispatch({ comment_id: comment.id })}
                >
                  <CircleCheck size={14} />
                  Resolve
                </button>
              )}
              <button
                type="button"
                className="ml-auto rounded bg-blue px-3 py-1 text-[12px] font-medium text-on-accent disabled:opacity-50"
                disabled={commands.reply.isPending || !replyBody.trim()}
                onClick={sendReply}
              >
                Reply
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.article>
  );
}
