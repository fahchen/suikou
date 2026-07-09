import { useState, type MouseEvent } from "react"
import { SmilePlus } from "lucide-react"

import { useMusubiCommand } from "../../../musubi"
import { Popover } from "../../../components/ui/popover"
import { REACTION_EMOJI, REACTION_ORDER, type Comment, type CommentsStoreProxy, type ReactionEmoji } from "./shared"

/** E12 reactions: applied emoji chips (with counts, self-highlighted) plus an
 * add button that opens the six-emoji picker in a popover. Toggling dispatches
 * add/remove_reaction on the comment's store. */
export function Reactions({ comment, commentsProxy }: { comment: Comment; commentsProxy: CommentsStoreProxy | null }) {
  const addCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "add_reaction")
  const removeCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "remove_reaction")
  const [open, setOpen] = useState(false)
  const applied = comment.reactions
  const mine = new Map(applied.map((reaction) => [reaction.emoji, reaction.mine]))

  const toggle = (emoji: ReactionEmoji, event: MouseEvent) => {
    event.stopPropagation()
    if (!commentsProxy) return
    const cmd = mine.get(emoji) ? removeCmd : addCmd
    cmd.dispatch({ comment_id: comment.id, emoji }).catch(() => undefined)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
      {applied.map((reaction) => (
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
              applied.length === 0 && !open ? "opacity-100 md:opacity-0 md:group-hover/comment:opacity-100" : ""
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
