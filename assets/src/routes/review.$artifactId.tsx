import { createFileRoute, Outlet } from "@tanstack/react-router"
import { observer } from "mobx-react-lite"

import { useMusubiRoot, useMusubiSnapshot } from "../musubi"
import { uiStore } from "../stores/ui-store"
import { useMarkdown } from "../markdown/use-markdown"
import {
  ReviewStoreProvider,
  ReviewViewProvider,
  useReviewStore,
  visibleComments
} from "../review/store-context"
import { TopBar } from "../review/TopBar"
import { DiffView } from "../review/DiffView"
import { CommentRail } from "../review/CommentRail"
import type { ReviewSnapshot } from "../review/types"

export const Route = createFileRoute("/review/$artifactId")({
  component: ReviewLayout
})

/** Mounts the ReviewStore for an artifact and frames the rendered/raw child routes. */
function ReviewLayout() {
  const { artifactId } = Route.useParams()
  const root = useMusubiRoot({
    module: "SuikouWeb.Stores.ReviewStore",
    id: artifactId,
    params: { artifact_id: artifactId }
  })

  if (root.status === "loading") return <Centered>Connecting…</Centered>
  if (root.status === "error") return <Centered tone="error">{root.error.message}</Centered>

  return (
    <ReviewStoreProvider key={artifactId} store={root.store}>
      <ReviewShell />
    </ReviewStoreProvider>
  )
}

const ReviewShell = observer(function ReviewShell() {
  const store = useReviewStore()
  const snapshot = useMusubiSnapshot(store) as ReviewSnapshot
  const ui = uiStore

  const blocks = useMarkdown(snapshot.current_round.content, ui.theme)
  const comments = visibleComments(snapshot.comments.items, ui.statusFilter, ui.typeFilters)
  const sideMode = ui.commentMode === "side" && !snapshot.diff

  return (
    <main className="flex h-screen flex-col bg-canvas text-ink">
      <TopBar snapshot={snapshot} />

      <div className="flex-1 overflow-auto">
        <div
          className="mx-auto grid w-full max-w-[1400px] gap-6 px-6 py-8"
          style={{ gridTemplateColumns: sideMode ? "minmax(0,1fr) 340px" : "minmax(0,1fr)" }}
        >
          {snapshot.diff ? (
            <DiffView diff={snapshot.diff} />
          ) : (
            <ReviewViewProvider
              value={{ snapshot, blocks: blocks.blocks, loading: blocks.loading, comments }}
            >
              <Outlet />
            </ReviewViewProvider>
          )}
          {sideMode && <CommentRail comments={comments} />}
        </div>
      </div>
    </main>
  )
})

function Centered(props: { children: React.ReactNode; tone?: "error" }) {
  return (
    <div className="flex h-screen items-center justify-center text-sm" data-tone={props.tone}>
      <span className={props.tone === "error" ? "text-red" : "text-muted-foreground"}>
        {props.children}
      </span>
    </div>
  )
}
