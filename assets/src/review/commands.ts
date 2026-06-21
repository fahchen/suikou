import { createContext, useContext, useRef } from "react";

import { useMusubiCommand, useSocketConnected } from "../musubi";
import { useFileStore, useReviewStore } from "./store-context";
import type { CommentsStore, FileStore } from "./types";

/**
 * Built dispatchers returned by `useReviewCommands`. Stacked-file frames in
 * all-files mode are inside a per-file FileStoreProvider, so every dispatcher
 * here already routes to the correct FileStore child.
 */
export type ReviewCommands = ReturnType<typeof useDefaultReviewCommands>;

export const ReviewCommandsOverrideContext = createContext<Partial<ReviewCommands> | null>(null);

/** ReviewStore + FileStore command dispatchers. Comment commands route to the
 * CommentsStore grandchild of the active FileStore. */
export function useReviewCommands(): ReviewCommands {
  const base = useDefaultReviewCommands();
  const override = useContext(ReviewCommandsOverrideContext);
  if (!override) return base;
  return { ...base, ...override };
}

function useDefaultReviewCommands() {
  const reviewStore = useReviewStore();
  const fileStore = useFileStore();
  const comments = useStableComments(fileStore);
  // A dropped/reconnecting socket rejects every command with "Store is not
  // connected"; gate writes on the live connection so buttons disable instead of
  // throwing.
  const connected = useSocketConnected();
  const gate = <T extends { isPending: boolean }>(command: T) => ({
    ...command,
    disabled: !connected || command.isPending,
  });
  return {
    addComment: gate(useMusubiCommand(fileStore, "add_comment")),
    editComment: gate(useMusubiCommand(comments, "edit_comment")),
    deleteComment: gate(useMusubiCommand(comments, "delete_comment")),
    resolveComment: gate(useMusubiCommand(comments, "resolve_comment")),
    reply: gate(useMusubiCommand(comments, "reply")),
    editReply: gate(useMusubiCommand(comments, "edit_reply")),
    deleteReply: gate(useMusubiCommand(comments, "delete_reply")),
    submitReview: gate(useMusubiCommand(reviewStore, "submit_review")),
    removeFile: gate(useMusubiCommand(reviewStore, "remove_file")),
    setDraftVerdict: gate(useMusubiCommand(fileStore, "set_draft_verdict")),
  };
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
  const held = useRef<{ fileStore: FileStore; comments: CommentsStore } | null>(null);
  const live = fileStore.comments as CommentsStore | undefined;
  if (!held.current || held.current.fileStore !== fileStore || live !== undefined) {
    held.current = {
      fileStore,
      comments: live ?? held.current?.comments ?? (fileStore.comments as CommentsStore),
    };
  }
  return held.current.comments;
}
