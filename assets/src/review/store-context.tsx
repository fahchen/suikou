import { createContext, useContext, type ReactNode } from "react"

import type { Comment, ReviewStore } from "./types"
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

const ArtifactNavContext = createContext<(id: string) => void>(() => {})

export function ArtifactNavProvider(props: { select: (id: string) => void; children: ReactNode }) {
  return <ArtifactNavContext.Provider value={props.select}>{props.children}</ArtifactNavContext.Provider>
}

/** Switches which artifact the ReviewStore is mounted against. */
export function useSelectArtifact(): (id: string) => void {
  return useContext(ArtifactNavContext)
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

/** Pending (unpublished) comments — the count the Submit button publishes. */
export function pendingCount(comments: Comment[]): number {
  return comments.filter((comment) => comment.status === "pending").length
}

/** Whether an unresolved fix_required blocks a clean approval. */
export function hasUnresolvedBlocker(comments: Comment[]): boolean {
  return comments.some((c) => c.critique_type === "fix_required" && !c.resolved)
}
