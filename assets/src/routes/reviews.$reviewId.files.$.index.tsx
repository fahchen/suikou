import { createFileRoute, useSearch } from "@tanstack/react-router"
import { observer } from "mobx-react-lite"

import { uiStore } from "../stores/ui-store"
import { useReviewView } from "../review/store-context"
import { FileScopeProvider } from "../review/file-scope"
import { useMediaQuery, WIDE_QUERY } from "../hooks/use-media-query"
import { resolveViewKind } from "../review/view-kind"
import { viewComponentFor } from "../review/views/registry"

const RenderedEditorRoute = observer(function RenderedEditorRoute() {
  const view = useReviewView()
  const search = useSearch({ strict: false }) as { view?: string }
  const wide = useMediaQuery(WIDE_QUERY)
  const inline = uiStore.commentMode !== "side" || !wide
  const ViewComponent = viewComponentFor(resolveViewKind({ kind: view.reviewKind, title: view.snapshot.artifact.title }))
  const sourceView = search.view === "source"
  return (
    <FileScopeProvider
      artifactId={view.snapshot.artifact.id}
      filePath={view.snapshot.artifact.title}
    >
      <ViewComponent view={view} forceSource={sourceView} inline={inline} nested />
    </FileScopeProvider>
  )
})

export const Route = createFileRoute("/reviews/$reviewId/files/$/")({
  component: RenderedEditorRoute
})
