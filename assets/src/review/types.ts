import type { CommandReply, StoreProxy, StoreSnapshot } from "@musubi/react"

import type { CritiqueType } from "../stores/ui-store"

export type ReviewStore = StoreProxy<"SuikouWeb.Stores.ReviewStore", Musubi.Stores>
export type ReviewSnapshot = StoreSnapshot<"SuikouWeb.Stores.ReviewStore", Musubi.Stores>
export type FileStore = StoreProxy<"SuikouWeb.Stores.FileStore", Musubi.Stores>
export type FileSnapshot = StoreSnapshot<"SuikouWeb.Stores.FileStore", Musubi.Stores>
export type CommentsStore = StoreProxy<"SuikouWeb.Stores.CommentsStore", Musubi.Stores>
export type CommentsSnapshot = StoreSnapshot<"SuikouWeb.Stores.CommentsStore", Musubi.Stores>

export type Verdict = "approve" | "request_changes" | "comment"
export type CommentStatus = "pending" | "published"

// Sub-shapes derived from the generated snapshot so a store change can't drift
// them. Named for the many call sites that import them directly.
export type Comment = CommentsSnapshot["items"][number]
export type Anchor = NonNullable<Comment["anchor"]>
export type Reply = Comment["replies"][number]

// The review's file list now rides the `load_review_structure` command result,
// not the live snapshot; this entry shape drives file ordering and navigation.
export type ReviewFileEntry = CommandReply<
  "SuikouWeb.Stores.ReviewStore",
  "load_review_structure",
  Musubi.Stores
>["file_entries"][number]

export const CRITIQUE_META: Record<CritiqueType, { label: string; short: string; tone: string }> = {
  fix_required: { label: "Fix required", short: "Fix", tone: "red" },
  needs_answer: { label: "Needs answer", short: "Needs", tone: "amber" },
  note: { label: "Note", short: "Note", tone: "muted" }
}

export const VERDICT_META: Record<Verdict, { label: string; description: string }> = {
  comment: { label: "Comment", description: "Leave feedback without a verdict" },
  request_changes: { label: "Request changes", description: "Block until the blockers are addressed" },
  approve: { label: "Approve", description: "Sign off on this round" }
}
