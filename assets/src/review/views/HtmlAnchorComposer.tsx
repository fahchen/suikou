import { useState } from "react";
import { observer } from "mobx-react-lite";
import { motion } from "motion/react";
import { SquarePlus } from "lucide-react";

import { CommentComposer } from "../CommentComposer";
import { useReviewCommands } from "../commands";
import { uiStore, type CritiqueType } from "../../stores/ui-store";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  function submit(text: string): Promise<unknown> {
    return commands.addComment.dispatch({
      scope: "located",
      critique_type: type,
      body: text,
      anchor: { type: "element", selector: target.selector, quote: target.quote },
    });
  }

  function done(): void {
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
      {variant === "rail" && (
        <span className="text-[12px] font-medium text-heading">New comment on selected region</span>
      )}

      <blockquote className="max-h-24 overflow-y-auto whitespace-pre-line break-words rounded-md border border-line bg-editor px-2 py-1.5 text-[12px] text-muted-foreground">
        {target.quote || (
          <em className="not-italic text-faint">No quotable text; anchored to the element.</em>
        )}
      </blockquote>

      <CommentComposer
        autoFocus
        textareaClassName="min-h-20 rounded-md"
        placeholder="Leave a comment. Markdown supported."
        value={body}
        onChange={setBody}
        onSubmit={submit}
        onSuccess={done}
        onCancel={onClose}
        submitLabel="Add comment"
        disabled={commands.addComment.disabled}
        leadingAction={
          <>
            <Select value={type} onValueChange={(v) => setType(v as CritiqueType)}>
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fix_required">fix_required</SelectItem>
                <SelectItem value="needs_answer">needs_answer</SelectItem>
                <SelectItem value="note">note</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              title="Quote selected text"
              aria-label="Quote selected text"
              onClick={suggest}
              disabled={target.quote === ""}
            >
              <SquarePlus size={13} />
            </Button>
          </>
        }
      />
    </motion.div>
  );
});
