import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import { CheckCircle2 } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"

import { badgePop } from "../motion"
import { CommentRail } from "../CommentRail"
import { FileRenderHeader } from "../FileRenderHeader"
import { FileScopeProvider } from "../file-scope"
import { uiStore } from "../../stores/ui-store"
import { useMediaQuery, WIDE_QUERY } from "../../hooks/use-media-query"
import { contentErrorFrom, useContent, useReviewFileContent } from "../use-content"
import { useMarkdown } from "../../markdown/use-markdown"
import { useRawHighlight } from "../use-raw-highlight"
import { isImagePath, isPreviewable, isBinaryContent, imageAssetSrc } from "../file-type"
import { isHtmlPath, viewCapabilities } from "../view-kind"
import { assetBase, reviewFileRawUrl } from "../urls"
import {
  isFiltering,
  FileStoreProvider,
  ReviewViewProvider,
  useFileStore,
  visibleComments,
} from "../store-context"
import { useReviewCommands } from "../commands"
import {
  mergeFileView,
  structureEntry,
  structureFile,
  useReviewStructure,
  type MergedFileView,
} from "../use-review-structure"
import { viewComponentFor } from "./registry"
import { FileVerdictMenu } from "../TopBarVerdictMenu"
import { useMusubiSnapshot } from "../../musubi"
import type { FileStore, FileSnapshot, ReviewSnapshot, ReviewStore, Comment, Verdict } from "../types"
import type { ViewKind } from "../view-kind"

/**
 * Stacks every file in the review on one page. Each file gets its own
 * FileStoreProvider so the registered view component, line gutters, composer,
 * and comment cards work inline — backed by the real FileStore child proxy
 * rather than a fabricated snapshot.
 */
export const AllFilesView = observer(function AllFilesView(props: {
  reviewId: string
  reviewSnapshot: ReviewSnapshot
  reviewStore: ReviewStore
}) {
  const { reviewId, reviewSnapshot, reviewStore } = props
  const structure = useReviewStructure()

  // The file roster is static (structure); an empty review is known without the
  // live snapshot. The live children only carry comments/verdicts.
  if (structure.file_entries.length === 0) {
    return <Notice title="No files" message="This review has no files yet." />
  }

  const count = reviewSnapshot.body.files.length

  // reviewSnapshot.body.files[i] and reviewStore.body.files[i] are parallel: same
  // index is the same file. Merge into pairs and sort by path for a stable order.
  const pairs = Array.from({ length: count }, (_, i) => ({
    snapshot: reviewSnapshot.body.files[i] as unknown as FileSnapshot,
    proxy: reviewStore.body.files[i] as unknown as FileStore,
  })).sort((a, b) => a.snapshot.path.localeCompare(b.snapshot.path))

  const visible = uiStore.hideReviewed
    ? pairs.filter(
        ({ snapshot }) => snapshot.draft_verdict === null && snapshot.latest_verdict === null,
      )
    : pairs

  if (uiStore.hideReviewed && visible.length === 0) {
    return (
      <Notice
        tone="success"
        icon={<CheckCircle2 size={22} aria-hidden />}
        title="All files reviewed"
        message={'Every file has a verdict. Toggle "Reviewed" off in the display menu to see them again.'}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.map(({ snapshot, proxy }) => (
        <StackedFileCard
          key={snapshot.path}
          fileProxy={proxy}
          reviewId={reviewId}
          reviewSnapshot={reviewSnapshot}
        />
      ))}
    </div>
  )
})

const StackedFileCard = observer(function StackedFileCard(props: {
  fileProxy: FileStore
  reviewId: string
  reviewSnapshot: ReviewSnapshot
}) {
  return (
    <FileStoreProvider store={props.fileProxy}>
      <StackedFileGuard reviewId={props.reviewId} reviewSnapshot={props.reviewSnapshot} />
    </FileStoreProvider>
  )
})

// On a websocket reconnect the file store node is absent for a frame
// (snapshot() is undefined). Validate here and hand the snapshot to the body as
// a prop, so the body never re-subscribes and renders an absent snapshot.
const StackedFileGuard = observer(function StackedFileGuard(props: {
  reviewId: string
  reviewSnapshot: ReviewSnapshot
}) {
  const fileSnapshot = useMusubiSnapshot(useFileStore())
  if (!fileSnapshot) return null
  return (
    <StackedFileCardBody
      reviewId={props.reviewId}
      reviewSnapshot={props.reviewSnapshot}
      fileSnapshot={fileSnapshot as unknown as FileSnapshot}
    />
  )
})

const StackedFileCardBody = observer(function StackedFileCardBody(props: {
  reviewId: string
  reviewSnapshot: ReviewSnapshot
  fileSnapshot: FileSnapshot
}) {
  const commands = useReviewCommands()
  const structure = useReviewStructure()
  const wide = useMediaQuery(WIDE_QUERY)

  const path = props.fileSnapshot.path
  // Overlay static identity (structure) onto the live snapshot (comments/
  // verdicts), joined by path, so the renderers keep their identity as the live
  // snapshot sheds its static fields.
  const fileSnapshot = mergeFileView(
    props.fileSnapshot,
    structureFile(structure, path),
    structureEntry(structure, path),
  )
  const minted = fileSnapshot.artifact_id !== null
  const expanded = !uiStore.isFileCollapsed(props.reviewId, path)
  const [rawView, setRawView] = useState(false)

  const serverVerdict = fileSnapshot.draft_verdict ?? fileSnapshot.latest_verdict ?? null
  const [verdict, setVerdict] = useState<Verdict | null>(serverVerdict)
  useEffect(() => {
    setVerdict(serverVerdict)
  }, [serverVerdict])

  function changeVerdict(next: Verdict) {
    setVerdict(next)
    void commands.setDraftVerdict.dispatch({ verdict: next })
  }

  const reviewKind = structure.kind
  const image = isImagePath(path)
  const viewKind: ViewKind = reviewKind === "diff" ? "diff" : isHtmlPath(path) ? "html" : "file"

  const cardRef = useRef<HTMLElement | null>(null)
  const nearViewport = useNearViewport(cardRef)
  const live = expanded && nearViewport

  const minStat = useContent(
    fileSnapshot.artifact_id ?? "",
    fileSnapshot.current_round.content_hash,
    live && minted && !image,
  )
  const unminStat = useReviewFileContent(
    props.reviewId,
    path,
    fileSnapshot.content_hash,
    live && !minted && !image,
  )
  const contentState = minted ? minStat : unminStat
  const etag = contentState.etag
  const rawLines = useRawHighlight(
    live && !image ? contentState.text : "",
    path,
    uiStore.theme,
    etag,
  )

  const previewable = isPreviewable(path) && viewKind === "file"
  const slash = path.lastIndexOf("/")
  const blocks = useMarkdown(
    previewable && !image ? contentState.text : "",
    uiStore.theme,
    uiStore.markdownFlavor,
    {
      base: fileSnapshot.artifact_id ? assetBase(fileSnapshot.artifact_id) : "",
      dir: slash === -1 ? "" : path.slice(0, slash),
    },
    etag,
  )

  const comments = (fileSnapshot.comments as unknown as { items: Comment[] }).items
  const filteredVisible = visibleComments(comments, uiStore.statusFilter, uiStore.typeFilters)
  const railComments = uiStore.hideComments
    ? filteredVisible.filter((c) => uiStore.revealedCommentIds.includes(c.id))
    : filteredVisible

  const binary = isBinaryContent(contentState.text)
  const capabilities = viewCapabilities({ kind: viewKind, previewable, image, rawView, binary })
  const sideMode = uiStore.commentMode === "side" && wide && !uiStore.hideComments
  const filtered = isFiltering(uiStore.statusFilter, uiStore.typeFilters) || uiStore.hideComments
  const railActive = sideMode && (railComments.length > 0 || filtered)
  const headerCommentCount = railActive ? 0 : railComments.length
  const contentError = contentErrorFrom(contentState)
  const loading = blocks.loading || contentState.loading

  const view = {
    snapshot: fileSnapshot,
    reviewKind,
    reviewSnapshot: props.reviewSnapshot,
    content: contentState.text,
    contentError,
    etag,
    blocks: blocks.blocks,
    loading,
    comments: railComments,
    previewable,
    rawLines,
    verdict,
    onVerdictChange: changeVerdict,
  }
  const ViewComponent = viewComponentFor(viewKind)

  return (
    <article
      ref={(el) => {
        cardRef.current = el
      }}
      className="overflow-hidden rounded-xl border border-line bg-editor transition-colors duration-150 hover:border-line-strong/90"
    >
      <FileRenderHeader
        variant="stacked"
        filePath={path}
        changeStatus={fileSnapshot.change_status ?? null}
        outlineContent={live && !image ? contentState.text : ""}
        viewKind={viewKind}
        commentCount={headerCommentCount}
        capabilities={capabilities}
        rawView={rawView}
        onRawViewChange={setRawView}
        expanded={expanded}
        onToggleExpand={() => uiStore.setFileCollapsed(props.reviewId, path, expanded)}
        verdictChip={
          <FileVerdictMenu
            verdict={verdict}
            onVerdictChange={changeVerdict}
            comments={comments}
            showNote={false}
          />
        }
      />
      {live && (
        <div
          className={
            railActive
              ? "grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_320px] sm:pr-3"
              : ""
          }
        >
          <div className="min-w-0">
            {image ? (
              <StackedImage fileSnapshot={fileSnapshot} reviewId={props.reviewId} />
            ) : (
              <ReviewViewProvider value={view}>
                <FileScopeProvider
                  artifactId={(fileSnapshot.artifact as unknown as { id: string }).id}
                  filePath={path}
                >
                  <ViewComponent view={view} forceRaw={rawView} inline={!railActive} nested />
                </FileScopeProvider>
              </ReviewViewProvider>
            )}
          </div>
          {railActive && (
            <div className="hidden sm:block">
              <CommentRail comments={railComments} filtered={filtered} variant="card" />
            </div>
          )}
        </div>
      )}
      {expanded && !nearViewport && <BodyPlaceholder />}
    </article>
  )
})

function useNearViewport(ref: React.RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(false)
  // Above-fold cards flip to visible synchronously before paint to avoid a
  // placeholder → body layout jump on initial load.
  useLayoutEffect(() => {
    if (visible) return
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const viewportHeight = window.innerHeight || 0
    if (rect.top < viewportHeight + 600 && rect.bottom > -600) {
      setVisible(true)
    }
  }, [ref, visible])
  useEffect(() => {
    if (visible) return
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.disconnect()
            return
          }
        }
      },
      { rootMargin: "600px 0px" },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref, visible])
  return visible
}

function BodyPlaceholder() {
  return <div aria-hidden className="h-40 bg-editor" />
}

const StackedImage = observer(function StackedImage(props: {
  fileSnapshot: MergedFileView
  reviewId: string
}) {
  const { fileSnapshot, reviewId } = props
  const path = fileSnapshot.path
  const minted = fileSnapshot.artifact_id !== null
  const src = minted
    ? (imageAssetSrc(fileSnapshot.artifact_id!, path) ?? reviewFileRawUrl(reviewId, path))
    : reviewFileRawUrl(reviewId, path)

  if (fileSnapshot.content_hash === null && !minted) {
    return (
      <p className="px-3 py-4 text-[12px] text-muted-foreground">
        File deleted at head, no preview available.
      </p>
    )
  }
  return (
    <div className="flex justify-center px-3 py-4">
      <img
        src={src}
        alt={path}
        className="max-h-[60vh] max-w-full rounded object-contain"
      />
    </div>
  )
})

function Notice(props: {
  title: string
  message: string
  tone?: "default" | "success"
  icon?: React.ReactNode
}) {
  const success = props.tone === "success"
  const reduced = useReducedMotion() ?? false
  return (
    <article className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-editor px-6 py-20 text-center shadow-[var(--elev-1)]">
      {props.icon && (
        <motion.span
          {...(success ? badgePop(reduced) : {})}
          className={`inline-flex size-10 items-center justify-center rounded-full ring-1 ring-inset ${
            success
              ? "bg-green/12 text-green-text ring-green/30"
              : "bg-soft text-faint ring-line-soft"
          }`}
        >
          {props.icon}
        </motion.span>
      )}
      <div className="text-[14px] font-semibold tracking-[-0.005em] text-heading">
        {props.title}
      </div>
      <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">{props.message}</p>
    </article>
  )
}
