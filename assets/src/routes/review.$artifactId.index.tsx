import { createFileRoute } from "@tanstack/react-router"
import { observer } from "mobx-react-lite"

import { uiStore } from "../stores/ui-store"
import { Editor } from "../review/Editor"
import { useReviewView } from "../review/store-context"
import { useMediaQuery, WIDE_QUERY } from "../hooks/use-media-query"
import { imageAssetSrc } from "../review/file-type"

const RenderedEditorRoute = observer(function RenderedEditorRoute() {
  const { snapshot, content, contentError, blocks, loading, comments, previewable, rawLines } =
    useReviewView()
  const wide = useMediaQuery(WIDE_QUERY)
  return (
    <Editor
      view={previewable ? "rendered" : "raw"}
      content={content}
      contentError={contentError}
      blocks={blocks}
      loading={loading}
      comments={comments}
      rawLines={rawLines}
      inline={uiStore.commentMode !== "side" || !wide}
      imageSrc={imageAssetSrc(snapshot.artifact.id, snapshot.artifact.title)}
    />
  )
})

export const Route = createFileRoute("/review/$artifactId/")({
  component: RenderedEditorRoute
})
