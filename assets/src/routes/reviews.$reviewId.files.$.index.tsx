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
  const ViewComponent = viewComponentFor(resolveViewKind(view.snapshot.artifact))
  const rawView = search.view === "raw"
  return (
    <FileScopeProvider
      artifactId={view.snapshot.artifact.id}
      filePath={view.snapshot.artifact.title}
    >
      <ViewComponent view={view} forceRaw={rawView} inline={inline} nested />
    </FileScopeProvider>
  )
})

export const Route = createFileRoute("/reviews/$reviewId/files/$/")({
  component: RenderedEditorRoute
})
