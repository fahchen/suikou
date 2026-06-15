import { createFileRoute } from "@tanstack/react-router"
import { observer } from "mobx-react-lite"

import { uiStore } from "../stores/ui-store"
import { useReviewView } from "../review/store-context"
import { useMediaQuery, WIDE_QUERY } from "../hooks/use-media-query"
import { resolveViewKind } from "../review/view-kind"
import { viewComponentFor } from "../review/views/registry"

const RenderedEditorRoute = observer(function RenderedEditorRoute() {
  const view = useReviewView()
  const wide = useMediaQuery(WIDE_QUERY)
  const inline = uiStore.commentMode !== "side" || !wide
  const ViewComponent = viewComponentFor(resolveViewKind(view.snapshot.artifact))
  return <ViewComponent view={view} forceRaw={false} inline={inline} nested />
})

export const Route = createFileRoute("/review/$artifactId/")({
  component: RenderedEditorRoute
})
