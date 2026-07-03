import {
  AlertTriangle,
  Crosshair,
  HelpCircle,
  Info,
  Link2,
  Waves,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
  ChevronDown,
  CircleCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { CRITIQUE_META, type Comment } from "./types";
import type { CritiqueType } from "../stores/ui-store";
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

// Type pill uppercase + icon, matching the mockup's `.tpill` chip:
// red triangle for fix_required, blue question for needs_answer, neutral lines
// for note. Ring uses the same token family as the card background so the
// chip reads as a tinted slab, not a stroked border.
const TYPE_PILL: Record<CritiqueType, { icon: LucideIcon; label: string; className: string }> = {
  fix_required: {
    icon: AlertTriangle,
    label: "FIX_REQUIRED",
    className: "bg-red-soft text-red ring-1 ring-inset ring-red/35",
  },
  needs_answer: {
    icon: HelpCircle,
    label: "NEEDS_ANSWER",
    className: "bg-amber-soft text-amber ring-1 ring-inset ring-amber/35",
  },
  note: {
    icon: MessageSquare,
    label: "NOTE",
    className: "bg-soft text-heading ring-1 ring-inset ring-line",
  },
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
  // Meta drives the accessible label on the pill; visual glyph + copy come from
  // TYPE_PILL so the chip matches the mockup exactly.
  void CRITIQUE_META;
  const pill = TYPE_PILL[comment.critique_type];
  const PillIcon = pill.icon;
  const lineRange = comment.anchor?.type === "line_range" ? comment.anchor : null;
  // "on line 13 · Round 2" phrasing from the mockup thread head; range collapses
  // to "on lines N-M" when the anchor spans more than one line.
  const anchorPhrase = lineRange
    ? lineRange.start_line === lineRange.end_line
      ? `on line ${lineRange.start_line}`
      : `on lines ${lineRange.start_line}–${lineRange.end_line}`
    : "";
  const roundLabel =
    comment.authored_round > 0 ? `Round ${comment.authored_round}` : null;

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

      <span
        className={`inline-flex h-[19px] shrink-0 items-center gap-1 rounded-full px-2 font-mono text-[10px] font-[800] tracking-[0.03em] ${pill.className}`}
        aria-label={comment.critique_type}
      >
        <PillIcon size={11} aria-hidden />
        {pill.label}
      </span>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        {comment.anchor && lineRange ? (
          inline ? (
            <span className="font-mono text-[11px] text-muted-foreground">
              {anchorPhrase}
              {roundLabel && (
                <>
                  <span className="mx-1 text-faint" aria-hidden>
                    ·
                  </span>
                  {roundLabel}
                </>
              )}
            </span>
          ) : (
            <button
              type="button"
              onClick={locateLine}
              title="Jump to these lines"
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded font-mono text-[11px] text-muted-foreground transition-colors hover:text-heading hover:underline"
            >
              <Crosshair size={12} aria-hidden />
              {anchorPhrase}
              {roundLabel && (
                <>
                  <span className="mx-0.5 text-faint" aria-hidden>
                    ·
                  </span>
                  {roundLabel}
                </>
              )}
            </button>
          )
        ) : comment.anchor ? (
          !inline && (
            <span className="text-faint" title="Anchored">
              <Link2 size={13} aria-label="Anchored" />
            </span>
          )
        ) : (
          <span
            className="font-mono text-[11px] text-muted-foreground"
            title={
              comment.scope === "review"
                ? "This note applies to the whole review, not a single file."
                : "This note applies to the whole file, not a single line."
            }
          >
            {comment.scope === "review" ? "on whole review" : "on whole file"}
            {roundLabel && (
              <>
                <span className="mx-1 text-faint" aria-hidden>
                  ·
                </span>
                {roundLabel}
              </>
            )}
          </span>
        )}

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

        {comment.status === "pending" && (
          <span
            title="Not yet published — batches with the review until you Submit."
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 font-mono text-[10px] font-[700] uppercase tracking-[0.04em] text-amber ring-1 ring-inset ring-amber/35"
          >
            <Info size={11} aria-hidden />
            Pending
          </span>
        )}

        {comment.resolved && (
          <motion.span
            aria-label={comment.resolved_round ? `Resolved in round ${comment.resolved_round}` : "Resolved"}
            {...badgePop(reduced)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green/15 px-2 py-0.5 font-mono text-[10px] font-[700] uppercase tracking-[0.04em] text-green-text ring-1 ring-inset ring-green/35"
          >
            <CircleCheck size={11} aria-hidden />
            Resolved
            {comment.resolved_round != null && (
              <>
                <span className="mx-0.5 text-green-text/60" aria-hidden>·</span>
                R{comment.resolved_round}
              </>
            )}
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
