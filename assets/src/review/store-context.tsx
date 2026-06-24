import { createContext, useContext, type ReactNode } from "react"
import type { ThemedToken } from "shiki"

import type { Comment, FileStore, ReviewSnapshot, ReviewStore, Verdict } from "./types"
import type { MergedFileView } from "./use-review-structure"
import type { RenderedBlock } from "../markdown/render"
import type { StatusFilter, CritiqueType } from "../stores/ui-store"

const StoreContext = createContext<ReviewStore | null>(null)

export function ReviewStoreProvider(props: { store: ReviewStore; children: ReactNode }) {
  return <StoreContext.Provider value={props.store}>{props.children}</StoreContext.Provider>
}

export function useReviewStore(): ReviewStore {
  const store = useContext(StoreContext)
  if (!store) {
    throw new Error("useReviewStore must be used within a ReviewStoreProvider")
  }
  return store
}

const FileStoreContext = createContext<FileStore | null>(null)

export function FileStoreProvider(props: { store: FileStore; children: ReactNode }) {
  return <FileStoreContext.Provider value={props.store}>{props.children}</FileStoreContext.Provider>
}

export function useFileStore(): FileStore {
  const store = useContext(FileStoreContext)
  if (!store) {
    throw new Error("useFileStore must be used within a FileStoreProvider")
  }
  return store
}

export function useOptionalFileStore(): FileStore | null {
  return useContext(FileStoreContext)
}

/**
 * Per-round view data computed once by the review layout route and shared with
 * the rendered/raw child routes, so switching views never re-renders markdown.
 */
export interface ReviewView {
  /** Per-file view: live snapshot fields plus static identity from the
   * structure command, merged by path. */
  snapshot: MergedFileView
  /** Review-level kind — "file" or "diff" — for resolving the view component. */
  reviewKind: "file" | "diff"
  /** Full review snapshot — for review_id and review-level fields. */
  reviewSnapshot: ReviewSnapshot
  /** Reviewed source text fetched live from the content route ("" for images). */
  content: string
  /** Set when the content route fails (file deleted, moved, or unreadable). */
  contentError: string | null
  blocks: RenderedBlock[]
  loading: boolean
  comments: Comment[]
  previewable: boolean
  /** Per-line syntax tokens for the raw view, or null for plain-text files. */
  rawLines: ThemedToken[][] | null
  /** Current locally-held verdict for the mounted artifact, or `null` when the
   * file is untouched (no verdict picked yet). */
  verdict: Verdict | null
  /** Persist a new verdict choice for the mounted artifact. */
  onVerdictChange: (verdict: Verdict) => void
}

export const ReviewViewContext = createContext<ReviewView | null>(null)

export function ReviewViewProvider(props: { value: ReviewView; children: ReactNode }) {
  return <ReviewViewContext.Provider value={props.value}>{props.children}</ReviewViewContext.Provider>
}

export function useReviewView(): ReviewView {
  const view = useContext(ReviewViewContext)
  if (!view) {
    throw new Error("useReviewView must be used within a ReviewViewProvider")
  }
  return view
}

/** Whether any comment filter is currently narrowing the list. */
export function isFiltering(
  status: StatusFilter,
  typeFilters: Record<CritiqueType, boolean>
): boolean {
  if (status !== "all") return true
  return Object.values(typeFilters).some((on) => !on)
}

/** Applies the status + critique-type filters to a comment list. */
export function visibleComments(
  comments: Comment[],
  status: StatusFilter,
  typeFilters: Record<CritiqueType, boolean>
): Comment[] {
  return comments.filter((comment) => {
    if (status === "resolved" && !comment.resolved) return false
    if (status === "unresolved" && comment.resolved) return false
    return typeFilters[comment.critique_type]
  })
}

/** Whether an unresolved fix_required blocks a clean approval. */
export function hasUnresolvedBlocker(comments: Comment[]): boolean {
  return comments.some((c) => c.critique_type === "fix_required" && !c.resolved)
}
