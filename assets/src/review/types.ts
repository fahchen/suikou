import type { StoreProxy } from "@musubi/react"

import type { CommentScope, CritiqueType } from "../stores/ui-store"

export type ReviewStore = StoreProxy<"SuikouWeb.Stores.ReviewStore", Musubi.Stores>

export type Verdict = "approve" | "request_changes" | "comment"
export type CommentStatus = "pending" | "published"

export interface Anchor {
  start_line: number
  end_line: number
  quote: string
}

export interface Reply {
  id: string
  author: "human" | "agent"
  body: string
  inserted_at: string
}

export interface Comment {
  id: string
  scope: CommentScope
  critique_type: CritiqueType
  status: CommentStatus
  body: string
  resolved: boolean
  resolved_round: number | null
  outdated: boolean
  original_round: number | null
  carried: boolean
  inserted_at: string
  anchor: Anchor | null
  replies: Reply[]
}

export interface RoundSummary {
  number: number
  content_hash: string
  verdict: Verdict | null
  comment_count: number
}

export interface ArtifactSummary {
  id: string
  title: string
  approved: boolean
  latest_round: number | null
}

export interface DiffSegment {
  op: "eq" | "ins" | "del"
  value: string
}

export interface DiffComment {
  id: string
  critique_type: CritiqueType
  body: string
}

export interface RoundDiff {
  from: number
  to: number
  text: DiffSegment[]
  resolved: DiffComment[]
  added: DiffComment[]
  carried_forward: DiffComment[]
  verdict_from: Verdict | null
  verdict_to: Verdict | null
}

export interface ReviewSnapshot {
  artifact: { id: string; title: string; approved: boolean; approved_round: number | null }
  artifacts: ArtifactSummary[]
  rounds: RoundSummary[]
  current_round: { number: number; content: string; is_latest: boolean }
  comments: { items: Comment[] }
  latest_verdict: Verdict | null
  diff: RoundDiff | null
}

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
