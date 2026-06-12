import {
  Crosshair,
  Unlink,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Trash2,
  ChevronDown,
} from "lucide-react";

import { CRITIQUE_META, type Comment } from "./types";
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
  onEdit: () => void;
}) {
  const { comment, inline, open, onEdit } = props;
  const commands = useReviewCommands();
  const meta = CRITIQUE_META[comment.critique_type];
  const anchorLabel = comment.anchor
    ? comment.anchor.start_line === comment.anchor.end_line
      ? `L${comment.anchor.start_line}`
      : `L${comment.anchor.start_line}–${comment.anchor.end_line}`
    : "";

  function locateLine() {
    if (!comment.anchor) return;
    const hits = rangeElements(comment.anchor.start_line, comment.anchor.end_line);
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
            className="-m-1 inline-flex shrink-0 items-center rounded-md p-1 text-faint hover:bg-hover hover:text-muted-foreground"
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
          ? !inline && (
              <button
                type="button"
                onClick={locateLine}
                title="Jump to these lines"
                className="inline-flex shrink-0 items-center gap-1 rounded text-muted-foreground hover:text-heading hover:underline"
              >
                <Crosshair size={13} />
                {anchorLabel}
              </button>
            )
          : (
            <span className="text-faint" title="No anchor">
              <Unlink size={13} aria-label="No anchor" />
            </span>
          )}

        <span className="text-[11px] text-faint" title={fullTimestamp(comment.inserted_at)}>
          {relativeTime(comment.inserted_at)}
        </span>

        {comment.carried && comment.original_round != null && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-soft px-1.5 py-0.5 text-[11px] text-muted-foreground"
            title={`Carried from round ${comment.original_round}`}
          >
            <RefreshCw size={11} />R{comment.original_round}
          </span>
        )}

        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TONE_CLASS[meta.tone]}`}
        >
          {comment.critique_type}
        </span>

        {comment.status === "pending" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-active-line-border bg-blue-soft px-2 py-0.5 text-[11px] text-blue">
            <span className="size-1.5 rounded-full bg-current" aria-hidden />
            Pending
          </span>
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
            <DropdownMenuItem onClick={onEdit}>
              <Pencil size={14} />
              Edit
            </DropdownMenuItem>
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
