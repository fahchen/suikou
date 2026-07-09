import { useState, type MouseEvent } from "react"
import { SmilePlus } from "lucide-react"

import { useMusubiCommand } from "../../../musubi"
import { Popover } from "../../../components/ui/popover"
import { REACTION_EMOJI, REACTION_ORDER, type CommentReaction, type CommentsStoreProxy, type ReactionEmoji } from "./shared"

type Target = "comment" | "reply"

/** E12 reactions on a comment or a reply: applied emoji chips (with counts,
 * self-highlighted) plus an add button that opens the six-emoji picker in a
 * popover. Toggling dispatches the matching add/remove reaction command. */
export function Reactions({
  reactions,
  targetId,
  target,
  commentsProxy,
  className = "px-3 pb-2",
}: {
  reactions: CommentReaction[]
  targetId: string
  target: Target
  commentsProxy: CommentsStoreProxy | null
  className?: string
}) {
  const addComment = useMusubiCommand(commentsProxy as CommentsStoreProxy, "add_reaction")
  const removeComment = useMusubiCommand(commentsProxy as CommentsStoreProxy, "remove_reaction")
  const addReply = useMusubiCommand(commentsProxy as CommentsStoreProxy, "add_reply_reaction")
  const removeReply = useMusubiCommand(commentsProxy as CommentsStoreProxy, "remove_reply_reaction")
  const [open, setOpen] = useState(false)
  const mine = new Map(reactions.map((reaction) => [reaction.emoji, reaction.mine]))

  const toggle = (emoji: ReactionEmoji, event: MouseEvent) => {
    event.stopPropagation()
    if (!commentsProxy) return
    if (target === "reply") {
      const cmd = mine.get(emoji) ? removeReply : addReply
      cmd.dispatch({ reply_id: targetId, emoji }).catch(() => undefined)
    } else {
      const cmd = mine.get(emoji) ? removeComment : addComment
      cmd.dispatch({ comment_id: targetId, emoji }).catch(() => undefined)
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          aria-pressed={reaction.mine}
          onClick={(event) => toggle(reaction.emoji, event)}
          className={`inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11px] tabular-nums ring-1 ring-inset transition-colors ${
            reaction.mine
              ? "bg-accent-soft text-accent-bright ring-accent-edge"
              : "bg-soft text-muted ring-hair-strong hover:text-ink"
          }`}
        >
          <span className="text-[11px] leading-none">{REACTION_EMOJI[reaction.emoji]}</span>
          {reaction.count}
        </button>
      ))}
      <Popover
        open={open}
        onOpenChange={setOpen}
        side="top"
        align="start"
        chrome={false}
        render={
          <button
            type="button"
            aria-label="Add reaction"
            onClick={(event) => event.stopPropagation()}
            className={`grid size-[22px] shrink-0 place-items-center rounded-full text-muted ring-1 ring-inset ring-hair-strong transition-colors hover:bg-soft hover:text-ink ${
              reactions.length === 0 && !open ? "opacity-100 md:opacity-0 md:group-hover/comment:opacity-100 md:group-hover/reply:opacity-100" : ""
            }`}
          >
            <SmilePlus size={13} aria-hidden />
          </button>
        }
      >
        <div className="inline-flex items-center gap-0.5 rounded-full bg-surface p-1 shadow-[0_8px_24px_oklch(0%_0_0/0.25)] ring-1 ring-inset ring-hair-strong">
          {REACTION_ORDER.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={emoji}
              onClick={(event) => {
                toggle(emoji, event)
                setOpen(false)
              }}
              className={`grid size-[28px] place-items-center rounded-full text-[16px] transition-colors hover:bg-soft ${
                mine.get(emoji) ? "bg-accent-soft ring-1 ring-inset ring-accent-edge" : ""
              }`}
            >
              {REACTION_EMOJI[emoji]}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  )
}
