import { useEffect, useRef, useState } from "react"
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router"
import { observer } from "mobx-react-lite"

import { storeCache, useMusubiRoot, useMusubiSnapshot } from "../musubi"
import { uiStore } from "../stores/ui-store"
import { useMarkdown } from "../markdown/use-markdown"
import { useContent } from "../review/use-content"
import { useRawHighlight } from "../review/use-raw-highlight"
import { useMediaQuery, WIDE_QUERY } from "../hooks/use-media-query"
import {
  isFiltering,
  ReviewStoreProvider,
  ReviewViewProvider,
  useReviewStore,
  visibleComments
} from "../review/store-context"
import { TopBar } from "../review/TopBar"
import { FileHeader } from "../review/FileHeader"
import { useReviewCommands } from "../review/commands"
import { CommentRail } from "../review/CommentRail"
import { AllFilesView } from "../review/views/AllFilesView"
import { useScrollRestore } from "../review/use-scroll-restore"
import { HtmlAnchorComposer } from "../review/views/HtmlAnchorComposer"
import { isPreviewable, isImagePath } from "../review/file-type"
import { assetBase } from "../review/urls"
import type { ReviewSnapshot, ReviewStore, Verdict } from "../review/types"

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

  if (root.status === "loading") return <ReviewShellSkeleton label="Connecting…" />
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
  const minting = uiStore.mintingPath

  // Store-swap during prev/next navigation can momentarily surface a snapshot
  // before the new store hydrates its fields — `snapshot.artifact` is
  // undefined in that window. Render a hold instead of crashing the shell.
  if (!snapshot.artifact) {
    return (
      <>
        <MintProgressStrip path={minting} />
        <ReviewShellSkeleton label={minting ? `Opening ${minting}…` : "Loading file…"} />
      </>
    )
  }
  return (
    <>
      <MintProgressStrip path={minting} />
      <HydratedReviewShell store={store} snapshot={snapshot} />
    </>
  )
})

/** Indeterminate top progress bar while an `open_file` mint is in flight. */
const MintProgressStrip = observer(function MintProgressStrip(props: { path: string | null }) {
  if (!props.path) return null
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Opening ${props.path}`}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-blue-soft"
    >
      <div className="h-full w-1/3 animate-[mint-strip_1.1s_ease-in-out_infinite] bg-blue" />
    </div>
  )
})

const HydratedReviewShell = observer(function HydratedReviewShell(props: {
  store: ReviewStore
  snapshot: ReviewSnapshot
}) {
  const { snapshot } = props
  const ui = uiStore
  const commands = useReviewCommands()
  const rawView = useLocation().pathname.endsWith("/raw")

  // Mint-on-click affordance (B3): when this shell mounts for the freshly
  // minted artifact, clear the global minting strip set by the upstream
  // openFile dispatcher.
  useEffect(() => {
    if (uiStore.mintingPath) uiStore.setMintingPath(null)
  }, [snapshot.artifact.id])

  // Server is authoritative: the displayed verdict tracks the snapshot's
  // per-file draft (or submitted) verdict. Local state exists only for
  // optimistic feedback between a click and the patch landing — it resyncs
  // whenever the snapshot's verdict changes (own write round-trip, cache
  // revalidation, or store-swap on file switch), so switching files never
  // shows a stale value frozen at mount time.
  const serverVerdict = snapshot.draft_verdict ?? snapshot.latest_verdict ?? null
  const [verdict, setVerdict] = useState<Verdict | null>(serverVerdict)
  useEffect(() => {
    setVerdict(serverVerdict)
  }, [serverVerdict])

  function changeVerdict(next: Verdict) {
    setVerdict(next)
    void commands.setDraftVerdict.dispatch({ verdict: next })
  }

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
  const loading = blocks.loading || contentLoading

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
  const allFiles = ui.fileDisplayMode === "all"
  const sideMode = ui.commentMode === "side" && wide && !ui.hideComments && !allFiles

  // Single-file mode: remember and restore each file's scroll offset (per
  // rendered/raw view) across file switches and hard reloads. The all-files
  // stacked view manages its own layout, so it opts out.
  const [mainEl, setMainEl] = useState<HTMLElement | null>(null)
  useScrollRestore({
    container: mainEl,
    artifactId: snapshot.artifact.id,
    view: rawView ? "raw" : "rendered",
    ready: !loading,
    enabled: !allFiles
  })

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
    <main ref={setMainEl} className="h-screen overflow-auto bg-canvas text-ink">
      <TopBar
        snapshot={snapshot}
        previewable={previewable}
        content={content}
        verdict={verdict}
      />

      <div
        className={`mx-auto grid w-full max-w-[1760px] gap-4 px-3 sm:gap-6 sm:px-6 lg:px-10 ${
          sideMode ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""
        }`}
      >
        <div className="min-w-0">
          <ReviewViewProvider
            value={{
              snapshot,
              content,
              contentError,
              blocks: blocks.blocks,
              loading,
              comments,
              previewable,
              rawLines,
              verdict,
              onVerdictChange: changeVerdict
            }}
          >
            {allFiles ? (
              <AllFilesView
                snapshot={snapshot}
                verdict={verdict}
                onVerdictChange={changeVerdict}
              />
            ) : (
              <article className="overflow-hidden rounded-xl border border-line bg-editor">
                <FileHeader
                  snapshot={snapshot}
                  rawView={rawView}
                  content={content}
                  verdict={verdict}
                  onVerdictChange={changeVerdict}
                />
                <Outlet />
              </article>
            )}
          </ReviewViewProvider>
        </div>
        {sideMode && (
          <CommentRail
            comments={comments}
            filtered={isFiltering(ui.statusFilter, ui.typeFilters) || ui.hideComments}
            header={
              ui.htmlAnchorTarget && ui.htmlAnchorTarget.artifactId === snapshot.artifact.id ? (
                <HtmlAnchorComposer
                  target={ui.htmlAnchorTarget}
                  onClose={() => ui.setHtmlAnchorTarget(null)}
                  variant="rail"
                />
              ) : null
            }
          />
        )}
      </div>
    </main>
  )
})

/**
 * Skeleton shell shown while the review store is still resolving (cold
 * navigation) or while a store-swap is mid-flight. Mirrors the real layout
 * — top bar shape, file card frame, comment rail column — so the page
 * doesn't reflow when content arrives. Uses the same `animate-pulse / bg-soft`
 * idiom as the board's loading rows.
 */
function ReviewShellSkeleton(props: { label: string }) {
  return (
    <main
      className="h-screen overflow-hidden bg-canvas text-ink"
      role="status"
      aria-busy="true"
      aria-label={props.label}
    >
      <div className="flex h-12 items-center gap-2 border-b border-line px-3 sm:px-6 lg:px-10">
        <div className="h-5 w-32 animate-pulse rounded bg-soft" />
        <div className="ml-auto flex items-center gap-2">
          <div className="h-6 w-14 animate-pulse rounded-full bg-soft" />
          <div className="h-6 w-14 animate-pulse rounded-full bg-soft" />
          <div className="h-6 w-6 animate-pulse rounded-full bg-soft" />
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-[1760px] gap-4 px-3 pt-4 sm:gap-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-10">
        <div className="overflow-hidden rounded-xl border border-line bg-editor">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <div className="h-4 w-48 animate-pulse rounded bg-soft" />
            <div className="ml-auto h-5 w-16 animate-pulse rounded-full bg-soft" />
          </div>
          <div className="flex flex-col gap-2.5 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-3 animate-pulse rounded bg-soft"
                style={{ width: `${65 + ((i * 13) % 30)}%` }}
              />
            ))}
          </div>
        </div>
        <div className="hidden flex-col gap-3 lg:flex">
          <div className="h-20 animate-pulse rounded-xl bg-soft" />
          <div className="h-20 animate-pulse rounded-xl bg-soft" />
        </div>
      </div>
      <span className="sr-only">{props.label}</span>
    </main>
  )
}

function Centered(props: { children: React.ReactNode; tone?: "error" }) {
  return (
    <div className="flex h-screen items-center justify-center text-sm" data-tone={props.tone}>
      <span className={props.tone === "error" ? "text-red" : "text-muted-foreground"}>
        {props.children}
      </span>
    </div>
  )
}
