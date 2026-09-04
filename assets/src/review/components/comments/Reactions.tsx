import { useState, type MouseEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Bot, SmilePlus } from "lucide-react"

import { useMusubiCommand } from "../../../musubi"
import { Popover } from "../../../components/ui/popover"
import { AuthorBadge } from "./AuthorBadge"
import {
  HUMAN_REACTIONS,
  reactionGlyph,
  type CommentReaction,
  type CommentsStoreProxy,
  type HumanReactionEmoji,
} from "./shared"

type Target = "comment" | "reply"

/** Name the agents behind an agent marker; an anonymous reactor has no name to show. */
const agentChipTitle = (reaction: CommentReaction): string =>
  reaction.by.length > 0 ? `Reacted by ${reaction.by.map((actor) => actor.name).join(", ")}` : "Agent reaction"

// Agent pills and human chips are the same shell so the row reads as one scale.
const CHIP = "inline-flex h-[22px] shrink-0 items-center rounded-full ring-1 ring-inset coarse:h-[28px]"
const CHIP_ENTER = { scale: 0.6, opacity: 0 }
const CHIP_SHOWN = { scale: 1, opacity: 1 }
const CHIP_TRANSITION = { duration: 0.15, ease: "easeOut" } as const

/** Reactions on a comment or reply. Each chip is the same pill: an agent
 * reaction (`actor === "agent"`) reads "who reacted, then what they said" and
 * is read-only, while the human's own chip toggles off when pressed. Several
 * agents can land on the same emoji, so the chip counts and its title names
 * them. The picker sits first in the row and steps aside once a human reaction
 * is there — there is only ever one. */
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
  // One human reaction per comment: once it is there the picker has nothing to
  // add, so it steps aside. Press the chip to take the reaction back.
  const humanReacted = reactions.some((reaction) => reaction.actor === "human")

  const toggle = (emoji: HumanReactionEmoji, event: MouseEvent) => {
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
      {/* The picker keeps the first slot so it never moves as chips come and go. */}
      {!humanReacted && (
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
              className="grid size-[22px] shrink-0 place-items-center rounded-full text-muted ring-1 ring-inset ring-hair-strong transition-colors coarse:size-[28px] hover:bg-soft hover:text-ink"
            >
              <SmilePlus size={13} aria-hidden />
            </button>
          }
        >
          <div className="inline-flex items-center gap-0.5 rounded-full bg-surface p-1 shadow-[0_8px_24px_oklch(0%_0_0/0.25)] ring-1 ring-inset ring-hair-strong">
            {HUMAN_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={emoji}
                onClick={(event) => {
                  toggle(emoji, event)
                  setOpen(false)
                }}
                className="grid size-[28px] place-items-center rounded-full text-base transition-colors hover:bg-soft"
              >
                {reactionGlyph(emoji)}
              </button>
            ))}
          </div>
        </Popover>
      )}
      {/* initial={false} so chips present on first render don't pop; only chips
          added or removed later animate, and they fade in place rather than
          sliding the row around. popLayout takes a leaving chip out of the flow
          at once, so the row does not shuffle right and back while it fades. */}
      <AnimatePresence initial={false} mode="popLayout">
        {reactions.map((reaction) => {
          const agent = reaction.by[0]
          return reaction.actor === "agent" ? (
            <motion.span
              key={reaction.emoji}
              initial={CHIP_ENTER}
              animate={CHIP_SHOWN}
              exit={CHIP_ENTER}
              transition={CHIP_TRANSITION}
              title={agentChipTitle(reaction)}
              // One pill, same height as a human chip: who reacted, then what
              // they said. Corner-pinned glyphs used to hang outside the tile.
              className={`${CHIP} gap-1 bg-soft px-1.5 ring-hair-strong`}
            >
              {agent ? (
                <AuthorBadge author={{ kind: "agent", ...agent }} size="sm" appearance="bare" />
              ) : (
                <Bot size={11} className="text-muted" aria-hidden />
              )}
              <span className="text-[11px] leading-none">{reactionGlyph(reaction.emoji)}</span>
              {reaction.count > 1 && <span className="font-mono text-[10px] leading-none text-muted">×{reaction.count}</span>}
            </motion.span>
          ) : (
            <motion.button
              key={reaction.emoji}
              initial={CHIP_ENTER}
              animate={CHIP_SHOWN}
              exit={CHIP_ENTER}
              transition={CHIP_TRANSITION}
              type="button"
              aria-pressed={reaction.mine}
              onClick={(event) => toggle(reaction.emoji as HumanReactionEmoji, event)}
              className={`${CHIP} px-2 text-xs leading-none transition-colors coarse:px-2.5 ${
                reaction.mine
                  ? "bg-accent-soft text-accent-bright ring-accent-edge"
                  : "bg-soft text-muted ring-hair-strong hover:text-ink"
              }`}
            >
              {reactionGlyph(reaction.emoji)}
            </motion.button>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
