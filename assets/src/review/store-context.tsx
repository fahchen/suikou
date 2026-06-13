import { createContext, useContext, type ReactNode } from "react"
import type { ThemedToken } from "shiki"

import type { Comment, ReviewSnapshot, ReviewStore } from "./types"
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

/**
 * Per-round view data computed once by the review layout route and shared with
 * the rendered/raw child routes, so switching views never re-renders markdown.
 */
export interface ReviewView {
  snapshot: ReviewSnapshot
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
}

const ReviewViewContext = createContext<ReviewView | null>(null)

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
