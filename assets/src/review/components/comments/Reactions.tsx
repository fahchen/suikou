import { useState, type MouseEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Bot, SmilePlus } from "lucide-react"

import { useMusubiCommand } from "../../../musubi"
import { Popover } from "../../../components/ui/popover"
import {
  HUMAN_REACTIONS,
  reactionGlyph,
  type CommentReaction,
  type CommentsStoreProxy,
  type HumanReactionEmoji,
} from "./shared"

type Target = "comment" | "reply"

/** Name the agents behind an agent chip; an anonymous reactor has no name to show. */
const agentChipTitle = (reaction: CommentReaction): string =>
  reaction.by.length > 0 ? `Reacted by ${reaction.by.map((actor) => actor.name).join(", ")}` : "Agent reaction"

/** One named agent with a glyph badges the chip with it instead of the generic bot. */
const soleAuthorIcon = (reaction: CommentReaction): string | null =>
  reaction.by.length === 1 && reaction.by[0].icon ? reaction.by[0].icon : null

const CHIP_ENTER = { scale: 0.6, opacity: 0 }
const CHIP_SHOWN = { scale: 1, opacity: 1 }
const CHIP_TRANSITION = { duration: 0.15, ease: "easeOut" } as const

/** Reactions on a comment or reply. Humans pick from an approval/opposition
 * scale (`HUMAN_REACTIONS`) via the popover and can toggle their own chips.
 * Agent reactions (any glyph, `actor === "agent"`) render as read-only chips
 * badged with the reacting agent's glyph — the human can't add or remove them.
 * Several agents can land on the same emoji, so the chip's badge and title name
 * who is behind the count. */
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
      {/* initial={false} so chips present on first render don't pop; only chips
          added or removed later animate, with layout easing neighbours over. */}
      <AnimatePresence initial={false}>
        {reactions.map((reaction) => {
          const badge = soleAuthorIcon(reaction)
          return reaction.actor === "agent" ? (
            <motion.span
              key={reaction.emoji}
              layout
              initial={CHIP_ENTER}
              animate={CHIP_SHOWN}
              exit={CHIP_ENTER}
              transition={CHIP_TRANSITION}
              title={agentChipTitle(reaction)}
              className="inline-flex h-[22px] items-center gap-1 rounded-full bg-accent-softer px-2 text-xs ring-1 ring-inset ring-accent-edge"
            >
              <span className="text-xs leading-none">{reactionGlyph(reaction.emoji)}</span>
              {badge ? (
                <span aria-hidden className="text-[11px] leading-none">{badge}</span>
              ) : (
                <Bot size={11} className="text-accent-bright" aria-hidden />
              )}
              {reaction.count > 1 && <span className="tabular-nums text-accent-bright">{reaction.count}</span>}
            </motion.span>
          ) : (
            <motion.button
              key={reaction.emoji}
              layout
              initial={CHIP_ENTER}
              animate={CHIP_SHOWN}
              exit={CHIP_ENTER}
              transition={CHIP_TRANSITION}
              type="button"
              aria-pressed={reaction.mine}
              onClick={(event) => toggle(reaction.emoji as HumanReactionEmoji, event)}
              className={`inline-flex h-[22px] items-center rounded-full px-2 text-xs leading-none ring-1 ring-inset transition-colors ${
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
          {HUMAN_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={emoji}
              onClick={(event) => {
                toggle(emoji, event)
                setOpen(false)
              }}
              className={`grid size-[28px] place-items-center rounded-full text-base transition-colors hover:bg-soft ${
                mine.get(emoji) ? "bg-accent-soft ring-1 ring-inset ring-accent-edge" : ""
              }`}
            >
              {reactionGlyph(emoji)}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  )
}
