import { createContext, useContext } from "react"

import { useMusubiCommand } from "../musubi"
import { useReviewStore } from "./store-context"

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
  const comments = store.comments
  return {
    addComment: useMusubiCommand(comments, "add_comment"),
    editComment: useMusubiCommand(comments, "edit_comment"),
    deleteComment: useMusubiCommand(comments, "delete_comment"),
    resolveComment: useMusubiCommand(comments, "resolve_comment"),
    unresolveComment: useMusubiCommand(comments, "unresolve_comment"),
    reply: useMusubiCommand(comments, "reply"),
    submitReview: useMusubiCommand(store, "submit_review"),
    setDraftVerdict: useMusubiCommand(store, "set_draft_verdict"),
    selectRound: useMusubiCommand(store, "select_round"),
    openFile: useMusubiCommand(store, "open_file"),
    addFileComment: useMusubiCommand(store, "add_file_comment"),
    setFileDraftVerdict: useMusubiCommand(store, "set_file_draft_verdict")
  }
}
