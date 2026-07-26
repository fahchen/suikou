import { observer } from "mobx-react-lite"
import { Bot, User } from "lucide-react"

import { uiStore } from "../../../stores/ui-store"
import type { CommentAuthor } from "./shared"

/** Avatar chip + name for whoever wrote a comment or reply. Several agents review
 * one review at a time, so an agent renders under the name and glyph it named
 * itself with; rows written before names were required fall back to the generic
 * bot. The human is "you" here rather than the server's reserved name — there is
 * one human and it is the person reading — and their glyph is the local
 * Appearance preference.
 *
 * `sm` (thread replies) always labels the speaker, since a reply is only legible
 * next to the ones around it. `md` (a comment header) labels only an agent — the
 * header is a dense row and the human is the unmarked default there. */
export const AuthorBadge = observer(function AuthorBadge({
  author,
  size = "md",
  appearance = "pill",
}: {
  author: CommentAuthor
  size?: "sm" | "md"
  appearance?: "pill" | "bare"
}) {
  const agent = author.kind === "agent"
  const iconSize = size === "sm" ? 10 : 11
  const name = agent ? author.name ?? "agent" : "you"
  const label = size === "sm" || agent ? name : null

  // A comment header with no agent and no chosen glyph has nothing to say: the
  // human is the unmarked default, so leave the row as tight as it was.
  if (size === "md" && !agent && !uiStore.userEmoji) return null

  return (
    <span
      className={`inline-flex shrink-0 items-center text-xs font-bold leading-none ${
        agent
          ? appearance === "bare"
            ? "gap-1 text-accent-bright"
            : `${size === "sm" ? "h-[19px]" : "h-[22px]"} gap-1 rounded-full bg-accent-soft px-1.5 text-accent-bright ring-1 ring-inset ring-accent-edge`
          : "gap-1.5 text-text"
      }`}
    >
      <span
        aria-hidden
        className={`grid shrink-0 place-items-center ${size === "sm" ? "size-[15px]" : "size-[18px]"} ${
          agent ? "" : "rounded-[5px] bg-control text-muted"
        }`}
      >
        {author.icon ? (
          <span className="block text-[11px] leading-none">{author.icon}</span>
        ) : agent ? (
          <Bot size={iconSize} />
        ) : uiStore.userEmoji ? (
          <span className="block text-[11px] leading-none">{uiStore.userEmoji}</span>
        ) : (
          <User size={iconSize} />
        )}
      </span>
      {label && <span className="leading-none">{label}</span>}
    </span>
  )
})
