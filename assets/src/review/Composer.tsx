import { observer } from "mobx-react-lite";
import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, HelpCircle, Link2, MessageSquare, SquarePlus } from "lucide-react";

import { uiStore } from "../stores/ui-store";
import { CommentComposer } from "./CommentComposer";
import { useReviewCommands } from "./commands";
import { Button } from "@/components/ui/button";
import { CRITIQUE_META } from "./types";
import type { CritiqueType } from "../stores/ui-store";

const TYPES: CritiqueType[] = ["fix_required", "needs_answer", "note"];

// Type chip vocabulary — mirrors the mockup's `.cmp-type` picker (icon + label,
// pill radius, tinted when pressed) so a reviewer picks severity by the same
// color they will later see on the comment card.
const TYPE_META: Record<CritiqueType, { icon: LucideIcon; className: string }> = {
  fix_required: {
    icon: AlertTriangle,
    className: "bg-red-soft text-red ring-1 ring-inset ring-red/35",
  },
  needs_answer: {
    icon: HelpCircle,
    className: "bg-amber-soft text-amber ring-1 ring-inset ring-amber/35",
  },
  note: {
    icon: MessageSquare,
    className: "bg-soft text-heading ring-1 ring-inset ring-line",
  },
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

  // The draft renders optimistically in the composer's `submitting` state while
  // the command is awaited, then `closeComposer` tears it down on confirmation —
  // exactly as the real comment fades in from the refreshed snapshot, so the two
  // never overlap (that overlap was the flicker). On failure the draft is kept
  // and the composer falls back to editing.
  function submit() {
    const current = ui.draftFor(path);
    if (!current) return Promise.resolve();
    return commands.addComment.dispatch({
      scope: current.scope,
      critique_type: current.type,
      body: current.body.trim(),
      anchor: { type: "line_range", start_line: props.startLine, end_line: props.endLine },
    });
  }

  // Structure follows the mockup's `.composer`: anchor caption (link glyph +
  // "Comment on line N · path") → type-pill row → textarea → footer with
  // Suggest on the left, Cancel and Add on the right.
  const anchorPhrase =
    props.startLine === props.endLine
      ? `line ${props.startLine}`
      : `lines ${props.startLine}-${props.endLine}`;
  const filename = props.filePath
    ? props.filePath.split("/").pop() ?? props.filePath
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="my-1 ml-14 flex flex-col gap-[9px] overflow-hidden rounded-[13px] bg-surface p-3 shadow-[var(--surface-shadow)] ring-1 ring-inset ring-line-strong"
    >
      <div className="inline-flex items-center gap-[7px] text-[11.5px] text-muted-foreground">
        <Link2 size={12} aria-hidden className="text-accent-bright" />
        <span>
          New comment on {anchorPhrase}
          {filename && (
            <>
              {" · "}
              <span className="font-mono text-muted-foreground">{filename}</span>
            </>
          )}
        </span>
      </div>

      <div className="flex flex-wrap gap-[6px]">
        {TYPES.map((option) => {
          const meta = TYPE_META[option];
          const Icon = meta.icon;
          const pressed = type === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={pressed}
              onClick={() => ui.setComposerType(option, path)}
              className={`inline-flex h-[24px] cursor-pointer items-center gap-[5px] rounded-full px-[10px] text-[11px] font-[640] tracking-[-0.005em] transition-colors ${
                pressed
                  ? meta.className
                  : "text-muted-foreground ring-1 ring-inset ring-line hover:bg-hover hover:text-heading"
              }`}
            >
              <Icon size={11} aria-hidden />
              {CRITIQUE_META[option].label}
            </button>
          );
        })}
      </div>

      <CommentComposer
        autoFocus
        textareaClassName="min-h-20 rounded-[9px]"
        placeholder="Leave a comment. Markdown supported."
        value={body}
        onChange={(value) => ui.setComposerBody(value, path)}
        onSubmit={submit}
        onSuccess={() => ui.closeComposer(path)}
        onCancel={() => ui.closeComposer(path)}
        submitLabel="Add comment"
        submitKbd
        disabled={commands.addComment.disabled}
        leadingAction={
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
        }
      />
    </motion.div>
  );
});
