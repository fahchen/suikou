import { useState } from "react";
import { CircleCheck, SquarePlus } from "lucide-react";

import type { Comment } from "./types";
import { useReviewCommands } from "./commands";
import { Button } from "@/components/ui/button";

/** Suggest/reply box plus the resolve action for one comment. */
export function CommentReplyComposer(props: { comment: Comment }) {
  const { comment } = props;
  const commands = useReviewCommands();
  const [body, setBody] = useState("");

  function send() {
    if (!body.trim()) return;
    void commands.reply.dispatch({ comment_id: comment.id, body: body.trim() });
    setBody("");
  }

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-lg border border-line-soft bg-panel p-2">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          title="Insert suggestion block"
          onClick={() => setBody((b) => `${b}${b ? "\n" : ""}\`\`\`suggestion\n\n\`\`\``)}
        >
          <SquarePlus size={13} />
          Suggest
        </Button>
      </div>
      <textarea
        className="min-h-12 w-full resize-y rounded-lg border border-line bg-control px-2 py-1.5 text-[13px]"
        rows={2}
        placeholder="Reply…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex items-center gap-2">
        {!comment.resolved && (
          <Button
            variant="outline"
            size="sm"
            className="border-green/50 bg-green/15 text-green-text hover:bg-green/25"
            disabled={commands.resolveComment.isPending}
            onClick={() => void commands.resolveComment.dispatch({ comment_id: comment.id })}
          >
            <CircleCheck size={14} />
            Resolve
          </Button>
        )}
        <Button
          size="sm"
          className="ml-auto"
          disabled={commands.reply.isPending || !body.trim()}
          onClick={send}
        >
          Reply
        </Button>
      </div>
    </div>
  );
}
