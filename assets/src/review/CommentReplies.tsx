import type { Comment } from "./types";
import { relativeTime, fullTimestamp } from "./time";

/** Renders the reply thread under a comment. */
export function CommentReplies(props: { replies: Comment["replies"] }) {
  return (
    <>
      {props.replies.map((reply) => (
        <div
          key={reply.id}
          className={`rounded-lg border px-2.5 py-1.5 ${
            reply.author === "agent"
              ? "border-active-line-border bg-reply-agent"
              : "border-line bg-reply"
          }`}
        >
          <div className="mb-0.5 flex items-baseline gap-2 text-[12px]">
            <strong className="text-heading">{reply.author === "agent" ? "Agent" : "You"}</strong>
            <span className="text-[11px] text-faint" title={fullTimestamp(reply.inserted_at)}>
              {relativeTime(reply.inserted_at)}
            </span>
          </div>
          <p className="whitespace-pre-wrap leading-relaxed text-text">{reply.body}</p>
        </div>
      ))}
    </>
  );
}
