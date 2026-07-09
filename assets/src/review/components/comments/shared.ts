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
export const REACTION_ORDER: ReactionEmoji[] = ["thumbs_up", "check", "eyes", "tada", "heart", "pray"]

export const REACTION_EMOJI: Record<ReactionEmoji, string> = {
  thumbs_up: "\u{1F44D}",
  check: "✅",
  eyes: "\u{1F440}",
  tada: "\u{1F389}",
  heart: "❤️",
  pray: "\u{1F64F}",
}

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

export function compactCritiqueLabel(type: CritiqueType): string {
  return TYPE_META[type].label.replace("_REQUIRED", "").replace("NEEDS_", "")
}
