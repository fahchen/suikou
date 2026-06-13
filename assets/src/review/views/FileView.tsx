import { observer } from "mobx-react-lite"

import { Editor } from "../Editor"
import { imageAssetSrc } from "../file-type"
import type { ViewProps } from "./registry"

/**
 * Renders a regular file artifact: an image, a markdown preview, or raw
 * highlighted source. `forceRaw` is set by the `/raw` child route to skip the
 * rendered-markdown branch for previewable files.
 */
export const FileView = observer(function FileView(props: ViewProps) {
  const { view, forceRaw, inline } = props
  const { snapshot, content, contentError, blocks, loading, comments, previewable, rawLines } =
    view
  const editorView = forceRaw || !previewable ? "raw" : "rendered"
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
      imageSrc={imageAssetSrc(snapshot.artifact.id, snapshot.artifact.title)}
    />
  )
})
