import { useState } from "react";
import { CircleCheck, MessageSquarePlus, SquarePlus } from "lucide-react";

import type { Comment } from "./types";
import { useReviewCommands } from "./commands";
import { useMediaQuery, WIDE_QUERY } from "../hooks/use-media-query";
import { Button } from "@/components/ui/button";

/** Suggest/reply box plus the resolve action for one comment. */
export function CommentReplyComposer(props: { comment: Comment }) {
  const { comment } = props;
  const commands = useReviewCommands();
  const wide = useMediaQuery(WIDE_QUERY);
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(false);

  // Wide screens keep the full composer open; narrow ones collapse it to a
  // one-tap Reply so a column of inline cards stays scannable.
  const open = wide || expanded;

  function send() {
    if (!body.trim()) return;
    void commands.reply.dispatch({ comment_id: comment.id, body: body.trim() });
    setBody("");
    setExpanded(false);
  }

  // A resolved comment reopens only when the human replies to it (which clears
  // its resolved state), so it offers no explicit unresolve action — only an
  // open published comment shows the Resolve button.
  const resolveAction = comment.status === "published" && !comment.resolved && (
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
  );

  if (!open) {
    return (
      <div className="mt-1 flex items-center gap-2">
        {resolveAction}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto text-muted-foreground"
          onClick={() => setExpanded(true)}
        >
          <MessageSquarePlus size={14} />
          Reply
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-lg border border-line-soft bg-panel p-2">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          title="Insert suggestion block"
          onClick={() => setBody((b) => `${b}${b ? "\n" : ""}\`\`\`suggestion\n\n\`\`\``)}
        >
          <SquarePlus size={13} />
          Suggest
        </Button>
      </div>
      <textarea
        autoFocus={expanded}
        className="min-h-12 w-full resize-y rounded-lg border border-line bg-control px-2 py-1.5 text-[13px] focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25"
        rows={2}
        placeholder="Reply…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex items-center gap-2">
        {resolveAction}
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
