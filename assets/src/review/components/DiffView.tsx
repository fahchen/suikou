import { useMemo } from "react"
import { observer } from "mobx-react-lite"
import type { StoreProxy } from "@musubi/react"

import { uiStore } from "../../stores/ui-store"
import { useMusubiCommand } from "../../musubi"
import { DiffRenderer, type DiffAnnotation, type DiffDraft } from "../diff/DiffRenderer"
import { diffSideRows, locateDiffQuote } from "../diff/reanchor"
import { Composer } from "./comments/Composer"
import { StrandedComments } from "./comments/StrandedComments"
import { CommentThread } from "./comments/CommentThread"
import type { Comment, CommentsStoreProxy, CritiqueType } from "./comments/shared"

type FileStoreProxy = StoreProxy<"SuikouWeb.Stores.FileStore", Musubi.Stores>

/** Diff renderer for a file's unified patch. Wraps the Suikou-native
 * `DiffRenderer` (shiki-css-variables + Suikou approve/request tokens) so the
 * diff surface matches source files exactly, and forwards the unified/split
 * toggle from `uiStore`.
 *
 * J3: published `diff_hunk` comments render as inline `CommentThread` cards
 * beneath their anchor's start line via the renderer's `lineAnnotations` slot.
 * The patch on screen follows the live lens (a commit scope, a working tree, a
 * stack step), so each comment re-anchors by its quote against this patch;
 * one whose code is not here gathers in the stranded band (BDR-0024). */
export const DiffView = observer(function DiffView({
  patch,
  path,
  comments,
  fileProxy,
  commentsProxy,
  draftScope,
  readOnly = false,
  focusedCommentId,
  onFocusComment,
}: {
  patch: string
  path?: string
  comments: Comment[]
  fileProxy?: FileStoreProxy | null
  commentsProxy: CommentsStoreProxy | null
  draftScope?: string
  readOnly?: boolean
  focusedCommentId: string | null
  onFocusComment: (commentId: string | null) => void
}) {
  const addComment = useMusubiCommand(fileProxy as FileStoreProxy, "add_comment")

  const submitDraft = (draft: DiffDraft, close: () => void) => (body: string, type: CritiqueType) => {
    if (!fileProxy) return
    addComment
      .dispatch({
        scope: "located",
        critique_type: type,
        body,
        anchor: { type: "diff_hunk", side: draft.side, start_line: draft.start, end_line: draft.end },
      })
      .then(close)
      .catch(() => undefined)
  }
  // Re-anchor each diff-hunk comment by its quote against this patch, then pair
  // it with an annotation on the found start line. Multi-line ranges collapse
  // to a single card under the range's first line, as on GitHub PR reviews. A
  // quote absent from this patch strands the comment rather than pinning it
  // beside unrelated code (or past the end, where it would vanish).
  const { annotations, selectedRange, stranded } = useMemo(() => {
    const rows = { old: diffSideRows(patch, "old"), new: diffSideRows(patch, "new") }
    const items: DiffAnnotation<Comment>[] = []
    const lost: Comment[] = []
    let range: { side: "old" | "new"; start: number; end: number } | null = null
    for (const comment of comments) {
      if (comment.anchor?.type !== "diff_hunk") continue
      const { side, quote, start_line } = comment.anchor
      const at = locateDiffQuote(rows[side], quote, start_line)
      if (!at) {
        lost.push(comment)
        continue
      }
      items.push({ side, startLine: at.start, endLine: at.end, meta: comment })
      if (comment.id === focusedCommentId) range = { side, start: at.start, end: at.end }
    }
    return { annotations: items, selectedRange: range, stranded: lost }
  }, [comments, focusedCommentId, patch])

  const languageHint = useMemo(() => extForPath(path ?? extractPathFromPatch(patch)), [path, patch])

  return (
    <>
      <StrandedComments
        comments={stranded}
        commentsProxy={commentsProxy}
        reason="its code isn't in the current view"
        focusedCommentId={focusedCommentId}
        onFocusComment={onFocusComment}
        className="mx-3 my-2"
      />
      <DiffRenderer<Comment>
        patch={patch}
        diffStyle={uiStore.diffStyle}
        wordDiff={uiStore.wordDiff}
        wrap={uiStore.codeWrap}
        languageHint={languageHint}
        lineAnnotations={annotations}
        selectedRange={selectedRange}
        commentable={!readOnly && !!fileProxy}
        renderComposer={(draft, close) => (
          <Composer
            anchorLabel={diffAnchorLabel(draft)}
            draftKey={draftScope ? `suikou-diff-composer:${draftScope}:${draft.side}:${draft.start}-${draft.end}` : undefined}
            pending={addComment.isPending}
            className="m-0"
            onSubmit={submitDraft(draft, close)}
            onCancel={close}
          />
        )}
        renderAnnotation={(annotation) => {
          const comment = annotation.meta
          return (
            <CommentThread
              comment={comment}
              commentsProxy={commentsProxy}
              className="my-1"
              focused={focusedCommentId === comment.id}
              onFocus={() =>
                onFocusComment(focusedCommentId === comment.id ? null : comment.id)
              }
            />
          )
        }}
      />
    </>
  )
})

function diffAnchorLabel(draft: DiffDraft): string {
  const where = draft.side === "old" ? "old" : "new"
  const span = draft.end > draft.start ? `${draft.start}–${draft.end}` : `${draft.start}`
  return `${where} line ${span}`
}

/** Fallback: derive an extension from the patch's `+++ b/…` header when the
 * caller doesn't thread one in. */
function extractPathFromPatch(patch: string): string | undefined {
  const match = /(?:^|\n)\+\+\+ b\/([^\t\n]+)/.exec(patch)
  return match?.[1]
}

function extForPath(path: string | undefined): string | undefined {
  if (!path) return undefined
  const dot = path.lastIndexOf(".")
  if (dot < 0) return undefined
  return path.slice(dot + 1)
}
