import type { StoreProxy, StoreSnapshot } from "@musubi/react"
import { AlertTriangle, HelpCircle, StickyNote } from "lucide-react"

type ReviewSnapshot = StoreSnapshot<"SuikouWeb.Stores.ReviewStore", Musubi.Stores>

export type Comment = ReviewSnapshot["body"]["files"][number]["comments"]["items"][number]
export type CommentReply = Comment["replies"][number]
export type CommentReaction = Comment["reactions"][number]
export type ReactionEmoji = CommentReaction["emoji"]
export type CommentsStoreProxy = StoreProxy<"SuikouWeb.Stores.CommentsStore", Musubi.Stores>
export type CritiqueType = "fix_required" | "needs_answer" | "note"

/** Canonical reaction order (matches the backend `Reaction.emojis/0`). */
export const REACTION_ORDER: ReactionEmoji[] = ["strong_agree", "agree", "disagree", "strong_disagree", "eyes", "thinking", "check"]

export const REACTION_EMOJI: Record<ReactionEmoji, string> = {
  strong_agree: "\u{1F4AF}",
  agree: "\u{1F44D}",
  disagree: "\u{1F44E}",
  strong_disagree: "❌",
  eyes: "\u{1F440}",
  thinking: "\u{1F914}",
  check: "✅",
}

/** Humans express an approval/opposition scale; agents signal work status. The
 * two sets are disjoint, so an agent-set emoji chip always came from an agent
 * (drives the bot-avatar treatment) and the human picker only offers its own. */
export const HUMAN_REACTIONS: ReactionEmoji[] = ["strong_agree", "agree", "disagree", "strong_disagree"]
export const AGENT_REACTIONS: ReactionEmoji[] = ["eyes", "thinking", "check"]

export const inlineThreadCollapsedKey = (commentId: string): string => `suikou-thread-collapsed:${commentId}`
export const INLINE_COMMENT_MAX_WIDTH_CLASS = "max-w-[760px]"

export const TYPE_META = {
  fix_required: { label: "FIX_REQUIRED", title: "Fix required", Icon: AlertTriangle, card: "bg-type-fix-soft ring-type-fix-edge", pill: "bg-type-fix-soft text-type-fix ring-type-fix-edge" },
  needs_answer: { label: "NEEDS_ANSWER", title: "Needs answer", Icon: HelpCircle, card: "bg-type-ask-soft ring-type-ask-edge", pill: "bg-type-ask-soft text-type-ask ring-type-ask-edge" },
  note: { label: "NOTE", title: "Note", Icon: StickyNote, card: "bg-type-note-soft ring-type-note-edge", pill: "bg-type-note-soft text-muted ring-type-note-edge" },
} as const

export const TYPE_OPTIONS: { value: CritiqueType; label: string; Icon: typeof AlertTriangle; dot: string }[] = [
  { value: "fix_required", label: "Fix required", Icon: AlertTriangle, dot: "bg-type-fix" },
  { value: "needs_answer", label: "Needs answer", Icon: HelpCircle, dot: "bg-type-ask" },
  { value: "note", label: "Note", Icon: StickyNote, dot: "bg-type-note" },
]

export function safeDraft(raw: string | null): { type: CritiqueType; body: string } | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    if (typeof value?.body !== "string") return null
    const type: CritiqueType = value.type === "needs_answer" || value.type === "note" ? value.type : "fix_required"
    return { type, body: value.body }
  } catch {
    return null
  }
}
