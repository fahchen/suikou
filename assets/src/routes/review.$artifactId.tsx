import { useEffect, useRef } from "react"
import { createFileRoute, Outlet } from "@tanstack/react-router"
import { observer } from "mobx-react-lite"

import { storeCache, useMusubiRoot, useMusubiSnapshot } from "../musubi"
import { uiStore } from "../stores/ui-store"
import { useMarkdown } from "../markdown/use-markdown"
import { useContent } from "../review/use-content"
import { useRawHighlight } from "../review/use-raw-highlight"
import { useMediaQuery, WIDE_QUERY } from "../hooks/use-media-query"
import {
  ReviewStoreProvider,
  ReviewViewProvider,
  useReviewStore,
  visibleComments
} from "../review/store-context"
import { TopBar } from "../review/TopBar"
import { CommentRail } from "../review/CommentRail"
import { isPreviewable, isImagePath } from "../review/file-type"
import { assetBase } from "../review/urls"

export const Route = createFileRoute("/review/$artifactId")({
  component: ReviewLayout
})

/** Mounts the ReviewStore for an artifact and frames the rendered/raw child routes. */
function ReviewLayout() {
  const { artifactId } = Route.useParams()
  const root = useMusubiRoot({
    module: "SuikouWeb.Stores.ReviewStore",
    id: artifactId,
    params: { artifact_id: artifactId },
    cache: storeCache,
    keepPreviousData: true
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
  const snapshot = useMusubiSnapshot(store)
  const ui = uiStore

  const wide = useMediaQuery(WIDE_QUERY)
  const title = snapshot.artifact.title
  const previewable = isPreviewable(title)
  const image = isImagePath(title)
  const slash = title.lastIndexOf("/")

  const { text: content, loading: contentLoading, error: contentError } = useContent(
    snapshot.artifact.id,
    snapshot.current_round.content_hash,
    !image
  )

  const blocks = useMarkdown(previewable ? content : "", ui.theme, ui.markdownFlavor, {
    base: assetBase(snapshot.artifact.id),
    dir: slash === -1 ? "" : title.slice(0, slash)
  })
  const rawLines = useRawHighlight(content, title, ui.theme)

  // Reveal any comment that appears after this mount (e.g. one you just added)
  // so it shows immediately even under hide-all. The set lives only in this
  // session, so a refresh re-seeds the baseline and re-hides everything.
  const seenIds = useRef<Set<string> | null>(null)
  useEffect(() => {
    const ids = snapshot.comments.items.map((c) => c.id)
    if (seenIds.current === null) {
      seenIds.current = new Set(ids)
      return
    }
    for (const id of ids) {
      if (!seenIds.current.has(id)) ui.revealComment(id)
      seenIds.current.add(id)
    }
  })

  const visible = visibleComments(snapshot.comments.items, ui.statusFilter, ui.typeFilters)
  const comments = ui.hideComments
    ? visible.filter((c) => ui.revealedCommentIds.includes(c.id))
    : visible
  const sideMode = ui.commentMode === "side" && wide && !ui.hideComments

  // The artifact was deleted out from under this tab (its review was removed).
  if (!snapshot.artifact.id) {
    return (
      <Centered tone="error">
        This review no longer exists.{" "}
        <a href="/" className="underline">
          Back to board
        </a>
      </Centered>
    )
  }

  return (
    <main className="h-screen overflow-auto bg-canvas text-ink">
      <TopBar snapshot={snapshot} previewable={previewable} content={content} />

      <div
        className={`mx-auto grid w-full max-w-[1760px] gap-4 px-3 sm:gap-6 sm:px-6 lg:px-10 ${
          sideMode ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""
        }`}
      >
        <ReviewViewProvider
          value={{
            snapshot,
            content,
            contentError,
            blocks: blocks.blocks,
            loading: blocks.loading || contentLoading,
            comments,
            previewable,
            rawLines
          }}
        >
          <Outlet />
        </ReviewViewProvider>
        {sideMode && <CommentRail comments={comments} />}
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
