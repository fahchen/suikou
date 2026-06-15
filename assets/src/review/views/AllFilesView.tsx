import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import { motion, useReducedMotion } from "motion/react"
import { CheckCircle2 } from "lucide-react"

import { badgePop } from "../motion"
import { CommentRail } from "../CommentRail"
import { FileRenderHeader } from "../FileRenderHeader"
import { FileScopeProvider } from "../file-scope"
import { uiStore } from "../../stores/ui-store"
import { useMediaQuery, WIDE_QUERY } from "../../hooks/use-media-query"
import { useContent, useReviewFileContent, type ContentState } from "../use-content"
import { useMarkdown } from "../../markdown/use-markdown"
import { isImagePath, isPreviewable, isBinaryContent, imageAssetSrc } from "../file-type"
import { isHtmlPath, viewCapabilities } from "../view-kind"
import { assetBase, reviewFileRawUrl } from "../urls"
import {
  isFiltering,
  ReviewViewProvider,
  visibleComments,
  type ReviewView
} from "../store-context"
import {
  ReviewCommandsOverrideContext,
  useReviewCommands,
  type ReviewCommands
} from "../commands"
import { viewComponentFor } from "./registry"
import type { ViewKind } from "../view-kind"
import { FileVerdictMenu } from "../TopBarVerdictMenu"
import {
  type Comment,
  type ReviewFileEntry,
  type ReviewSnapshot,
  type Verdict
} from "../types"

/**
 * Stacks every file in the review on one page. Each file gets its own scoped
 * frame: the registered view component (file/diff/html) is mounted with a
 * per-file `ReviewView` so its existing line gutters, composer, and comment
 * cards work inline without the user navigating away. Comments belonging to
 * other stacked files don't bleed in — the per-file `comments` array is
 * carved out of the snapshot's `files_comments` fan-out, keyed by path.
 *
 * Unminted files render the same view shell. The first comment dispatches
 * `add_file_comment`, which mints the artifact server-side and lands the
 * thread on round 0.
 *
 * Heavy bodies (diff rows, syntax-highlighted code, markdown renders) only
 * mount once their card scrolls near the viewport. The card header is cheap
 * and always rendered so the stack's outline is correct from frame one; once
 * mounted, a body stays mounted so scrolling back to it is instant and
 * doesn't lose its expansion / composer state.
 */
export const AllFilesView = observer(function AllFilesView(props: {
  snapshot: ReviewSnapshot
  verdict: Verdict | null
  onVerdictChange: (verdict: Verdict) => void
}) {
  const { snapshot, verdict, onVerdictChange } = props
  const files = snapshot.files.data
  const reviewId = snapshot.review_id
  const reviewKind: "diff" | "file" =
    snapshot.artifact.kind === "diff" ? "diff" : "file"
  // Optimistic per-path verdict override for inactive cards. The chip flips
  // immediately on click; the snapshot's `file.verdict` round-trips a frame
  // later (server refreshes `:files`). Active card is unaffected — it reads
  // through the route shell's `verdict` prop.
  const [draftByPath, setDraftByPath] = useState<Record<string, Verdict>>({})

  function setInactiveDraft(path: string, verdict: Verdict) {
    setDraftByPath((prev) => ({ ...prev, [path]: verdict }))
  }

  if (files === null) {
    return (
      <Notice title="Loading files…" message="Fetching the review's file list." />
    )
  }
  if (files.length === 0) {
    return <Notice title="No files" message="This review has no files yet." />
  }

  const visible = uiStore.hideReviewed ? files.filter((f) => f.verdict === null) : files

  if (visible.length === 0) {
    return (
      <Notice
        tone="success"
        icon={<CheckCircle2 size={22} aria-hidden />}
        title="All files reviewed"
        message="Every file in this review has a verdict. Toggle “Reviewed” off in the display menu to see them again."
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.map((file) => (
        <StackedFile
          key={file.path}
          file={file}
          reviewId={reviewId}
          reviewKind={reviewKind}
          activeArtifactId={snapshot.artifact.id}
          snapshot={snapshot}
          activeVerdict={verdict}
          onActiveVerdictChange={onVerdictChange}
          inactiveDraft={draftByPath[file.path]}
          onInactiveDraftChange={setInactiveDraft}
        />
      ))}
    </div>
  )
})

const StackedFile = observer(function StackedFile(props: {
  file: ReviewFileEntry
  reviewId: string
  reviewKind: "diff" | "file"
  activeArtifactId: string
  snapshot: ReviewSnapshot
  activeVerdict: Verdict | null
  onActiveVerdictChange: (verdict: Verdict) => void
  inactiveDraft: Verdict | undefined
  onInactiveDraftChange: (path: string, verdict: Verdict) => void
}) {
  const {
    file,
    reviewId,
    reviewKind,
    activeArtifactId,
    snapshot,
    activeVerdict,
    onActiveVerdictChange,
    inactiveDraft,
    onInactiveDraftChange
  } = props
  const [expanded, setExpanded] = useState(true)
  const cardRef = useRef<HTMLElement | null>(null)
  const nearViewport = useNearViewport(cardRef)
  const wide = useMediaQuery(WIDE_QUERY)
  const baseCommands = useReviewCommands()
  const minted = file.artifact_id !== null
  const isActive = minted && file.artifact_id === activeArtifactId
  const live = expanded && nearViewport
  const inactiveVerdict: Verdict | null =
    inactiveDraft ?? file.verdict ?? null
  const fileVerdict: Verdict | null = isActive ? activeVerdict : inactiveVerdict

  function changeFileVerdict(next: Verdict) {
    if (isActive) {
      onActiveVerdictChange(next)
      return
    }
    onInactiveDraftChange(file.path, next)
    void applyVerdictToInactive(next)
  }

  async function applyVerdictToInactive(next: Verdict) {
    // Unminted rows still need a mint progress affordance because the
    // server-side write goes through `Reviews.open_file` first; the strip is
    // cleared on the dispatch's reply rather than on a route swap.
    const needsMint = !file.artifact_id
    if (needsMint) uiStore.setMintingPath(file.path)
    try {
      await baseCommands.setFileDraftVerdict.dispatch({
        path: file.path,
        verdict: next
      })
    } finally {
      if (needsMint) uiStore.setMintingPath(null)
    }
  }

  const commandsOverride = useFileScopedCommands(file)

  // Hoisted content + view-kind so the header (TOC) and the body share the
  // exact same text. Content fetch only runs once the card scrolls in.
  const path = file.path
  const image = isImagePath(path)
  const viewKind: ViewKind =
    reviewKind === "diff" ? "diff" : isHtmlPath(path) ? "html" : "file"
  const minStat = useContent(file.artifact_id ?? "", file.artifact_id ?? "", live && minted && !image)
  const unminStat = useReviewFileContent(reviewId, path, file.content_hash, live && !minted && !image)
  const contentState: ContentState = minted ? minStat : unminStat

  // Per-file render state — flipping one card doesn't touch the others.
  const rawView = uiStore.getFileRawView(path)
  const binary = isBinaryContent(contentState.text)
  const previewable = isPreviewable(path) && viewKind === "file"
  const capabilities = viewCapabilities({
    kind: viewKind,
    previewable,
    image,
    rawView,
    binary
  })

  // Visible comments for THIS file under the global filter rules — drives both
  // the header count chip and the per-file rail body.
  const fileComments = useMemo(
    () => commentsForPath(snapshot, file.path),
    [snapshot.files_comments, file.path]
  )
  const visibleFileComments = useMemo(
    () => visibleComments(fileComments, uiStore.statusFilter, uiStore.typeFilters),
    [fileComments, uiStore.statusFilter, uiStore.typeFilters]
  )
  const railComments = uiStore.hideComments
    ? visibleFileComments.filter((c) => uiStore.revealedCommentIds.includes(c.id))
    : visibleFileComments
  const sideMode =
    capabilities.comments &&
    uiStore.commentMode === "side" &&
    wide &&
    !uiStore.hideComments
  const filtered =
    isFiltering(uiStore.statusFilter, uiStore.typeFilters) || uiStore.hideComments
  // The rail is only worth its 320px when it has something to say. An empty,
  // unfiltered rail reserves whitespace that adds up across a 75-file stack.
  // Cards without comments collapse to single-column; the user's "side"
  // preference re-applies the moment a comment lands in the file.
  const railActive = sideMode && (railComments.length > 0 || filtered)

  // Comment-count chip is redundant when the side rail is showing the same
  // comments next to the body, so suppress it then. Otherwise (inline mode,
  // narrow viewport, side-hidden, or empty-rail card) the chip is the only
  // count signal.
  const headerCount = railActive ? 0 : railComments.length

  return (
    <ReviewCommandsOverrideContext.Provider value={commandsOverride}>
      <article
        ref={cardRef}
        className="overflow-hidden rounded-xl border border-line bg-editor transition-colors duration-150 hover:border-line-strong/90"
      >
        <FileRenderHeader
          variant="stacked"
          filePath={path}
          changeStatus={file.change_status ?? null}
          outlineContent={live && !image ? contentState.text : ""}
          viewKind={viewKind}
          commentCount={headerCount}
          capabilities={capabilities}
          rawView={rawView}
          onRawViewChange={(next) => uiStore.setFileRawView(path, next)}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          verdictChip={
            <FileVerdictMenu
              snapshot={snapshot}
              verdict={fileVerdict}
              onVerdictChange={changeFileVerdict}
              comments={fileComments}
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
              <ScopedFileBody
                file={file}
                reviewId={reviewId}
                viewKind={viewKind}
                state={contentState}
                snapshot={snapshot}
                rawView={rawView}
                inline={!railActive}
                fileVerdict={fileVerdict}
                onFileVerdictChange={changeFileVerdict}
              />
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
    </ReviewCommandsOverrideContext.Provider>
  )
})

/**
 * IntersectionObserver-backed lazy mount. The body of a stacked file only
 * mounts once its card scrolls within `rootMargin` of the viewport, so a 75-
 * file diff doesn't mount 75 heavy bodies at once. Once visible, stays
 * visible — scrolling back to an already-mounted card is instant and never
 * tears its body down.
 */
function useNearViewport(ref: React.RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(false)
  // Above-the-fold cards: flip to visible synchronously before paint so the
  // first frame already renders the real body, avoiding a placeholder → body
  // layout jump on initial load. Offscreen cards stay false and wait for the
  // IntersectionObserver.
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
      { rootMargin: "600px 0px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref, visible])
  return visible
}

/** Approximate-height filler reserving room while a body waits to mount. */
function BodyPlaceholder() {
  return <div aria-hidden className="h-40 bg-editor" />
}

/**
 * Mounts the registered view component for a stacked file with the prefetched
 * content. The view kind decides the registered component (file/diff/html);
 * the per-file `ReviewView` carves `comments` out of the snapshot's
 * `files_comments` fan-out and the command override routes `addComment`
 * through `add_file_comment` (mint-on-first-comment).
 */
const ScopedFileBody = observer(function ScopedFileBody(props: {
  file: ReviewFileEntry
  reviewId: string
  viewKind: ViewKind
  state: ContentState
  snapshot: ReviewSnapshot
  rawView: boolean
  inline: boolean
  fileVerdict: Verdict | null
  onFileVerdictChange: (verdict: Verdict) => void
}) {
  const {
    file,
    reviewId,
    viewKind,
    state,
    snapshot,
    rawView,
    inline,
    fileVerdict,
    onFileVerdictChange
  } = props
  const path = file.path
  const image = isImagePath(path)
  const previewable = isPreviewable(path) && viewKind === "file"

  // Markdown rendering reuses the same hook the single-file route uses, so
  // previewable stacked files keep their rendered preview. Unminted rows pass
  // an empty asset base — relative image refs won't resolve until the file is
  // minted, which matches the prior all-files behavior.
  const blocks = useMarkdown(
    previewable && !image ? state.text : "",
    uiStore.theme,
    uiStore.markdownFlavor,
    {
      base: file.artifact_id ? assetBase(file.artifact_id) : "",
      dir: path.lastIndexOf("/") === -1 ? "" : path.slice(0, path.lastIndexOf("/"))
    }
  )

  const view = useStackedFileView(
    snapshot,
    file,
    state.text,
    viewKind,
    previewable,
    blocks.blocks,
    blocks.loading,
    fileVerdict,
    onFileVerdictChange
  )

  if (image) {
    return <StackedImage file={file} reviewId={reviewId} />
  }
  if (state.missing) {
    return (
      <p className="px-3 py-4 text-[12px] text-muted-foreground">Content unavailable.</p>
    )
  }
  if (state.error) {
    return <p className="px-3 py-4 text-[12px] text-red">{state.error}</p>
  }
  if (state.loading && state.text === "") {
    return <p className="px-3 py-4 text-[12px] text-muted-foreground">Loading…</p>
  }

  const ViewComponent = viewComponentFor(viewKind)
  return (
    <FileScopeProvider filePath={path}>
      <ReviewViewProvider value={view}>
        <ViewComponent view={view} forceRaw={rawView} inline={inline} nested />
      </ReviewViewProvider>
    </FileScopeProvider>
  )
})

function useStackedFileView(
  snapshot: ReviewSnapshot,
  file: ReviewFileEntry,
  content: string,
  viewKind: ViewKind,
  previewable: boolean,
  blocks: ReviewView["blocks"],
  blocksLoading: boolean,
  verdict: Verdict | null,
  onVerdictChange: (verdict: Verdict) => void
): ReviewView {
  const comments = useMemo(
    () => commentsForPath(snapshot, file.path),
    [snapshot.files_comments, file.path]
  )

  return {
    snapshot: {
      ...snapshot,
      // Surface the stacked file as the "current" artifact for downstream
      // hooks that read snapshot.artifact (asset urls, kind, etc.).
      artifact: {
        id: file.artifact_id ?? "",
        title: file.path,
        kind: viewKind === "diff" ? "diff" : "file",
        approved: file.approved,
        approved_round: null
      }
    } as ReviewSnapshot,
    content,
    contentError: null,
    blocks,
    loading: blocksLoading,
    comments,
    previewable,
    rawLines: null,
    verdict,
    onVerdictChange
  }
}

function commentsForPath(snapshot: ReviewSnapshot, path: string): Comment[] {
  const fan = snapshot.files_comments ?? []
  const thread = fan.find((entry) => entry.path === path)
  return (thread?.items ?? []) as Comment[]
}

function useFileScopedCommands(file: ReviewFileEntry): Partial<ReviewCommands> {
  const base = useReviewCommands()
  return {
    addComment: {
      ...base.addFileComment,
      dispatch: (payload) =>
        base.addFileComment.dispatch({
          path: file.path,
          scope: payload.scope,
          critique_type: payload.critique_type,
          body: payload.body,
          anchor: payload.anchor
        })
    } as ReviewCommands["addComment"]
  }
}

const StackedImage = observer(function StackedImage(props: {
  file: ReviewFileEntry
  reviewId: string
}) {
  const { file, reviewId } = props
  const minted = file.artifact_id !== null
  // Minted images: serve via the artifact's asset route, which resolves the
  // request path relative to the artifact's own directory — so the file's
  // basename, not its full repo-relative path, is the correct segment. Mirrors
  // the single-file path's `imageAssetSrc()` to keep subdirectory images from
  // 404-ing the all-files render.
  const src = minted
    ? imageAssetSrc(file.artifact_id ?? "", file.path) ?? reviewFileRawUrl(reviewId, file.path)
    : reviewFileRawUrl(reviewId, file.path)
  if (file.content_hash === null && !minted) {
    return (
      <p className="px-3 py-4 text-[12px] text-muted-foreground">
        File deleted at head, no preview available.
      </p>
    )
  }
  return (
    <div className="flex justify-center px-3 py-4">
      <ImagePreview src={src} alt={file.path} />
    </div>
  )
})

function ImagePreview(props: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <p className="text-[12px] text-muted-foreground">
        Image preview unavailable.
      </p>
    )
  }
  return (
    <img
      src={props.src}
      alt={props.alt}
      onError={() => setFailed(true)}
      className="max-h-[60vh] max-w-full rounded object-contain"
    />
  )
}

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
      <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
        {props.message}
      </p>
    </article>
  )
}
