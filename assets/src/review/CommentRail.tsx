import { useState } from "react";
import { AnimatePresence } from "motion/react";

import { CommentCard } from "./CommentCard";
import type { Comment } from "./types";

/** Side rail listing every visible comment for the current round. */
export function CommentRail(props: { comments: Comment[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (props.comments.length === 0) {
    return (
      <aside className="text-sm text-muted-foreground lg:border-l lg:border-line lg:pl-6" aria-label="Comments">
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center">
          No comments match the filters.
        </p>
      </aside>
    );
  }

  return (
    <aside className="flex flex-col gap-3 lg:border-l lg:border-line lg:pl-6" aria-label="Comments">
      <AnimatePresence initial={false}>
        {props.comments.map((comment) => (
          <CommentCard
            key={comment.id}
            comment={comment}
            selected={comment.id === selectedId}
            onSelect={() => setSelectedId(comment.id)}
          />
        ))}
      </AnimatePresence>
    </aside>
  );
}
