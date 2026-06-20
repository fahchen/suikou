import { createContext, useContext, useRef } from "react"

import { useMusubiCommand } from "../musubi"
import { useFileStore, useReviewStore } from "./store-context"
import type { CommentsStore, FileStore } from "./types"

/**
 * Built dispatchers returned by `useReviewCommands`. Stacked-file frames in
 * all-files mode are inside a per-file FileStoreProvider, so every dispatcher
 * here already routes to the correct FileStore child.
 */
export type ReviewCommands = ReturnType<typeof useDefaultReviewCommands>

export const ReviewCommandsOverrideContext = createContext<
  Partial<ReviewCommands> | null
>(null)

/** ReviewStore + FileStore command dispatchers. Comment commands route to the
 * CommentsStore grandchild of the active FileStore. */
export function useReviewCommands(): ReviewCommands {
  const base = useDefaultReviewCommands()
  const override = useContext(ReviewCommandsOverrideContext)
  if (!override) return base
  return { ...base, ...override }
}

function useDefaultReviewCommands() {
  const reviewStore = useReviewStore()
  const fileStore = useFileStore()
  const comments = useStableComments(fileStore)
  return {
    addComment: useMusubiCommand(comments, "add_comment"),
    editComment: useMusubiCommand(comments, "edit_comment"),
    deleteComment: useMusubiCommand(comments, "delete_comment"),
    resolveComment: useMusubiCommand(comments, "resolve_comment"),
    reply: useMusubiCommand(comments, "reply"),
    editReply: useMusubiCommand(comments, "edit_reply"),
    deleteReply: useMusubiCommand(comments, "delete_reply"),
    submitReview: useMusubiCommand(reviewStore, "submit_review"),
    removeFile: useMusubiCommand(reviewStore, "remove_file"),
    setDraftVerdict: useMusubiCommand(fileStore, "set_draft_verdict"),
    selectRound: useMusubiCommand(fileStore, "select_round"),
  }
}

/**
 * The CommentsStore grandchild handle, stabilized across teardown windows.
 *
 * `fileStore.comments` is a live lazily-resolved proxy field: while the active
 * FileStore swaps (route change), it can momentarily read `undefined` — the
 * snapshot guard keeps the composer mounted through that window. Retaining the
 * last resolved child keeps every comment dispatcher targeting a real store.
 */
function useStableComments(fileStore: FileStore): CommentsStore {
  const held = useRef<{ fileStore: FileStore; comments: CommentsStore } | null>(null)
  const live = fileStore.comments as CommentsStore | undefined
  if (!held.current || held.current.fileStore !== fileStore || live !== undefined) {
    held.current = { fileStore, comments: live ?? held.current?.comments ?? fileStore.comments as CommentsStore }
  }
  return held.current.comments
}
