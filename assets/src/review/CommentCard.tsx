import { useState } from "react";
import { motion } from "motion/react";

import type { Comment } from "./types";
import { CommentCardHeader } from "./CommentCardHeader";
import { CommentRelocatePanel } from "./CommentRelocatePanel";
import { CommentEditPanel } from "./CommentEditPanel";
import { CommentReplies } from "./CommentReplies";
import { CommentReplyComposer } from "./CommentReplyComposer";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";

/**
 * `context` tailors the affordances to where the card lives. An "inline" card
 * sits next to its own line in the editor, so the anchor label and the locate
 * cluster (relocate, copy-link) are redundant and hidden; the "rail" card in
 * the side list keeps them, since position there is not self-evident.
 */
export function CommentCard(props: { comment: Comment; context?: "inline" | "rail" }) {
  const { comment, context = "rail" } = props;
  const inline = context === "inline";
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [relocating, setRelocating] = useState(false);

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="rounded-xl border border-line bg-surface text-[13px] shadow-[var(--surface-shadow)]"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CommentCardHeader
          comment={comment}
          inline={inline}
          open={open}
          onEdit={() => setEditing(true)}
          onRelocate={() => setRelocating(true)}
        />

        <CollapsibleContent>
          <div className="flex flex-col gap-2 px-3 py-2.5">
            {comment.outdated && (
              <p className="text-[12px] text-amber">
                {inline
                  ? "Lost its anchor; the quoted line changed. Re-anchor from the side rail, or delete."
                  : "Lost its anchor; the quoted line changed. Re-anchor or delete."}
              </p>
            )}

            {relocating && !inline && (
              <CommentRelocatePanel comment={comment} onDone={() => setRelocating(false)} />
            )}

            {editing ? (
              <CommentEditPanel comment={comment} onDone={() => setEditing(false)} />
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed text-text">{comment.body}</p>
            )}

            <CommentReplies replies={comment.replies} />

            {!editing && <CommentReplyComposer comment={comment} />}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </motion.article>
  );
}
