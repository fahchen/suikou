import { observer } from "mobx-react-lite";
import { motion } from "motion/react";

import { uiStore } from "../stores/ui-store";
import { ComposerTextarea } from "./ComposerTextarea";
import { useReviewCommands } from "./commands";
import { SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CRITIQUE_META } from "./types";
import type { CritiqueType } from "../stores/ui-store";

const TYPES: CritiqueType[] = ["fix_required", "needs_answer", "note"];

// Selected chip wears the same tone vocabulary as the comment-card badge so the
// reviewer picks severity by the color they'll later see on the card.
const TYPE_TONE: Record<string, string> = {
  red: "bg-red-soft text-red ring-1 ring-inset ring-red/30",
  amber: "bg-amber-soft text-amber ring-1 ring-inset ring-amber/30",
  muted: "bg-soft text-heading ring-1 ring-inset ring-line",
};

/** Inline "new comment" composer anchored to a line range. */
export const Composer = observer(function Composer(props: {
  startLine: number;
  endLine: number;
  selectedText: string;
  /** File scope this draft belongs to; `null` is single-file legacy scope. */
  filePath?: string | null;
}) {
  const ui = uiStore;
  const commands = useReviewCommands();
  const path = props.filePath ?? null;
  const draft = ui.draftFor(path);
  const body = draft?.body ?? "";
  const type = draft?.type ?? "note";

  // Seed a GitHub-style suggestion fence with the anchored lines' current text so
  // the reviewer edits from the existing source instead of an empty block.
  function suggest() {
    const fence = `\`\`\`suggestion\n${props.selectedText}\n\`\`\``;
    ui.setComposerBody(`${body}${body ? "\n" : ""}${fence}`, path);
  }

  function add() {
    // Close the composer the instant you submit, so it never overlaps the real
    // comment fading in from the refreshed snapshot (the overlap was the flicker).
    // `closeComposer` deletes the draft synchronously, so a double-fire (tap-tap,
    // or Enter+click in one React batch) sees it gone and bails — one dispatch.
    const current = ui.draftFor(path);
    if (!current || !current.body.trim()) return;
    void commands.addComment.dispatch({
      scope: current.scope,
      critique_type: current.type,
      body: current.body.trim(),
      anchor: { type: "line_range", start_line: props.startLine, end_line: props.endLine },
    });
    ui.closeComposer(path);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      add();
    } else if (e.key === "Escape") {
      e.preventDefault();
      ui.closeComposer(path);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="my-1 ml-14 flex flex-col gap-2 overflow-hidden rounded-lg border border-blue-soft bg-surface p-3 shadow-[var(--surface-shadow)]"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <span className="text-[12px] font-medium text-heading">
          New comment on{" "}
          {props.startLine === props.endLine
            ? `line ${props.startLine}`
            : `lines ${props.startLine}-${props.endLine}`}
        </span>
        <span className="hidden text-[11px] text-faint">
          Tap another line to extend.
        </span>
        <div className="flex flex-wrap gap-1 sm:ml-auto">
          {TYPES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={type === option}
              className={`inline-flex h-6 cursor-pointer items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors ${
                type === option
                  ? TYPE_TONE[CRITIQUE_META[option].tone]
                  : "text-faint ring-1 ring-inset ring-line hover:bg-hover hover:text-muted-foreground"
              }`}
              onClick={() => ui.setComposerType(option, path)}
            >
              {CRITIQUE_META[option].label}
            </button>
          ))}
        </div>
      </div>

      <ComposerTextarea
        autoFocus
        className="min-h-20 rounded-md"
        placeholder="Leave a comment. Markdown supported."
        value={body}
        onChange={(e) => ui.setComposerBody(e.target.value, path)}
        onKeyDown={onKeyDown}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={suggest}
        >
          <SquarePlus size={13} />
          Suggest
        </Button>
        <span className="hidden text-[11px] text-faint sm:inline">
          Saved as a pending draft until you submit the review.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => ui.closeComposer(path)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={commands.addComment.disabled || !body.trim()}
            onClick={add}
          >
            Add comment
            <kbd
              aria-hidden
              className="hidden rounded bg-on-accent/20 px-1 font-sans text-[10px] leading-4 sm:inline"
            >
              ⌘⏎
            </kbd>
          </Button>
        </div>
      </div>
    </motion.div>
  );
});
