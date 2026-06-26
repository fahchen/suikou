import { observer } from "mobx-react-lite"
import { useNavigate } from "@tanstack/react-router"

import { useMusubiSnapshot } from "../musubi"
import { FileRenderHeader } from "./FileRenderHeader"
import { FileVerdictMenu } from "./TopBarVerdictMenu"
import { orderedReviewFiles } from "./file-order"
import { reviewFileTarget } from "./review-navigation"
import { resolveViewKind, viewCapabilities } from "./view-kind"
import { isImagePath, isBinaryContent } from "./file-type"
import { useFileStore, visibleComments } from "./store-context"
import {
  structureEntry,
  structureFile,
  useReviewStructure,
  type StructureFileEntry,
} from "./use-review-structure"
import { uiStore } from "../stores/ui-store"
import type { ChangeStatus } from "./ChangeStatusIcon"
import type { Verdict } from "./types"

export const FileHeader = observer(function FileHeader(props: {
  sourceView: boolean
  content: string
  verdict: Verdict | null
  onVerdictChange: (verdict: Verdict) => void
}) {
  const { sourceView, content, verdict, onVerdictChange } = props
  const fileStore = useFileStore()
  const fileSnapshot = useMusubiSnapshot(fileStore)
  const structure = useReviewStructure()
  const navigate = useNavigate()

  // Absent for a frame mid-reconnect (store node not re-hydrated yet).
  if (!fileSnapshot) return null

  // The file's static identity (title, change status) comes from `structure`,
  // joined to the live row by path; comments stay live.
  const path = fileSnapshot.path
  const title = structureFile(structure, path)?.artifact?.title ?? path
  const viewKind = resolveViewKind({ kind: structure.kind, title })
  const image = isImagePath(title)
  const binary = isBinaryContent(content)
  const changeStatus: ChangeStatus = structureEntry(structure, path)?.change_status ?? null
  const previewable = viewKind === "file" && !image && !binary
  const capabilities = viewCapabilities({
    kind: viewKind,
    previewable,
    image,
    sourceView,
    binary
  })

  const comments = fileSnapshot.comments.items
  const commentCount = visibleComments(comments, uiStore.statusFilter, uiStore.typeFilters).filter(
    (c) => c.scope !== "review"
  ).length

  function setSourceView(next: boolean) {
    void navigate(reviewFileTarget(structure.review_id, title, next))
  }

  const files = orderedReviewFiles(structure.file_entries)

  function commentCountFor(entryPath: string): number {
    // In single-file mode there's only one active file; non-active paths report 0.
    if (entryPath === title) return commentCount
    return 0
  }

  async function selectFile(file: StructureFileEntry) {
    void navigate(reviewFileTarget(structure.review_id, file.path, sourceView))
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
      sourceView={sourceView}
      onSourceViewChange={setSourceView}
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
