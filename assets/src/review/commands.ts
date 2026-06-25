import { createContext, useContext, useRef } from "react";

import { useMusubiCommand, useMusubiSnapshot, useSocketConnected } from "../musubi";
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
  // Writes need the live store actually hydrated, not just the transport up.
  // After a reload the structure paints instantly from its cache while the
  // ReviewStore root is still mounting, so the buttons look ready before the
  // store can take a command — a tap then would reject "Store is not connected".
  // The file snapshot is defined only once the root has mounted and its first
  // patch landed, so gate writes on that (plus the live socket).
  const connected = useSocketConnected();
  // Call the snapshot hook unconditionally — a `connected && useMusubiSnapshot(...)`
  // short-circuit would skip the hook while disconnected and break hook order on
  // the next render (the "Should have a queue" crash on a Safari background/resume,
  // where the socket drops then reconnects).
  const fileSnapshot = useMusubiSnapshot(fileStore);
  const ready = connected && fileSnapshot !== undefined;
  const gate = <T extends { isPending: boolean }>(command: T) => ({
    ...command,
    disabled: !ready || command.isPending,
  });
  const wrap = <T extends { isPending: boolean; dispatch: (...args: never[]) => Promise<unknown> }>(
    command: T,
  ) => gate(resilient(command));
  return {
    addComment: wrap(useMusubiCommand(fileStore, "add_comment")),
    editComment: wrap(useMusubiCommand(comments, "edit_comment")),
    deleteComment: wrap(useMusubiCommand(comments, "delete_comment")),
    resolveComment: wrap(useMusubiCommand(comments, "resolve_comment")),
    reply: wrap(useMusubiCommand(comments, "reply")),
    editReply: wrap(useMusubiCommand(comments, "edit_reply")),
    deleteReply: wrap(useMusubiCommand(comments, "delete_reply")),
    submitReview: wrap(useMusubiCommand(reviewStore, "submit_review")),
    removeFile: wrap(useMusubiCommand(reviewStore, "remove_file")),
    setDraftVerdict: wrap(useMusubiCommand(fileStore, "set_draft_verdict")),
  };
}

// Retry a command that rejects with "Store is not connected". After an iOS
// Safari resume reload the phoenix socket reopens a beat before the musubi
// channel re-joins, so a command fired in that window rejects before it ever
// reaches the server — safe to retry. Never retries timeouts (the push may have
// landed), so a genuine server rejection still surfaces.
function resilient<
  T extends { dispatch: (...args: never[]) => Promise<unknown> },
>(command: T): T {
  const dispatch = (async (...args: Parameters<T["dispatch"]>) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await command.dispatch(...args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("not connected") && attempt < 9) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }
        throw error;
      }
    }
  }) as T["dispatch"];
  return { ...command, dispatch };
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
