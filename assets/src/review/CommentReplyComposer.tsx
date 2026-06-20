import { useState } from "react";
import { CircleCheck, MessageSquarePlus, SquarePlus } from "lucide-react";

import type { Comment } from "./types";
import { useReviewCommands } from "./commands";
import { useMediaQuery, WIDE_QUERY } from "../hooks/use-media-query";
import { ComposerTextarea } from "./ComposerTextarea";
import { Button } from "@/components/ui/button";

/** Suggest/reply box plus the resolve action for one comment. */
export function CommentReplyComposer(props: { comment: Comment }) {
  const { comment } = props;
  const commands = useReviewCommands();
  const wide = useMediaQuery(WIDE_QUERY);
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(false);
  const replyLabel = comment.resolved ? "Unresolve" : "Reply";
  const replyHint = comment.resolved ? "Reply and reopen this comment" : null;
  const placeholder = comment.resolved ? "Reply to reopen this comment…" : "Reply…";

  // Wide screens keep the full composer open; narrow ones collapse it to a
  // one-tap Reply so a column of inline cards stays scannable.
  const open = wide || expanded;

  function send() {
    if (!body.trim()) return;
    void commands.reply.dispatch({ comment_id: comment.id, body: body.trim() });
    setBody("");
    setExpanded(false);
  }

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
          title={replyHint ?? undefined}
          onClick={() => setExpanded(true)}
        >
          <MessageSquarePlus size={14} />
          {replyLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-lg border border-line-soft bg-panel p-2">
      {replyHint && <p className="text-[12px] text-faint">{replyHint}.</p>}
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
      <ComposerTextarea
        autoFocus={expanded}
        placeholder={placeholder}
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
          {replyLabel}
        </Button>
      </div>
    </div>
  );
}
