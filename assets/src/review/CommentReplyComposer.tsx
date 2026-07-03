import { useState } from "react";
import { ArrowUp, CircleCheck, SmilePlus, SquarePlus } from "lucide-react";

import type { Comment } from "./types";
import { CommentComposer } from "./CommentComposer";
import { useReviewCommands } from "./commands";

/**
 * Reply affordance for one comment, matching the mockup's `.th-replybox` +
 * `.th-actions`. Collapsed it is a single-line 31px "Reply…" box with a 22px
 * up-arrow send button; clicking (or focusing) it expands to the full
 * multi-line composer. Below it sits the compact action row — a Resolve pill
 * plus a react button — so a thread reads as a tidy card rather than a wall of
 * always-open editing chrome.
 */
export function CommentReplyComposer(props: { comment: Comment }) {
  const { comment } = props;
  const commands = useReviewCommands();
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(false);
  const replyLabel = comment.resolved ? "Unresolve" : "Reply";
  const replyHint = comment.resolved ? "Reply and reopen this comment" : null;
  const placeholder = comment.resolved ? "Reply to reopen this comment…" : "Reply…";

  const resolveAction = comment.status === "published" && !comment.resolved && (
    <button
      type="button"
      className="inline-flex h-[28px] cursor-pointer items-center gap-1.5 rounded-full border border-green/50 bg-green/15 px-3 text-[12px] font-[560] text-green-text transition-colors hover:bg-green/25 disabled:cursor-default disabled:opacity-60"
      disabled={commands.resolveComment.disabled}
      onClick={() => void commands.resolveComment.dispatch({ comment_id: comment.id })}
    >
      <CircleCheck size={14} aria-hidden />
      Resolve
    </button>
  );

  if (!expanded) {
    return (
      <div className="mt-1 flex flex-col gap-2">
        <button
          type="button"
          title={replyHint ?? undefined}
          onClick={() => setExpanded(true)}
          className="flex h-[31px] cursor-text items-center gap-2 rounded-[9px] border border-line-strong bg-tint/40 pr-[5px] pl-[11px] text-left text-[12px] text-faint transition-colors hover:bg-tint/60"
        >
          <span className="flex-1 truncate">{placeholder}</span>
          <span
            aria-hidden
            className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-md bg-blue text-on-accent shadow-[inset_0_0.5px_0_var(--edge-top-2)]"
          >
            <ArrowUp size={13} strokeWidth={2.4} />
          </span>
        </button>

        {resolveAction && (
          <div className="flex items-center gap-2">
            {resolveAction}
            <button
              type="button"
              title="React"
              className="inline-flex size-[28px] cursor-pointer items-center justify-center rounded-full text-faint transition-colors hover:bg-hover hover:text-muted-foreground"
            >
              <SmilePlus size={15} aria-hidden />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-lg border border-line-soft bg-panel p-2">
      {replyHint && <p className="text-[12px] text-faint">{replyHint}.</p>}
      <CommentComposer
        autoFocus
        placeholder={placeholder}
        value={body}
        onChange={setBody}
        onSubmit={(text) => commands.reply.dispatch({ comment_id: comment.id, body: text })}
        onSuccess={() => {
          setBody("");
          setExpanded(false);
        }}
        onCancel={() => {
          setBody("");
          setExpanded(false);
        }}
        submitLabel={replyLabel}
        disabled={commands.reply.disabled}
        leadingAction={
          <div className="flex items-center gap-2">
            {resolveAction}
            <button
              type="button"
              className="inline-flex h-[28px] cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-hover hover:text-heading"
              title="Insert suggestion block"
              onClick={() => setBody((b) => `${b}${b ? "\n" : ""}\`\`\`suggestion\n\n\`\`\``)}
            >
              <SquarePlus size={13} aria-hidden />
              Suggest
            </button>
          </div>
        }
      />
    </div>
  );
}
