import { useMusubiCommand } from "../musubi"
import { useReviewStore } from "./store-context"

/** All ReviewStore command dispatchers, bound to the mounted store. */
export function useReviewCommands() {
  const store = useReviewStore()
  return {
    addComment: useMusubiCommand(store, "add_comment"),
    editComment: useMusubiCommand(store, "edit_comment"),
    deleteComment: useMusubiCommand(store, "delete_comment"),
    resolveComment: useMusubiCommand(store, "resolve_comment"),
    reply: useMusubiCommand(store, "reply"),
    submitReview: useMusubiCommand(store, "submit_review"),
    selectRound: useMusubiCommand(store, "select_round"),
    relocateComment: useMusubiCommand(store, "relocate_comment"),
    diffRound: useMusubiCommand(store, "diff_round"),
    closeDiff: useMusubiCommand(store, "close_diff"),
    dismiss: useMusubiCommand(store, "dismiss")
  }
}
