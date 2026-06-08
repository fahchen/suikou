import {
  Crosshair,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Trash2,
  LocateFixed,
  Link2,
  ChevronDown,
} from "lucide-react";

import { CRITIQUE_META, type Comment } from "./types";
import { useReviewCommands } from "./commands";
import { relativeTime } from "./time";
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

/** Card header: collapse trigger, anchor/round/type/status badges, actions menu. */
export function CommentCardHeader(props: {
  comment: Comment;
  inline: boolean;
  open: boolean;
  onEdit: () => void;
  onRelocate: () => void;
}) {
  const { comment, inline, open, onEdit, onRelocate } = props;
  const commands = useReviewCommands();
  const meta = CRITIQUE_META[comment.critique_type];
  const anchorLabel = comment.anchor
    ? comment.anchor.start_line === comment.anchor.end_line
      ? `line ${comment.anchor.start_line}`
      : `lines ${comment.anchor.start_line}-${comment.anchor.end_line}`
    : "unanchored";

  function copyLink() {
    const anchor = comment.anchor ? `line-${comment.anchor.start_line}` : `comment-${comment.id}`;
    void navigator.clipboard?.writeText(
      `${window.location.origin}${window.location.pathname}#${anchor}`,
    );
  }

  return (
    <header
      className={`flex items-center gap-2 px-3 py-2 ${open ? "border-b border-line-soft" : ""}`}
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

      {!inline && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          {comment.anchor && <Crosshair size={13} />}
          {anchorLabel}
        </span>
      )}

      <span className="text-[11px] text-faint">{relativeTime(comment.inserted_at)}</span>

      {comment.carried && comment.original_round != null && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-soft px-1.5 py-0.5 text-[11px] text-muted-foreground"
          title={`Carried from round ${comment.original_round}`}
        >
          <RefreshCw size={11} />R{comment.original_round}
        </span>
      )}

      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TONE_CLASS[meta.tone]}`}>
        {comment.critique_type}
      </span>

      {comment.status === "pending" && (
        <span className="inline-flex items-center gap-1 rounded-full border border-active-line-border bg-blue-soft px-2 py-0.5 text-[11px] text-blue">
          <span className="size-1.5 rounded-full bg-current" aria-hidden />
          Pending
        </span>
      )}
      {comment.resolved && (
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-soft px-2 py-0.5 text-[11px] text-green-text">
          <span className="size-1.5 rounded-full bg-current" aria-hidden />
          Resolved
        </span>
      )}

      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-xs" title="Comment actions">
                <MoreHorizontal size={15} />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-40">
            {comment.outdated && !inline && (
              <DropdownMenuItem onClick={onRelocate}>
                <LocateFixed size={14} />
                Relocate
              </DropdownMenuItem>
            )}
            {comment.outdated && !inline && (
              <DropdownMenuItem onClick={copyLink}>
                <Link2 size={14} />
                Copy link
              </DropdownMenuItem>
            )}
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
