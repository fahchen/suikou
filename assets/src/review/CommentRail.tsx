import { AnimatePresence } from "motion/react";

import { CommentCard } from "./CommentCard";
import type { Comment } from "./types";

/** Side rail listing every visible comment for the current round. */
export function CommentRail(props: { comments: Comment[] }) {
  if (props.comments.length === 0) {
    return (
      <aside className="text-sm text-muted" aria-label="Comments">
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center">
          No comments match the filters.
        </p>
      </aside>
    );
  }

  return (
    <aside className="flex flex-col gap-3" aria-label="Comments">
      <AnimatePresence initial={false}>
        {props.comments.map((comment) => (
          <CommentCard key={comment.id} comment={comment} />
        ))}
      </AnimatePresence>
    </aside>
  );
}
