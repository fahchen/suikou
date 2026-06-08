import { useMusubiCommand } from "../musubi"
import { useReviewStore } from "./store-context"

/** ReviewStore command dispatchers — comment commands route to the CommentsStore child. */
export function useReviewCommands() {
  const store = useReviewStore()
  const comments = store.comments
  return {
    addComment: useMusubiCommand(comments, "add_comment"),
    editComment: useMusubiCommand(comments, "edit_comment"),
    deleteComment: useMusubiCommand(comments, "delete_comment"),
    resolveComment: useMusubiCommand(comments, "resolve_comment"),
    reply: useMusubiCommand(comments, "reply"),
    relocateComment: useMusubiCommand(comments, "relocate_comment"),
    submitReview: useMusubiCommand(store, "submit_review"),
    selectRound: useMusubiCommand(store, "select_round"),
    diffRound: useMusubiCommand(store, "diff_round"),
    closeDiff: useMusubiCommand(store, "close_diff")
  }
}
