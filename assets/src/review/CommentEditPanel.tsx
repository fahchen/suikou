import { useState } from "react";

import type { Comment } from "./types";
import { useReviewCommands } from "./commands";
import type { CritiqueType } from "../stores/ui-store";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Edit a comment's body and critique type. Owns its own draft state. */
export function CommentEditPanel(props: { comment: Comment; onDone: () => void }) {
  const { comment, onDone } = props;
  const commands = useReviewCommands();
  const [body, setBody] = useState(comment.body);
  const [type, setType] = useState<CritiqueType>(comment.critique_type);

  function save() {
    if (!body.trim()) return;
    void commands.editComment.dispatch({
      comment_id: comment.id,
      body: body.trim(),
      critique_type: type,
    });
    onDone();
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="min-h-16 w-full resize-y rounded-lg border border-line bg-control px-2 py-1.5 text-[13px]"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex items-center gap-2">
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
        <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" disabled={commands.editComment.isPending} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}
