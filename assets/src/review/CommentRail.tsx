import { useState, type ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import { Filter, MessageSquarePlus } from "lucide-react";

import { CommentCard } from "./CommentCard";
import type { Comment } from "./types";

type RailVariant = "page" | "card";

/**
 * Side rail listing every visible comment for the current round. `variant="page"`
 * is the single-file route's rail at the page edge — bordered, sticky, with a
 * helpful empty state. `variant="card"` is the per-file rail inside a stacked
 * card; the surrounding card already provides its own chrome and the empty state
 * is suppressed so a 75-file review doesn't repeat the same prompt 75 times.
 *
 * `header` is an optional slot rendered above the comments list (used by the
 * HTML view to host the element-anchor composer in side mode). The rail still
 * renders when the comments list is empty as long as a header is provided.
 */
export function CommentRail(props: {
  comments: Comment[];
  filtered?: boolean;
  variant?: RailVariant;
  header?: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const variant: RailVariant = props.variant ?? "page";

  if (props.comments.length === 0 && !props.header) {
    if (variant === "card") return null;
    return (
      <aside
        className="self-start lg:sticky lg:top-16 lg:border-l lg:border-line lg:pl-6"
        aria-label="Comments"
      >
        <RailEmpty filtered={!!props.filtered} />
      </aside>
    );
  }

  const wrapperClass =
    variant === "card"
      ? "flex flex-col gap-2 self-start py-3 pr-1"
      : "flex flex-col gap-3 self-start lg:sticky lg:top-16 lg:border-l lg:border-line lg:pl-6";

  return (
    <aside className={wrapperClass} aria-label="Comments">
      {props.header}
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

function RailEmpty({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return (
      <div className="flex flex-col items-start gap-2 px-1 pt-2">
        <Filter size={14} className="text-faint" aria-hidden />
        <p className="text-[12px] leading-snug text-muted-foreground">
          Nothing matches the current filters. Adjust them in the display menu.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2 px-1 pt-2">
      <MessageSquarePlus size={14} className="text-faint" aria-hidden />
      <p className="text-[12px] leading-snug text-muted-foreground">
        Click any line number to start a comment. Threads land here.
      </p>
    </div>
  );
}
