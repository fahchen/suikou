import { useState } from "react";
import { motion } from "motion/react";

import type { Comment } from "./types";
import { CommentCardHeader } from "./CommentCardHeader";
import { CommentEditPanel } from "./CommentEditPanel";
import { CommentReplies } from "./CommentReplies";
import { CommentReplyComposer } from "./CommentReplyComposer";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";

/**
 * `context` tailors the affordances to where the card lives. An "inline" card
 * sits next to its own line in the editor, so the anchor label is redundant and
 * hidden; the "rail" card in the side list keeps it, since position there is not
 * self-evident.
 */
export function CommentCard(props: {
  comment: Comment;
  context?: "inline" | "rail";
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { comment, context = "rail", selected = false, onSelect } = props;
  const inline = context === "inline";
  const [open, setOpen] = useState(!comment.resolved);
  const [editing, setEditing] = useState(false);

  // Rail cards reveal the reply composer only when selected; inline cards
  // (next to their own line) always show it.
  const showComposer = inline || selected;

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      onClick={onSelect}
      className={`rounded-xl border bg-surface text-[13px] shadow-[var(--surface-shadow)] ${
        onSelect && !selected ? "cursor-pointer" : ""
      } ${selected ? "border-blue ring-1 ring-blue" : "border-line"}`}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CommentCardHeader
          comment={comment}
          inline={inline}
          open={open}
          onEdit={() => setEditing(true)}
        />

        <CollapsibleContent>
          <div className="flex flex-col gap-2 px-3 py-2.5">
            {comment.outdated && (
              <p className="text-[12px] text-amber">
                Lost its anchor; the quoted line changed. Delete it or leave it as a general note.
              </p>
            )}

            {editing ? (
              <CommentEditPanel comment={comment} onDone={() => setEditing(false)} />
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed text-text">{comment.body}</p>
            )}

            <CommentReplies replies={comment.replies} />

            {!editing && showComposer && <CommentReplyComposer comment={comment} />}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </motion.article>
  );
}
