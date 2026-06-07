import { observer } from "mobx-react-lite";
import { motion } from "motion/react";

import { uiStore } from "../stores/ui-store";
import { useReviewCommands } from "./commands";
import { SuggestIcon } from "./icons";
import type { CritiqueType } from "../stores/ui-store";

const TYPES: CritiqueType[] = ["fix_required", "needs_answer", "note"];

/** Inline "new comment" composer anchored to a line range. */
export const Composer = observer(function Composer(props: { startLine: number; endLine: number }) {
  const ui = uiStore;
  const commands = useReviewCommands();

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

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="my-1 ml-14 flex flex-col gap-2 overflow-hidden rounded-lg border border-blue-soft bg-surface p-3 shadow-[var(--surface-shadow)]"
    >
      <div className="flex items-center gap-3">
        <span className="text-[12px] font-medium text-heading">
          New comment on{" "}
          {props.startLine === props.endLine
            ? `line ${props.startLine}`
            : `lines ${props.startLine}-${props.endLine}`}
        </span>
        <div className="ml-auto flex gap-1">
          {TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`rounded px-2 py-1 text-[11px] ${
                ui.composerType === type
                  ? "bg-blue text-on-accent"
                  : "bg-soft text-muted hover:bg-hover"
              }`}
              onClick={() => ui.setComposerType(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <textarea
        autoFocus
        className="min-h-20 w-full resize-y rounded border border-line bg-control px-2 py-1.5 text-[13px]"
        placeholder="Leave a comment. Markdown supported."
        value={ui.composerBody}
        onChange={(e) => ui.setComposerBody(e.target.value)}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-muted hover:bg-hover"
          onClick={() =>
            ui.setComposerBody(
              `${ui.composerBody}${ui.composerBody ? "\n" : ""}\`\`\`suggestion\n\n\`\`\``,
            )
          }
        >
          <SuggestIcon size={13} />
          Suggest
        </button>
        <span className="text-[11px] text-faint">
          Saved as a pending draft until you submit the review.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="rounded px-2 py-1 text-[12px] text-muted hover:bg-hover"
            onClick={() => ui.closeComposer()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-blue px-3 py-1 text-[12px] font-medium text-on-accent disabled:opacity-50"
            disabled={commands.addComment.isPending || !ui.composerBody.trim()}
            onClick={add}
          >
            Add comment
          </button>
        </div>
      </div>
    </motion.div>
  );
});
