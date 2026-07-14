import type { StoreProxy } from "@musubi/react"

import { useMusubiCommand } from "../../../musubi"
import { Composer } from "./Composer"
import { INLINE_COMMENT_MAX_WIDTH_CLASS, type CritiqueType } from "./shared"

type FileStoreProxy = StoreProxy<"SuikouWeb.Stores.FileStore", Musubi.Stores>

/**
 * Composer for a whole-file (`scope: "artifact"`) comment — no line anchor.
 * Shared by the single-file side rail and the stacked scan view so both author
 * file-level comments the same way.
 */
export function FileCommentComposer({
  fileProxy,
  draftKey,
  onClose,
}: {
  fileProxy: FileStoreProxy
  draftKey: string
  onClose: () => void
}) {
  const addComment = useMusubiCommand(fileProxy, "add_comment")

  const submit = (body: string, type: CritiqueType) => {
    addComment.dispatch({ scope: "artifact", critique_type: type, body, anchor: null }).then(onClose).catch(() => undefined)
  }

  return (
    <Composer
      anchorLabel="whole file"
      draftKey={draftKey}
      pending={addComment.isPending}
      className={`m-0 ${INLINE_COMMENT_MAX_WIDTH_CLASS}`}
      onSubmit={submit}
      onCancel={onClose}
    />
  )
}
