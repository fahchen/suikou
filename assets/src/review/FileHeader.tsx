import { observer } from "mobx-react-lite"
import { useNavigate } from "@tanstack/react-router"

import { FileRenderHeader } from "./FileRenderHeader"
import { FileVerdictMenu } from "./TopBarVerdictMenu"
import { useReviewCommands } from "./commands"
import { orderedReviewFiles } from "./file-order"
import { resolveViewKind, viewCapabilities } from "./view-kind"
import { isImagePath, isBinaryContent } from "./file-type"
import { uiStore } from "../stores/ui-store"
import type { ChangeStatus } from "./ChangeStatusIcon"
import type { ReviewFileEntry, ReviewSnapshot, Verdict } from "./types"

/**
 * Persistent per-file header for single-file mode. Thin wrapper that hands the
 * shared `FileRenderHeader` the props it needs and supplies the single-file
 * verdict chip and the route-based rendered/raw toggle. File-switching lives in
 * the review top bar (`TopBar`), not on this card header.
 */
export const FileHeader = observer(function FileHeader(props: {
  snapshot: ReviewSnapshot
  rawView: boolean
  content: string
  verdict: Verdict | null
  onVerdictChange: (verdict: Verdict) => void
}) {
  const { snapshot, rawView, content, verdict, onVerdictChange } = props
  const navigate = useNavigate()
  const commands = useReviewCommands()
  const viewKind = resolveViewKind(snapshot.artifact)
  const title = snapshot.artifact.title
  const image = isImagePath(title)
  const binary = isBinaryContent(content)
  const fileEntry = snapshot.files.data?.find(
    (f) => f.artifact_id === snapshot.artifact.id
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
  const commentCount = snapshot.comments.items.filter(
    (c) => c.scope !== "review"
  ).length

  function setRawView(next: boolean) {
    void navigate({
      to: next ? "/review/$artifactId/raw" : "/review/$artifactId",
      params: { artifactId: snapshot.artifact.id }
    })
  }

  const files = orderedReviewFiles(snapshot.files.data ?? [])

  function commentCountFor(path: string): number {
    const thread = (snapshot.files_comments ?? []).find((entry) => entry.path === path)
    return (thread?.items ?? []).filter((c) => c.scope !== "review").length
  }

  // Switching files navigates to the target artifact, minting it first when the
  // file has never been opened (so it has no artifact id yet), mirroring the
  // top bar's prev/next stepping.
  async function selectFile(file: ReviewFileEntry) {
    let id = file.artifact_id
    if (!id) {
      uiStore.setMintingPath(file.path)
      const reply = await commands.openFile.dispatch({ path: file.path })
      if (!reply.artifact_id) {
        uiStore.setMintingPath(null)
        return
      }
      id = reply.artifact_id
    }
    void navigate({
      to: rawView ? "/review/$artifactId/raw" : "/review/$artifactId",
      params: { artifactId: id }
    })
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
          snapshot={snapshot}
          verdict={verdict}
          onVerdictChange={onVerdictChange}
          comments={snapshot.comments.items}
        />
      }
    />
  )
})
