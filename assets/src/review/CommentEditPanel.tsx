import { useState } from "react";

import type { Comment } from "./types";
import { CommentComposer } from "./CommentComposer";
import { useReviewCommands } from "./commands";
import type { CritiqueType } from "../stores/ui-store";
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

  return (
    <CommentComposer
      value={body}
      onChange={setBody}
      onSubmit={(text) =>
        commands.editComment.dispatch({
          comment_id: comment.id,
          body: text,
          critique_type: type,
        })
      }
      onSuccess={onDone}
      onCancel={onDone}
      submitLabel="Save"
      disabled={commands.editComment.disabled}
      textareaClassName="min-h-16"
      leadingAction={
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
      }
    />
  );
}
