import { observer } from "mobx-react-lite";
import { motion } from "motion/react";

import { uiStore } from "../stores/ui-store";
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
}) {
  const ui = uiStore;
  const commands = useReviewCommands();

  // Seed a GitHub-style suggestion fence with the anchored lines' current text so
  // the reviewer edits from the existing source instead of an empty block.
  function suggest() {
    const fence = `\`\`\`suggestion\n${props.selectedText}\n\`\`\``;
    ui.setComposerBody(`${ui.composerBody}${ui.composerBody ? "\n" : ""}${fence}`);
  }

  function add() {
    if (!ui.composerBody.trim()) return;
    void commands.addComment.dispatch({
      scope: ui.composerScope,
      critique_type: ui.composerType,
      body: ui.composerBody.trim(),
      start_line: props.startLine,
      end_line: props.endLine,
    });
    ui.closeComposer();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      add();
    } else if (e.key === "Escape") {
      e.preventDefault();
      ui.closeComposer();
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
        <span className="hidden text-[11px] text-faint pointer-coarse:inline">
          Tap another line to extend.
        </span>
        <div className="flex flex-wrap gap-1 sm:ml-auto">
          {TYPES.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={ui.composerType === type}
              className={`pointer-coarse:h-8 inline-flex h-6 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors ${
                ui.composerType === type
                  ? TYPE_TONE[CRITIQUE_META[type].tone]
                  : "text-faint ring-1 ring-inset ring-line hover:bg-hover hover:text-muted-foreground"
              }`}
              onClick={() => ui.setComposerType(type)}
            >
              {CRITIQUE_META[type].label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        autoFocus
        className="min-h-20 w-full resize-y rounded-md border border-line bg-control px-2 py-1.5 text-[13px] focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25"
        placeholder="Leave a comment. Markdown supported."
        value={ui.composerBody}
        onChange={(e) => ui.setComposerBody(e.target.value)}
        onKeyDown={onKeyDown}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-muted-foreground pointer-coarse:min-h-8"
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
            className="text-muted-foreground pointer-coarse:min-h-9"
            onClick={() => ui.closeComposer()}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="pointer-coarse:min-h-9"
            disabled={commands.addComment.isPending || !ui.composerBody.trim()}
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
