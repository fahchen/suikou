import { observer } from "mobx-react-lite"

import { Editor } from "../Editor"
import { imageAssetSrc, isImagePath } from "../file-type"
import { reviewFileRawUrl } from "../urls"
import type { ViewProps } from "./registry"

/**
 * Renders a regular file artifact: an image, a markdown preview, or raw
 * highlighted source. `forceRaw` is set by the `/raw` child route to skip the
 * rendered-markdown branch for previewable files.
 */
export const FileView = observer(function FileView(props: ViewProps) {
  const { view, forceRaw, inline, nested } = props
  const { snapshot, content, contentError, blocks, loading, comments, previewable, rawLines } =
    view
  const editorView = forceRaw || !previewable ? "raw" : "rendered"
  // Minted images load from the artifact asset route; an unminted row (no
  // artifact yet) has no asset URL, so fall back to the live file-by-path route.
  const minted = Boolean(snapshot.artifact.id)
  const imageSrc = isImagePath(snapshot.artifact.title)
    ? minted
      ? imageAssetSrc(snapshot.artifact.id, snapshot.artifact.title)
      : reviewFileRawUrl(view.reviewSnapshot.review_id, snapshot.path)
    : undefined
  return (
    <Editor
      view={editorView}
      content={content}
      contentError={contentError}
      blocks={blocks}
      loading={loading}
      comments={comments}
      rawLines={rawLines}
      inline={inline}
      nested={nested}
      imageSrc={imageSrc}
    />
  )
})
