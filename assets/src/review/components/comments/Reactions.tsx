import { useState, type MouseEvent } from "react"
import { SmilePlus } from "lucide-react"

import { useMusubiCommand } from "../../../musubi"
import { REACTION_EMOJI, REACTION_ORDER, type Comment, type CommentsStoreProxy, type ReactionEmoji } from "./shared"

/** E12 reactions: applied emoji chips (with counts, self-highlighted) plus an
 * add button that reveals the six-emoji picker. Toggling dispatches
 * add/remove_reaction on the comment's store. */
export function Reactions({ comment, commentsProxy }: { comment: Comment; commentsProxy: CommentsStoreProxy | null }) {
  const addCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "add_reaction")
  const removeCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "remove_reaction")
  const [trayOpen, setTrayOpen] = useState(false)
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
      <button
        type="button"
        aria-label="Add reaction"
        onClick={(event) => {
          event.stopPropagation()
          setTrayOpen((open) => !open)
        }}
        className={`grid size-[22px] shrink-0 place-items-center rounded-full text-muted ring-1 ring-inset ring-hair-strong transition-colors hover:bg-soft hover:text-ink ${
          applied.length === 0 && !trayOpen ? "opacity-100 md:opacity-0 md:group-hover/comment:opacity-100" : ""
        }`}
      >
        <SmilePlus size={13} aria-hidden />
      </button>
      {trayOpen && (
        <div className="inline-flex items-center gap-0.5 rounded-full bg-surface p-1 shadow-sm ring-1 ring-inset ring-hair-strong">
          {REACTION_ORDER.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={emoji}
              onClick={(event) => {
                toggle(emoji, event)
                setTrayOpen(false)
              }}
              className={`grid size-[26px] place-items-center rounded-full text-[15px] transition-colors hover:bg-soft ${
                mine.get(emoji) ? "bg-accent-soft ring-1 ring-inset ring-accent-edge" : ""
              }`}
            >
              {REACTION_EMOJI[emoji]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
