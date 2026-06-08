import { useState } from "react";
import { motion } from "motion/react";

import { CRITIQUE_META, type Comment } from "./types";
import { useReviewCommands } from "./commands";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Crosshair,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Trash2,
  CircleCheck,
  SquarePlus,
  LocateFixed,
  Link2,
  ChevronDown,
} from "lucide-react";
import type { CritiqueType } from "../stores/ui-store";

const TONE_CLASS: Record<string, string> = {
  red: "bg-red-soft text-red",
  amber: "bg-amber-soft text-amber",
  muted: "bg-soft text-muted-foreground",
};

/**
 * `context` tailors the affordances to where the card lives. An "inline" card
 * sits next to its own line in the editor, so the anchor label and the locate
 * cluster (relocate, copy-link) are redundant and hidden; the "rail" card in
 * the side list keeps them, since position there is not self-evident.
 */
export function CommentCard(props: { comment: Comment; context?: "inline" | "rail" }) {
  const { comment, context = "rail" } = props;
  const inline = context === "inline";
  const commands = useReviewCommands();
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [editType, setEditType] = useState<CritiqueType>(comment.critique_type);
  const [replyBody, setReplyBody] = useState("");
  const [relocating, setRelocating] = useState(false);
  const [relocateStart, setRelocateStart] = useState("");
  const [relocateEnd, setRelocateEnd] = useState("");

  const meta = CRITIQUE_META[comment.critique_type];
  const anchorLabel = comment.anchor
    ? comment.anchor.start_line === comment.anchor.end_line
      ? `line ${comment.anchor.start_line}`
      : `lines ${comment.anchor.start_line}-${comment.anchor.end_line}`
    : "unanchored";

  function saveEdit() {
    if (!editBody.trim()) return;
    void commands.editComment.dispatch({
      comment_id: comment.id,
      body: editBody.trim(),
      critique_type: editType,
    });
    setEditing(false);
  }

  function sendReply() {
    if (!replyBody.trim()) return;
    void commands.reply.dispatch({ comment_id: comment.id, body: replyBody.trim() });
    setReplyBody("");
  }

  function submitRelocate() {
    const start = Number(relocateStart);
    const end = Number(relocateEnd || relocateStart);
    if (!Number.isInteger(start) || start < 1 || end < start) return;
    void commands.relocateComment.dispatch({
      comment_id: comment.id,
      start_line: start,
      end_line: end,
    });
    setRelocating(false);
    setRelocateStart("");
    setRelocateEnd("");
  }

  function copyLink() {
    const anchor = comment.anchor ? `line-${comment.anchor.start_line}` : `comment-${comment.id}`;
    void navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}#${anchor}`);
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="rounded-lg border border-line bg-surface text-[13px] shadow-[var(--surface-shadow)]"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
      <header
        className={`flex items-center gap-2 px-3 py-2 ${open ? "border-b border-line-soft" : ""}`}
      >
        <CollapsibleTrigger
          render={
            <button
              type="button"
              aria-label={open ? "Collapse comment" : "Expand comment"}
              className="-m-1 inline-flex shrink-0 items-center rounded p-1 text-faint hover:bg-hover hover:text-muted-foreground"
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

        {comment.carried && comment.original_round != null && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-soft px-1.5 py-0.5 text-[11px] text-muted-foreground"
            title={`Carried from round ${comment.original_round}`}
          >
            <RefreshCw size={11} />R{comment.original_round}
          </span>
        )}

        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TONE_CLASS[meta.tone]}`}>
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
                <DropdownMenuItem
                  onClick={() => {
                    setRelocating(true);
                    setRelocateStart("");
                    setRelocateEnd("");
                  }}
                >
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
              <DropdownMenuItem
                onClick={() => {
                  setEditing(true);
                  setEditBody(comment.body);
                  setEditType(comment.critique_type);
                }}
              >
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

      <CollapsibleContent>
      <div className="flex flex-col gap-2 px-3 py-2.5">
        {comment.outdated && (
          <p className="text-[12px] text-amber">
            {inline
              ? "Lost its anchor — the quoted line changed. Re-anchor from the side rail, or delete."
              : "Lost its anchor — the quoted line changed. Re-anchor or delete."}
          </p>
        )}

        {relocating && !inline && (
          <div className="flex items-center gap-2 rounded-md border border-line-soft bg-panel p-2">
            <span className="text-[12px] text-muted-foreground">Re-anchor to line</span>
            <input
              type="number"
              min={1}
              value={relocateStart}
              onChange={(e) => setRelocateStart(e.target.value)}
              placeholder="start"
              className="w-16 rounded border border-line bg-control px-2 py-1 text-[12px]"
            />
            <span className="text-faint">–</span>
            <input
              type="number"
              min={1}
              value={relocateEnd}
              onChange={(e) => setRelocateEnd(e.target.value)}
              placeholder="end"
              className="w-16 rounded border border-line bg-control px-2 py-1 text-[12px]"
            />
            <button
              type="button"
              className="ml-auto rounded px-2 py-1 text-[12px] text-muted-foreground hover:bg-hover"
              onClick={() => setRelocating(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded bg-blue px-3 py-1 text-[12px] font-medium text-on-accent disabled:opacity-50"
              disabled={commands.relocateComment.isPending || !relocateStart.trim()}
              onClick={submitRelocate}
            >
              Re-anchor
            </button>
          </div>
        )}

        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              className="min-h-16 w-full resize-y rounded border border-line bg-control px-2 py-1.5 text-[13px]"
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Select value={editType} onValueChange={(v) => setEditType(v as CritiqueType)}>
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fix_required">fix_required</SelectItem>
                  <SelectItem value="needs_answer">needs_answer</SelectItem>
                  <SelectItem value="note">note</SelectItem>
                </SelectContent>
              </Select>
              <button
                type="button"
                className="ml-auto rounded px-2 py-1 text-[12px] text-muted-foreground hover:bg-hover"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-blue px-3 py-1 text-[12px] font-medium text-on-accent disabled:opacity-50"
                disabled={commands.editComment.isPending}
                onClick={saveEdit}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap leading-relaxed text-text">{comment.body}</p>
        )}

        {comment.replies.map((reply) => (
          <div
            key={reply.id}
            className={`rounded-md border-l-2 px-2.5 py-1.5 ${
              reply.author === "agent" ? "border-blue bg-reply-agent" : "border-line bg-reply"
            }`}
          >
            <div className="mb-0.5 flex items-center gap-2 text-[12px]">
              <strong className="text-heading">{reply.author === "agent" ? "Agent" : "You"}</strong>
            </div>
            <p className="whitespace-pre-wrap leading-relaxed text-text">{reply.body}</p>
          </div>
        ))}

        {!editing && (
          <div className="mt-1 flex flex-col gap-2 rounded-md border border-line-soft bg-panel p-2">
            <div className="flex items-center">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-muted-foreground hover:bg-hover"
                title="Insert suggestion block"
                onClick={() =>
                  setReplyBody((b) => `${b}${b ? "\n" : ""}\`\`\`suggestion\n\n\`\`\``)
                }
              >
                <SquarePlus size={13} />
                Suggest
              </button>
            </div>
            <textarea
              className="min-h-12 w-full resize-y rounded border border-line bg-control px-2 py-1.5 text-[13px]"
              rows={2}
              placeholder="Reply…"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
            />
            <div className="flex items-center gap-2">
              {!comment.resolved && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded border border-green/50 bg-green/15 px-2 py-1 text-[12px] text-green-text hover:bg-green/25 disabled:opacity-50"
                  disabled={commands.resolveComment.isPending}
                  onClick={() => void commands.resolveComment.dispatch({ comment_id: comment.id })}
                >
                  <CircleCheck size={14} />
                  Resolve
                </button>
              )}
              <button
                type="button"
                className="ml-auto rounded bg-blue px-3 py-1 text-[12px] font-medium text-on-accent disabled:opacity-50"
                disabled={commands.reply.isPending || !replyBody.trim()}
                onClick={sendReply}
              >
                Reply
              </button>
            </div>
          </div>
        )}
      </div>
      </CollapsibleContent>
      </Collapsible>
    </motion.article>
  );
}
