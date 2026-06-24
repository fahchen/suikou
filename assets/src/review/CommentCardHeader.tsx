import {
  Crosshair,
  Link2,
  Waves,
  MoreHorizontal,
  Pencil,
  Trash2,
  ChevronDown,
  CircleCheck,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { CRITIQUE_META, type Comment } from "./types";
import { badgePop } from "./motion";
import { useReviewCommands } from "./commands";
import { relativeTime, fullTimestamp } from "./time";
import { Button } from "@/components/ui/button";
import { CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TONE_CLASS: Record<string, string> = {
  red: "bg-red-soft text-red",
  amber: "bg-amber-soft text-amber",
  muted: "bg-soft text-muted-foreground",
};

// Rendered rows can group several source lines under one block whose id is its
// first line, so resolve every block whose covered range intersects the anchor.
function rangeElements(start: number, end: number): HTMLElement[] {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[id^="line-"]'))
    .map((el) => ({ el, start: Number(el.id.slice(5)) }))
    .sort((a, b) => a.start - b.start);
  const hits: HTMLElement[] = [];
  for (let i = 0; i < rows.length; i++) {
    const blockEnd = i + 1 < rows.length ? rows[i + 1].start - 1 : Infinity;
    if (rows[i].start <= end && blockEnd >= start) hits.push(rows[i].el);
  }
  return hits;
}

/** Card header: collapse trigger, anchor/round/type/status badges, actions menu. */
export function CommentCardHeader(props: {
  comment: Comment;
  inline: boolean;
  open: boolean;
  drifted?: boolean;
  onEdit: () => void;
}) {
  const { comment, inline, open, drifted = false, onEdit } = props;
  const commands = useReviewCommands();
  const reduced = useReducedMotion() ?? false;
  const meta = CRITIQUE_META[comment.critique_type];
  const lineRange = comment.anchor?.type === "line_range" ? comment.anchor : null;
  const anchorLabel = lineRange
    ? lineRange.start_line === lineRange.end_line
      ? `L${lineRange.start_line}`
      : `L${lineRange.start_line}–${lineRange.end_line}`
    : "";

  function locateLine() {
    if (!lineRange) return;
    const hits = rangeElements(lineRange.start_line, lineRange.end_line);
    if (hits.length === 0) return;
    hits[0].scrollIntoView({ behavior: "smooth", block: "center" });
    for (const el of hits) {
      el.classList.add("ring-2", "ring-blue");
      setTimeout(() => el.classList.remove("ring-2", "ring-blue"), 1200);
    }
  }

  return (
    <header
      className={`flex items-center gap-2 px-3 py-1 ${open ? "border-b border-line-soft" : ""}`}
    >
      <CollapsibleTrigger
        render={
          <button
            type="button"
            aria-label={open ? "Collapse comment" : "Expand comment"}
            className="-m-1 inline-flex size-auto p-1 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-muted-foreground"
          />
        }
      >
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? "" : "-rotate-90"}`}
          aria-hidden
        />
      </CollapsibleTrigger>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        {comment.anchor
          ? lineRange
            ? !inline && (
                <button
                  type="button"
                  onClick={locateLine}
                  title="Jump to these lines"
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded text-muted-foreground transition-colors hover:text-heading hover:underline"
                >
                  <Crosshair size={13} />
                  {anchorLabel}
                </button>
              )
            : !inline && (
                <span className="text-faint" title="Anchored">
                  <Link2 size={13} aria-label="Anchored" />
                </span>
              )
          : null}

        {drifted && (
          <span
            className="text-amber"
            title="Re-anchored to a similar line — the quoted text changed slightly."
          >
            <Waves size={11} aria-label="Re-anchored to a similar line" />
          </span>
        )}

        <span className="text-[11px] text-faint" title={fullTimestamp(comment.inserted_at)}>
          {relativeTime(comment.inserted_at)}
        </span>

        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TONE_CLASS[meta.tone]}`}
        >
          {comment.critique_type}
        </span>

        {comment.status === "pending" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-active-line-border bg-blue-soft px-2 py-0.5 text-[11px] text-blue">
            <span className="size-1.5 rounded-full bg-current pending-pulse" aria-hidden />
            Pending
          </span>
        )}

        {comment.resolved && (
          <motion.span
            aria-label="Resolved"
            {...badgePop(reduced)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-green/35 bg-green/15 px-2 py-0.5 text-[11px] text-green-text"
          >
            <CircleCheck size={11} aria-hidden />
            Resolved
          </motion.span>
        )}
      </div>

      <div className="shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                title="Comment actions"
              >
                <MoreHorizontal size={15} />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-40">
            {comment.status === "pending" && (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil size={14} />
                Edit
              </DropdownMenuItem>
            )}
            {comment.status === "published" && !comment.resolved && (
              <DropdownMenuItem
                onClick={() => void commands.resolveComment.dispatch({ comment_id: comment.id })}
              >
                <CircleCheck size={14} />
                Resolve
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              onClick={() => void commands.deleteComment.dispatch({ comment_id: comment.id })}
            >
              <Trash2 size={14} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
