import { observer } from "mobx-react-lite"
import { useNavigate } from "@tanstack/react-router"

import { useMusubiSnapshot } from "../musubi"
import { FileRenderHeader } from "./FileRenderHeader"
import { FileVerdictMenu } from "./TopBarVerdictMenu"
import { orderedReviewFiles } from "./file-order"
import { reviewFileTarget } from "./review-navigation"
import { resolveViewKind, viewCapabilities } from "./view-kind"
import { isImagePath, isBinaryContent } from "./file-type"
import { useFileStore } from "./store-context"
import type { ChangeStatus } from "./ChangeStatusIcon"
import type { ReviewFileEntry, ReviewSnapshot, Verdict } from "./types"

export const FileHeader = observer(function FileHeader(props: {
  reviewSnapshot: ReviewSnapshot
  rawView: boolean
  content: string
  verdict: Verdict | null
  onVerdictChange: (verdict: Verdict) => void
}) {
  const { reviewSnapshot, rawView, content, verdict, onVerdictChange } = props
  const fileStore = useFileStore()
  const fileSnapshot = useMusubiSnapshot(fileStore)
  const navigate = useNavigate()

  const title = fileSnapshot.artifact.title
  const viewKind = resolveViewKind({ kind: reviewSnapshot.kind, title })
  const image = isImagePath(title)
  const binary = isBinaryContent(content)
  const fileEntry = reviewSnapshot.file_entries.data?.find(
    (f) => f.artifact_id === fileSnapshot.artifact.id
  )
  const changeStatus: ChangeStatus = fileEntry?.change_status ?? null
  const previewable = viewKind === "file" && !image && !binary
  const capabilities = viewCapabilities({
    kind: viewKind,
    previewable,
    image,
    rawView,
    binary
  })

  const comments = fileSnapshot.comments.items
  const commentCount = comments.filter((c) => c.scope !== "review").length

  function setRawView(next: boolean) {
    void navigate(reviewFileTarget(reviewSnapshot.review_id, title, next))
  }

  const files = orderedReviewFiles(reviewSnapshot.file_entries.data ?? [])

  function commentCountFor(path: string): number {
    // In single-file mode there's only one active file; non-active paths report 0.
    if (path === title) return commentCount
    return 0
  }

  async function selectFile(file: ReviewFileEntry) {
    void navigate(reviewFileTarget(reviewSnapshot.review_id, file.path, rawView))
  }

  return (
    <FileRenderHeader
      variant="single"
      filePath={title}
      changeStatus={changeStatus}
      outlineContent={content}
      viewKind={viewKind}
      commentCount={commentCount}
      capabilities={capabilities}
      rawView={rawView}
      onRawViewChange={setRawView}
      files={files}
      onSelectFile={(file) => void selectFile(file)}
      commentCountFor={commentCountFor}
      verdictChip={
        <FileVerdictMenu
          verdict={verdict}
          onVerdictChange={onVerdictChange}
          comments={comments}
        />
      }
    />
  )
})
