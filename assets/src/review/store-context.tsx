import { createContext, useContext, useEffect, type ReactNode } from "react"
import type { ThemedToken } from "shiki"

import type { Comment, FileSnapshot, FileStore, ReviewSnapshot, ReviewStore, Verdict } from "./types"
import type { RenderedBlock } from "../markdown/render"
import { uiStore, type StatusFilter, type CritiqueType } from "../stores/ui-store"

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
  /** Per-file snapshot: artifact, rounds, current_round, etc. */
  snapshot: FileSnapshot
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

/**
 * Merges a file's optimistic comments (shown the instant the reviewer submits)
 * into its server thread, and drops one once its real counterpart arrives in the
 * snapshot. Match is by body + line anchor — exact for the just-submitted
 * comment, since the server resolves the same anchor against the same content.
 * Keyed by plain file path so it survives the mint a first comment triggers.
 */
export function useThreadItems(path: string, serverItems: Comment[]): Comment[] {
  const pending = uiStore.optimisticFor(path)

  useEffect(() => {
    for (const optimistic of pending) {
      if (serverItems.some((server) => sameComment(server, optimistic))) {
        uiStore.dropOptimisticComment(path, optimistic.id)
      }
    }
  })

  return mergeOptimistic(serverItems, pending)
}

/** Appends optimistic comments whose real counterpart is not yet in the thread. */
export function mergeOptimistic(serverItems: Comment[], pending: Comment[]): Comment[] {
  if (pending.length === 0) return serverItems
  const unmatched = pending.filter(
    (optimistic) => !serverItems.some((server) => sameComment(server, optimistic))
  )
  return unmatched.length === 0 ? serverItems : [...serverItems, ...unmatched]
}

function sameComment(a: Comment, b: Comment): boolean {
  return a.body === b.body && sameAnchor(a.anchor, b.anchor)
}

function sameAnchor(a: Comment["anchor"], b: Comment["anchor"]): boolean {
  if (!a || !b) return !a && !b
  if (a.type !== b.type) return false
  if (!("start_line" in a) || !("start_line" in b)) return true
  return a.start_line === b.start_line && a.end_line === b.end_line
}
