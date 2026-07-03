import { useState } from "react";

import type { Comment } from "./types";
import { CommentComposer } from "./CommentComposer";
import { CritiqueTypePicker } from "./Composer";
import { useReviewCommands } from "./commands";
import type { CritiqueType } from "../stores/ui-store";

/** Edit a pending comment's body and critique type (F5 in the state catalog).
 * Uses the same pill picker + Cancel/Save footer as the new-comment composer
 * so both flows share one control vocabulary. */
export function CommentEditPanel(props: { comment: Comment; onDone: () => void }) {
  const { comment, onDone } = props;
  const commands = useReviewCommands();
  const [body, setBody] = useState(comment.body);
  const [type, setType] = useState<CritiqueType>(comment.critique_type);

  return (
    <div className="flex flex-col gap-[9px]">
      <CritiqueTypePicker value={type} onChange={setType} />
      <CommentComposer
        autoFocus
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
        submitKbd
        disabled={commands.editComment.disabled}
        textareaClassName="min-h-16"
      />
    </div>
  );
}
