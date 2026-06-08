import { useState } from "react";

import type { Comment } from "./types";
import { useReviewCommands } from "./commands";
import { Button } from "@/components/ui/button";

/** Re-anchor an outdated comment to a new line range. Owns its own input state. */
export function CommentRelocatePanel(props: { comment: Comment; onDone: () => void }) {
  const { comment, onDone } = props;
  const commands = useReviewCommands();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  function submit() {
    const startLine = Number(start);
    const endLine = Number(end || start);
    if (!Number.isInteger(startLine) || startLine < 1 || endLine < startLine) return;
    void commands.relocateComment.dispatch({
      comment_id: comment.id,
      start_line: startLine,
      end_line: endLine,
    });
    onDone();
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-line-soft bg-panel p-2">
      <span className="text-[12px] text-muted-foreground">Re-anchor to line</span>
      <input
        type="number"
        min={1}
        value={start}
        onChange={(e) => setStart(e.target.value)}
        placeholder="start"
        className="w-16 rounded-lg border border-line bg-control px-2 py-1 text-[12px]"
      />
      <span className="text-faint">–</span>
      <input
        type="number"
        min={1}
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        placeholder="end"
        className="w-16 rounded-lg border border-line bg-control px-2 py-1 text-[12px]"
      />
      <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={onDone}>
        Cancel
      </Button>
      <Button
        size="sm"
        disabled={commands.relocateComment.isPending || !start.trim()}
        onClick={submit}
      >
        Re-anchor
      </Button>
    </div>
  );
}
