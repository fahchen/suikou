import { useState } from "react";
import { observer } from "mobx-react-lite";
import { motion } from "motion/react";
import { SquarePlus } from "lucide-react";

import { ComposerTextarea } from "../ComposerTextarea";
import { useReviewCommands } from "../commands";
import { CRITIQUE_META } from "../types";
import { uiStore, type CritiqueType } from "../../stores/ui-store";
import { Button } from "@/components/ui/button";

const TYPES: CritiqueType[] = ["fix_required", "needs_answer", "note"];

const TYPE_TONE: Record<string, string> = {
  red: "bg-red-soft text-red ring-1 ring-inset ring-red/30",
  amber: "bg-amber-soft text-amber ring-1 ring-inset ring-amber/30",
  muted: "bg-soft text-heading ring-1 ring-inset ring-line",
};

export interface HtmlAnchorTarget {
  artifactId: string;
  selector: string;
  quote: string;
}

/**
 * Composer for element-anchored HTML comments. Rendered as the body of an
 * inline popover (next to the targeted element in the iframe) or as the side
 * rail header. Same component in both placements so the form, validation, and
 * dispatch shape stay identical.
 */
export const HtmlAnchorComposer = observer(function HtmlAnchorComposer(props: {
  target: HtmlAnchorTarget;
  onClose: () => void;
  variant?: "popover" | "rail";
}) {
  const { target, onClose } = props;
  const variant = props.variant ?? "popover";
  const commands = useReviewCommands();
  const [body, setBody] = useState("");
  const [type, setType] = useState<CritiqueType>("note");

  function suggest(): void {
    const fence = `> ${target.quote.split("\n").join("\n> ")}`;
    setBody((prev) => `${prev}${prev ? "\n\n" : ""}${fence}\n\n`);
  }

  async function add(): Promise<void> {
    if (!body.trim()) return;
    await commands.addComment.dispatch({
      scope: "located",
      critique_type: type,
      body: body.trim(),
      anchor: { type: "element", selector: target.selector, quote: target.quote },
    });
    setBody("");
    setType("note");
    uiStore.setHtmlAnchorTarget(null);
    onClose();
  }

  const frame =
    variant === "rail"
      ? "flex flex-col gap-2 rounded-xl border border-blue-soft bg-surface p-3 shadow-[var(--surface-shadow)]"
      : "flex flex-col gap-2";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={frame}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        {variant === "rail" && (
          <span className="text-[12px] font-medium text-heading">New comment on selected region</span>
        )}
        <div className="flex flex-wrap gap-1 sm:ml-auto">
          {TYPES.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={type === kind}
              className={`inline-flex h-6 cursor-pointer items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors ${
                type === kind
                  ? TYPE_TONE[CRITIQUE_META[kind].tone]
                  : "text-faint ring-1 ring-inset ring-line hover:bg-hover hover:text-muted-foreground"
              }`}
              onClick={() => setType(kind)}
            >
              {CRITIQUE_META[kind].label}
            </button>
          ))}
        </div>
      </div>

      <blockquote className="max-h-24 overflow-y-auto whitespace-pre-line break-words rounded-md border border-line bg-editor px-2 py-1.5 text-[12px] text-muted-foreground">
        {target.quote || (
          <em className="not-italic text-faint">No quotable text; anchored to the element.</em>
        )}
      </blockquote>

      <ComposerTextarea
        autoFocus
        className="min-h-20 rounded-md"
        placeholder="Leave a comment. Markdown supported."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onSubmit={() => void add()}
        onCancel={onClose}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={suggest}
          disabled={target.quote === ""}
        >
          <SquarePlus size={13} />
          Quote
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={commands.addComment.isPending || !body.trim()}
            onClick={() => void add()}
          >
            Add comment
          </Button>
        </div>
      </div>
    </motion.div>
  );
});
