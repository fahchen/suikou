import { createContext, useContext, useRef } from "react"

import { useMusubiCommand } from "../musubi"
import { useReviewStore } from "./store-context"
import type { ReviewStore } from "./types"

/**
 * Built dispatchers returned by `useReviewCommands`. Per-file frames in
 * all-files mode override `addComment` so its dispatch lands on whichever
 * stacked file the gutter belongs to, via `add_file_comment` rather than the
 * CommentsStore child (which is bound to the mounted artifact).
 */
export type ReviewCommands = ReturnType<typeof useDefaultReviewCommands>

export const ReviewCommandsOverrideContext = createContext<
  Partial<ReviewCommands> | null
>(null)

/** ReviewStore command dispatchers — comment commands route to the CommentsStore child. */
export function useReviewCommands(): ReviewCommands {
  const base = useDefaultReviewCommands()
  const override = useContext(ReviewCommandsOverrideContext)
  if (!override) return base
  return { ...base, ...override }
}

function useDefaultReviewCommands() {
  const store = useReviewStore()
  const comments = useStableComments(store)
  return {
    addComment: useMusubiCommand(comments, "add_comment"),
    editComment: useMusubiCommand(comments, "edit_comment"),
    deleteComment: useMusubiCommand(comments, "delete_comment"),
    resolveComment: useMusubiCommand(comments, "resolve_comment"),
    reply: useMusubiCommand(comments, "reply"),
    submitReview: useMusubiCommand(store, "submit_review"),
    setDraftVerdict: useMusubiCommand(store, "set_draft_verdict"),
    selectRound: useMusubiCommand(store, "select_round"),
    openFile: useMusubiCommand(store, "open_file"),
    addFileComment: useMusubiCommand(store, "add_file_comment"),
    setFileDraftVerdict: useMusubiCommand(store, "set_file_draft_verdict")
  }
}

/**
 * The CommentsStore child handle, stabilized across teardown windows.
 *
 * `store.comments` is a *live* lazily-resolved proxy field: while the active
 * artifact swaps (or the root mount is evicted after its grace period), it can
 * momentarily read `undefined` — even on the same frame the snapshot still
 * reports `artifact`, so the shell's snapshot guard keeps the comment composer
 * mounted. Passing that `undefined` straight into `useMusubiCommand` binds the
 * command's dispatch to an undefined proxy, which later throws inside the
 * library's error path (`[...proxy.__musubi_store_id__]`).
 *
 * Retaining the last resolved child (reset when the root store identity itself
 * changes) keeps every comment dispatcher targeting a real store through that
 * window, while still following a genuine artifact switch to the new child.
 */
function useStableComments(store: ReviewStore): ReviewStore["comments"] {
  const held = useRef<{ store: ReviewStore; comments: ReviewStore["comments"] } | null>(null)
  const live = store.comments
  if (!held.current || held.current.store !== store || live !== undefined) {
    held.current = { store, comments: live }
  }
  return held.current.comments
}
