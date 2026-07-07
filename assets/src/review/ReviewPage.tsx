import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useNavigate } from "@tanstack/react-router"
import { observer } from "mobx-react-lite"
import type { CommandReply, StoreProxy, StoreSnapshot } from "@musubi/react"
import type { ThemedToken } from "shiki"
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, FileText, GitCompare, Info, Maximize2, MessageSquare, MessageSquarePlus, Minus, PanelLeft, Plus, X } from "lucide-react"

import { storeCache, useMusubiCommand, useMusubiRoot, useMusubiSnapshot, useSocketConnected } from "../musubi"
import { uiStore, type CommentDisplayMode, type MonoSize } from "../stores/ui-store"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu"
import { Dialog, DialogTitle } from "../components/ui/dialog"
import { ConfirmDialog } from "../components/ui/confirm-dialog"
import { Segmented } from "../components/ui/segmented"
import { Tooltip } from "../components/ui/tooltip"
import { SettingsModal } from "../settings/SettingsModal"
import { FileIcon } from "../board/FileIcon"
import { MarkdownPreview, Source } from "./components/EditorBodies"
import { BinaryNotice, clampZoom, EmptyFileNotice, HtmlView, ImageView, isTextMime, TocMenu } from "./components/EditorSurface"
import { FileList, NavHeader } from "./components/FileNavigator"
import { StatusBar, Toolbar, VerdictChip } from "./components/ReviewChrome"
import { CommentThread } from "./components/comments/CommentThread"
import { Composer } from "./components/comments/Composer"
import { SideRail } from "./components/SideRail"
import { highlightLines } from "./highlight"
import { markdownToc, renderMarkdown } from "./markdown"
import { langForPath, outline } from "../treesitter/outline"

type ReviewStore = StoreProxy<"SuikouWeb.Stores.ReviewStore", Musubi.Stores>
type Structure = CommandReply<"SuikouWeb.Stores.ReviewStore", "load_review_structure", Musubi.Stores>
type FileEntry = Structure["file_entries"][number]
type ReviewSnapshot = StoreSnapshot<"SuikouWeb.Stores.ReviewStore", Musubi.Stores>
type Comment = ReviewSnapshot["body"]["files"][number]["comments"]["items"][number]
type FileStoreProxy = StoreProxy<"SuikouWeb.Stores.FileStore", Musubi.Stores>
type CommentsStoreProxy = StoreProxy<"SuikouWeb.Stores.CommentsStore", Musubi.Stores>
type CritiqueType = "fix_required" | "needs_answer" | "note"
type Verdict = "approve" | "request_changes" | "comment"
type Range = { start: number; end: number }
type BodyFile = ReviewSnapshot["body"]["files"][number]
type HighlightRange = Range | null
type FilePosition = { index: number; total: number; previousPath: string | null; nextPath: string | null }

const VERDICT_META: Record<Verdict, { label: string; short: string }> = {
  approve: { label: "Approve", short: "Approved" },
  request_changes: { label: "Request changes", short: "Request changes" },
  comment: { label: "Comment", short: "Comment" },
}

function verdictText(verdict: Verdict): string {
  return verdict === "request_changes" ? "text-request" : verdict === "approve" ? "text-approve" : "text-accent-bright"
}

function verdictSoft(verdict: Verdict): string {
  return verdict === "request_changes"
    ? "bg-request-soft"
    : verdict === "approve"
      ? "bg-approve-soft"
      : "bg-accent-soft"
}

/** An open blocker is a published fix_required comment that has not been
 * resolved — the review's hard "needs work" signal. */
function isOpenBlocker(comment: Comment): boolean {
  return comment.status === "published" && comment.critique_type === "fix_required" && !comment.resolved
}

const anchorLine = (comment: Comment): number | null =>
  comment.anchor && comment.anchor.type !== "element" ? comment.anchor.start_line : null

const commentRange = (comment: Comment | null): HighlightRange =>
  comment?.anchor?.type === "line_range"
    ? { start: comment.anchor.start_line, end: comment.anchor.end_line }
    : null

/** The review-level verdict rolled up from each file's effective verdict (its
 * unpublished draft if set, else its last published verdict): any request wins,
 * else all-approve is Approve, else any set is Comment. */
function rollupVerdict(effective: (Verdict | null)[]): Verdict | null {
  if (effective.some((v) => v === "request_changes")) return "request_changes"
  if (effective.length > 0 && effective.every((v) => v === "approve")) return "approve"
  if (effective.some((v) => v !== null)) return "comment"
  return null
}

type PerFile = {
  path: string
  draftVerdict: Verdict | null
  latestVerdict: Verdict | null
  approved: boolean
  openBlockers: number
  pending: number
}
type Blocker = { path: string; line: number | null }
type RoundCompare = { from: number; to: number; resolved: number; added: number; open: number; verdict: Verdict | null }
type ReviewSummary = {
  perFile: PerFile[]
  verdict: Verdict | null
  reviewed: number
  draftVerdicts: number
  pendingComments: number
  blockers: Blocker[]
  allApproved: boolean
  unresolved: number
  hasUnpublished: boolean
}

function useDesktopLayout(): boolean {
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches)

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)")
    const update = () => setDesktop(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  return desktop
}

const artifactDraftKey = (scope: string): string => `suikou-artifact:${scope}`
const sideRailSortKey = (scope: string): string => `suikou-side-sort:${scope}`

/** Whether a persisted file-comment composer draft holds unsent text, so a
 * reload reopens it just like a line composer. */
function hasArtifactDraftBody(scope: string): boolean {
  try {
    const value = JSON.parse(localStorage.getItem(artifactDraftKey(scope)) || "{}")
    return typeof value?.body === "string" && value.body.trim().length > 0
  } catch {
    return false
  }
}

/** Review workbench: a full-viewport shell (toolbar · navigator · editor ·
 * inspector · status bar). Mounts the review's ReviewStore and reads its static
 * structure; file content and the live comment overlay arrive in later passes. */
export function ReviewPage({ reviewId, file }: { reviewId: string; file?: string }) {
  const root = useMusubiRoot({
    module: "SuikouWeb.Stores.ReviewStore",
    id: reviewId,
    params: { review_id: reviewId },
    cache: storeCache,
  })

  if (root.status === "loading") return <Centered>Loading review…</Centered>
  if (root.status === "error") return <Centered>Can't reach Suikou. {root.error.message}</Centered>
  return <Shell store={root.store} reviewId={reviewId} file={file} />
}

const Shell = observer(function Shell({ store, reviewId, file }: { store: ReviewStore; reviewId: string; file?: string }) {
  const load = useMusubiCommand(store, "load_review_structure")
  const connected = useSocketConnected()
  const snap = useMusubiSnapshot(store)
  const navigate = useNavigate()
  const [structure, setStructure] = useState<Structure | null>(null)
  const structRef = useRef<Structure | null>(null)
  structRef.current = structure

  useEffect(() => {
    if (!connected) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let attempts = 0
    const attempt = () => {
      load
        .dispatch({})
        .then((reply) => {
          if (!cancelled) setStructure(reply)
        })
        .catch(() => {
          if (cancelled) return
          attempts += 1
          if (structRef.current === null && attempts < 6) timer = setTimeout(attempt, 400)
        })
    }
    attempt()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, reviewId])

  const entries = useMemo(
    () => (structure?.file_entries ?? []).filter((e) => !e.soft_removed),
    [structure],
  )

  const [filesSheetOpen, setFilesSheetOpen] = useState(false)
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null)
  const [hoveredRange, setHoveredRange] = useState<HighlightRange>(null)

  const isDiff = structure?.kind === "diff"
  const desktopLayout = useDesktopLayout()
  const commentDisplay = desktopLayout ? uiStore.commentDisplay : "inline"
  // The open file lives in the URL (`?file=`), so a reload lands back on it. When
  // the param is absent (opened from the board) or stale, fall back to the file
  // last viewed in this review, then to the first file.
  const fileKey = `suikou-file:${reviewId}`
  const remembered = localStorage.getItem(fileKey)
  const selectedPath = entries.some((e) => e.path === file)
    ? file!
    : entries.some((e) => e.path === remembered)
      ? remembered
      : (entries[0]?.path ?? null)
  const selected = entries.find((e) => e.path === selectedPath) ?? null
  const selectedIndex = entries.findIndex((e) => e.path === selectedPath)
  const filePosition: FilePosition | null =
    selectedIndex >= 0
      ? {
          index: selectedIndex,
          total: entries.length,
          previousPath: selectedIndex > 0 ? (entries[selectedIndex - 1]?.path ?? null) : null,
          nextPath: selectedIndex < entries.length - 1 ? (entries[selectedIndex + 1]?.path ?? null) : null,
        }
      : null
  useEffect(() => {
    if (!selectedPath || file === selectedPath) return
    localStorage.setItem(fileKey, selectedPath)
    navigate({ to: "/reviews/$reviewId", params: { reviewId }, search: { file: selectedPath }, replace: true })
  }, [file, fileKey, navigate, reviewId, selectedPath])
  // Comment threads stream on the live snapshot; the structure (chrome, file
  // list) rides the command reply. Join them by path here.
  const fileIndex = snap?.body?.files.findIndex((f) => f.path === selectedPath) ?? -1
  const comments = useMemo(
    () => (fileIndex >= 0 ? (snap?.body?.files[fileIndex]?.comments.items ?? []) : []),
    [snap, fileIndex],
  )
  // The matching child proxies for authoring: the file's FileStore (add_comment)
  // and its CommentsStore (reply/edit/delete). `store.body` is safe to walk once
  // the snapshot carries a body — the same guard `fileIndex >= 0` implies.
  const fileProxy: FileStoreProxy | null = fileIndex >= 0 && snap?.body ? store.body.files[fileIndex] : null
  const commentsProxy: CommentsStoreProxy | null = fileProxy?.comments ?? null

  // Join each file's static entry (published verdict, approved) with its live
  // FileStore snapshot (draft verdict, streamed comments) so the verdict chip,
  // blocker dots, overview, and submit panel all read one consistent view.
  const bodyFiles = snap?.body?.files ?? []
  const review = useMemo<ReviewSummary>(() => {
    const liveByPath = new Map<string, BodyFile>(bodyFiles.map((f) => [f.path, f]))
    const perFile: PerFile[] = entries.map((e) => {
      const live = liveByPath.get(e.path)
      return {
        path: e.path,
        draftVerdict: (live?.draft_verdict ?? null) as Verdict | null,
        latestVerdict: (e.verdict ?? null) as Verdict | null,
        approved: e.approved,
        openBlockers: live ? live.comments.items.filter(isOpenBlocker).length : 0,
        pending: live ? live.comments.items.filter((c) => c.status === "pending").length : 0,
      }
    })
    const blockers = entries.flatMap((e) => {
      const live = liveByPath.get(e.path)
      if (!live) return [] as Blocker[]
      return live.comments.items.filter(isOpenBlocker).map((c) => ({ path: e.path, line: anchorLine(c) }))
    })
    return {
      perFile,
      verdict: rollupVerdict(perFile.map((f) => f.draftVerdict ?? f.latestVerdict)),
      reviewed: perFile.filter((f) => (f.draftVerdict ?? f.latestVerdict) !== null).length,
      draftVerdicts: perFile.filter((f) => f.draftVerdict !== null).length,
      pendingComments: perFile.reduce((n, f) => n + f.pending, 0),
      blockers,
      allApproved: perFile.length > 0 && perFile.every((f) => f.approved),
      unresolved: snap?.body?.round_summaries.find((r) => r.number === snap.body.selected_round)?.unresolved_count ?? blockers.length,
      hasUnpublished: snap?.body?.has_unpublished ?? false,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, snap])
  const statusByPath = useMemo(
    () => new Map(review.perFile.map((f) => [f.path, f])),
    [review],
  )
  const selectedLive = review.perFile.find((f) => f.path === selectedPath) ?? null
  const focusedComment = comments.find((comment) => comment.id === focusedCommentId) ?? null
  const highlightedRange = hoveredRange ?? commentRange(focusedComment)

  // Multi-round: a past round is read-only — you can read its published threads
  // but new comments and verdicts only land on the latest round.
  const roundSummaries = snap?.body?.round_summaries ?? []
  const latestRound = snap?.body?.latest_round ?? 0
  const selectedRound = snap?.body?.selected_round ?? latestRound
  const readOnly = selectedRound < latestRound

  // A7 round compare: what changed between the prior round and the selected one,
  // computed from the published comments' authored/resolved rounds.
  const [compareOpen, setCompareOpen] = useState(false)
  const compare = useMemo<RoundCompare | null>(() => {
    if (selectedRound < 1) return null
    let resolved = 0
    let added = 0
    let open = 0
    for (const f of bodyFiles) {
      for (const c of f.comments.items) {
        if (c.status !== "published") continue
        if (c.resolved_round === selectedRound) resolved += 1
        if (c.authored_round === selectedRound) added += 1
        else if (!c.resolved) open += 1
      }
    }
    return { from: selectedRound - 1, to: selectedRound, resolved, added, open, verdict: review.verdict }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, selectedRound, review.verdict])

  if (structure && !structure.exists) {
    return <Centered>Review not found.</Centered>
  }

  const select = (path: string) => {
    setFilesSheetOpen(false)
    localStorage.setItem(fileKey, path)
    navigate({ to: "/reviews/$reviewId", params: { reviewId }, search: { file: path } })
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas text-ink">
      <Toolbar
        name={structure?.name ?? "…"}
        isDiff={isDiff}
        connected={connected}
        store={store}
        review={review}
        roundSummaries={roundSummaries}
        selectedRound={selectedRound}
        latestRound={latestRound}
        canCompare={compare !== null}
        compareOpen={compareOpen}
        onToggleCompare={() => setCompareOpen((open) => !open)}
      />
      <div
        className={`grid min-h-0 flex-1 grid-cols-1 ${
          commentDisplay === "side" ? "lg:grid-cols-[236px_1fr_340px]" : "lg:grid-cols-[236px_1fr]"
        }`}
      >
        <aside className="hidden min-h-0 flex-col border-r border-hair-strong bg-surface pt-3 lg:flex">
          <NavHeader entries={entries} reviewed={review.reviewed} />
          <FileList entries={entries} isDiff={isDiff} selectedPath={selectedPath} onSelect={select} status={statusByPath} />
        </aside>
        <Editor
          reviewId={reviewId}
          entry={selected}
          filesLoaded={structure !== null}
          comments={comments}
          fileProxy={fileProxy}
          commentsProxy={commentsProxy}
          verdict={selectedLive}
          readOnly={readOnly}
          selectedRound={selectedRound}
          compare={compareOpen ? compare : null}
          commentDisplay={commentDisplay}
          focusedCommentId={focusedCommentId}
          highlightedRange={highlightedRange}
          onFocusComment={setFocusedCommentId}
          onClearFocus={() => setFocusedCommentId(null)}
          onOpenFiles={() => setFilesSheetOpen(true)}
          onSelectFile={select}
          filePosition={filePosition}
        />
        {commentDisplay === "side" && (
          <SideRail
            comments={comments}
            commentsProxy={commentsProxy}
            fileProxy={fileProxy}
            fileCommentDraftKey={selected ? artifactDraftKey(`${reviewId}:${selected.path}`) : null}
            storageKey={selected ? sideRailSortKey(`${reviewId}:${selected.path}`) : null}
            onHoverRange={setHoveredRange}
            onFocus={(comment) => setFocusedCommentId(comment.id)}
          />
        )}
      </div>
      <StatusBar
        path={selectedPath}
        connected={connected}
        review={review}
        round={selectedRound}
        readOnly={readOnly}
        commentDisplay={commentDisplay}
      />
      <Dialog open={filesSheetOpen} onClose={() => setFilesSheetOpen(false)} className="max-h-[82vh] sm:max-w-[420px]">
        <div className="flex items-center gap-2 border-b border-hair px-4 py-3">
          <FileText size={16} className="text-muted" aria-hidden />
          <DialogTitle className="text-[15px] font-bold text-ink">Files</DialogTitle>
          <span className="flex-1" />
          <span className="text-[12px] font-semibold text-muted tabular-nums">
            {review.reviewed}/{entries.length}
          </span>
        </div>
        <div className="flex min-h-0 flex-col overflow-hidden pt-2">
          <FileList entries={entries} isDiff={isDiff} selectedPath={selectedPath} onSelect={select} status={statusByPath} />
        </div>
      </Dialog>
      <SettingsModal />
    </div>
  )
})

/** E2 artifact-scope comments: file-level discussion not tied to a line, shown
 * as a band above the content. Independent of the verdict — a file can carry any
 * number of these. Reuses the shared comment thread and composer used elsewhere. */
function ArtifactComments({
  comments,
  fileProxy,
  commentsProxy,
  draftScope,
  composing,
  onClose,
}: {
  comments: Comment[]
  fileProxy: FileStoreProxy
  commentsProxy: CommentsStoreProxy | null
  draftScope: string
  composing: boolean
  onClose: () => void
}) {
  const addComment = useMusubiCommand(fileProxy, "add_comment")
  const items = comments.filter((c) => c.scope === "artifact")
  const composerRef = useRef<HTMLDivElement>(null)

  // Bring the composer into view when opened from the file-head button while
  // scrolled into the content.
  useEffect(() => {
    if (composing) composerRef.current?.scrollIntoView({ block: "nearest" })
  }, [composing])

  const submit = (body: string, type: CritiqueType) => {
    addComment.dispatch({ scope: "artifact", critique_type: type, body, anchor: null }).catch(() => undefined)
    onClose()
  }

  if (items.length === 0 && !composing) return null

  return (
    <div className="shrink-0 border-b border-hair px-3.5 pt-2 pb-1">
      {items.length > 0 && (
        <div className="flex items-center gap-2 px-1 pb-0.5">
          <MessageSquare size={13} className="text-muted" aria-hidden />
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-faint">File comments</span>
          <span className="text-[11px] font-semibold text-muted tabular-nums">{items.length}</span>
        </div>
      )}
      {items.map((comment) => (
        <CommentThread key={comment.id} comment={comment} commentsProxy={commentsProxy} className="my-1.5" />
      ))}
      {composing && (
        <div ref={composerRef}>
          <Composer
            anchorLabel="whole file"
            draftKey={artifactDraftKey(draftScope)}
            pending={addComment.isPending}
            className="my-1.5 max-w-[720px]"
            onSubmit={submit}
            onCancel={onClose}
          />
        </div>
      )}
    </div>
  )
}

type Content =
  | { kind: "loading" }
  | { kind: "text"; lines: string[]; tokens: ThemedToken[][] | null }
  | { kind: "image"; url: string; mime: string; bytes: number | null }
  | { kind: "binary"; mime: string; bytes: number | null }
  | { kind: "error"; message: string }

const DOC_VIEW_KEY = "suikou-doc-view"

/** The reader's remembered choice between the raw Source and the rendered view,
 * shared across renderable files (markdown Preview, html Comment) so the choice
 * carries between them and survives a reload. */
function readDocView(): "source" | "rendered" {
  return localStorage.getItem(DOC_VIEW_KEY) === "source" ? "source" : "rendered"
}

function writeDocView(value: "source" | "rendered"): void {
  localStorage.setItem(DOC_VIEW_KEY, value)
}

const HTML_ZOOM_KEY = "suikou-html-zoom"

/** The reader's remembered html zoom, kept across files and reloads. */
function readHtmlZoom(): number {
  const value = Number(localStorage.getItem(HTML_ZOOM_KEY))
  return value >= 0.1 && value <= 2 ? value : 1
}

function Editor({
  reviewId,
  entry,
  filesLoaded,
  comments,
  fileProxy,
  commentsProxy,
  verdict,
  readOnly,
  selectedRound,
  compare,
  commentDisplay,
  focusedCommentId,
  highlightedRange,
  onFocusComment,
  onClearFocus,
  onOpenFiles,
  onSelectFile,
  filePosition,
}: {
  reviewId: string
  entry: FileEntry | null
  filesLoaded: boolean
  comments: Comment[]
  fileProxy: FileStoreProxy | null
  commentsProxy: CommentsStoreProxy | null
  verdict: PerFile | null
  readOnly: boolean
  selectedRound: number
  compare: RoundCompare | null
  commentDisplay: CommentDisplayMode
  focusedCommentId: string | null
  highlightedRange: HighlightRange
  onFocusComment: (commentId: string | null) => void
  onClearFocus: () => void
  onOpenFiles: () => void
  onSelectFile: (path: string) => void
  filePosition: FilePosition | null
}) {
  const dir = entry ? entry.path.slice(0, entry.path.lastIndexOf("/") + 1) : ""
  const name = entry ? entry.path.slice(entry.path.lastIndexOf("/") + 1) : ""
  const [content, setContent] = useState<Content>({ kind: "loading" })
  const [toc, setToc] = useState<OutlineItem[]>([])
  const previewable = entry ? /\.(md|markdown)$/i.test(entry.path) : false
  const htmlFile = entry ? /\.html?$/i.test(entry.path) : false
  const [view, setView] = useState<"source" | "preview">(() => (readDocView() === "source" ? "source" : "preview"))
  const [htmlMode, setHtmlMode] = useState<"source" | "comment" | "interactive">(() =>
    readDocView() === "source" ? "source" : "comment",
  )
  const [htmlZoom, setHtmlZoom] = useState(() => readHtmlZoom())
  const htmlFrameRef = useRef<HTMLDivElement | null>(null)
  const [artifactComposing, setArtifactComposing] = useState(false)

  // Every renderable file opens in the reader's remembered Source-vs-rendered
  // choice; a plain file has only Source. html resets its sub-mode to Comment
  // (zoom is kept across files). A file-comment composer left open with unsaved
  // text reopens on reload, like a line composer. Re-runs when the file changes.
  useEffect(() => {
    const pref = readDocView()
    setView(previewable ? (pref === "source" ? "source" : "preview") : "source")
    setHtmlMode(pref === "source" ? "source" : "comment")
    setArtifactComposing(entry ? hasArtifactDraftBody(`${reviewId}:${entry.path}`) : false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry])

  const chooseZoom = (next: number) => {
    const clamped = clampZoom(next)
    setHtmlZoom(clamped)
    localStorage.setItem(HTML_ZOOM_KEY, String(clamped))
  }

  const toggleFullscreen = () => {
    const el = htmlFrameRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.()
  }

  const chooseView = (next: "source" | "preview") => {
    setView(next)
    writeDocView(next === "source" ? "source" : "rendered")
  }
  const chooseHtmlMode = (next: "source" | "comment" | "interactive") => {
    setHtmlMode(next)
    writeDocView(next === "source" ? "source" : "rendered")
  }

  useEffect(() => {
    if (!entry) return
    const path = entry.path
    let cancelled = false
    setContent({ kind: "loading" })
    setToc([])
    fetch(`/api/review/${reviewId}/files/content?path=${encodeURIComponent(path)}`)
      .then(async (response) => {
        if (cancelled) return
        if (!response.ok) {
          setContent({ kind: "error", message: `Couldn't load file (${response.status}).` })
          return
        }
        const mime = response.headers.get("content-type") ?? ""
        if (!isTextMime(mime)) {
          const type = mime.split(";")[0].trim() || "application/octet-stream"
          const bytes = Number(response.headers.get("content-length")) || null
          if (type.startsWith("image/")) {
            const url = `/api/review/${reviewId}/files/content?path=${encodeURIComponent(path)}`
            setContent({ kind: "image", url, mime: type, bytes })
          } else {
            setContent({ kind: "binary", mime: type, bytes })
          }
          return
        }
        const body = (await response.text()).replace(/\n$/, "")
        if (cancelled) return
        setContent({ kind: "text", lines: body.split("\n"), tokens: null })
        const ext = path.slice(path.lastIndexOf(".") + 1)
        highlightLines(body, ext)
          .then((tokens) => {
            if (!cancelled) setContent({ kind: "text", lines: body.split("\n"), tokens })
          })
          .catch(() => undefined)
        if (/\.(md|markdown)$/i.test(path)) {
          if (!cancelled) setToc(markdownToc(body))
        } else {
          const lang = langForPath(path)
          if (lang) {
            outline(body, lang)
              .then((items) => {
                if (!cancelled) setToc(items)
              })
              .catch(() => undefined)
          }
        }
      })
      .catch((cause: Error) => {
        if (!cancelled) setContent({ kind: "error", message: cause.message })
      })
    return () => {
      cancelled = true
    }
  }, [reviewId, entry])

  const scrollToLine = (line: number) => {
    document
      .querySelector(`[data-review-line="${line}"]`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" })
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col bg-editor">
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-hair px-4">
        {entry && filePosition ? (
          <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
            <button
              type="button"
              onClick={() => filePosition.previousPath && onSelectFile(filePosition.previousPath)}
              disabled={!filePosition.previousPath}
              className="grid size-[30px] shrink-0 place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink disabled:pointer-events-none disabled:opacity-35"
              title="Previous file"
              aria-label="Previous file"
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onOpenFiles}
              className="inline-flex h-[30px] shrink-0 items-center gap-0.5 rounded-ctrl px-2 font-mono text-[11px] font-semibold tabular-nums text-muted hover:bg-soft hover:text-ink"
              title="Files"
              aria-label={`Open file list, current file ${filePosition.index + 1} of ${filePosition.total}`}
            >
              {filePosition.index + 1}/{filePosition.total}
              <ChevronDown size={12} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => filePosition.nextPath && onSelectFile(filePosition.nextPath)}
              disabled={!filePosition.nextPath}
              className="grid size-[30px] shrink-0 place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink disabled:pointer-events-none disabled:opacity-35"
              title="Next file"
              aria-label="Next file"
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenFiles}
            className="grid size-[30px] shrink-0 place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink lg:hidden"
            title="Files"
            aria-label="Open file list"
          >
            <PanelLeft size={17} aria-hidden />
          </button>
        )}
        {entry ? (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-1.5 lg:hidden">
              <FileIcon name={name} size={13} />
              <span className="truncate font-mono text-[12px] text-ink" title={entry.path}>
                {name}
              </span>
            </div>
            <div className="hidden min-w-0 items-center gap-2 lg:flex">
              <FileIcon name={name} size={14} />
              <span className="truncate font-mono text-[12.5px] text-ink">
                <span className="text-faint">{dir}</span>
                {name}
              </span>
            </div>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-faint lg:flex-none">No file selected</span>
        )}
        <span className="hidden flex-1 lg:block" />
        {previewable && content.kind === "text" && (
          <>
            <div className="lg:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className="inline-flex h-[30px] shrink-0 items-center gap-1 rounded-ctrl px-2 text-[12px] font-semibold text-muted hover:bg-soft hover:text-ink"
                      aria-label="Choose view mode"
                      title="View mode"
                    >
                      {view === "source" ? "Source" : "Preview"}
                      <ChevronDown size={13} aria-hidden />
                    </button>
                  }
                />
                <DropdownMenuContent>
                  <DropdownMenuItem selected={view === "source"} onClick={() => chooseView("source")}>
                    Source
                  </DropdownMenuItem>
                  <DropdownMenuItem selected={view === "preview"} onClick={() => chooseView("preview")}>
                    Preview
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="hidden lg:block">
              <Segmented<"source" | "preview">
                value={view}
                onChange={chooseView}
                options={[
                  ["source", "Source"],
                  ["preview", "Preview"],
                ]}
              />
            </div>
          </>
        )}
        {htmlFile && content.kind === "text" && (
          <>
            <div className="lg:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className="inline-flex h-[30px] shrink-0 items-center gap-1 rounded-ctrl px-2 text-[12px] font-semibold text-muted hover:bg-soft hover:text-ink"
                      aria-label="Choose view mode"
                      title="View mode"
                    >
                      {htmlMode === "source" ? "Source" : htmlMode === "comment" ? "Comment" : "Interactive"}
                      <ChevronDown size={13} aria-hidden />
                    </button>
                  }
                />
                <DropdownMenuContent>
                  <DropdownMenuItem selected={htmlMode === "source"} onClick={() => chooseHtmlMode("source")}>
                    Source
                  </DropdownMenuItem>
                  <DropdownMenuItem selected={htmlMode === "comment"} onClick={() => chooseHtmlMode("comment")}>
                    Comment
                  </DropdownMenuItem>
                  <DropdownMenuItem selected={htmlMode === "interactive"} onClick={() => chooseHtmlMode("interactive")}>
                    Interactive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="hidden lg:block">
              <Segmented<"source" | "comment" | "interactive">
                value={htmlMode}
                onChange={chooseHtmlMode}
                options={[
                  ["source", "Source"],
                  ["comment", "Comment"],
                  [
                    "interactive",
                    <span className="inline-flex items-center gap-1.5">
                      Interactive
                      <Tooltip
                        side="bottom"
                        content={
                          <>
                            <b className="font-semibold text-ink">Interactive mode</b> makes links, hovers, and form
                            controls live. Comment anchoring is paused so the page is not intercepted; switch back to
                            Comment to anchor.
                          </>
                        }
                        render={
                          <span aria-label="About interactive mode" className="grid place-items-center">
                            <Info size={12} aria-hidden />
                          </span>
                        }
                      />
                    </span>,
                  ],
                ]}
              />
            </div>
            {htmlMode !== "source" && (
              <>
                <div className="inline-flex h-[24px] items-center overflow-hidden rounded-[7px] border border-hair-strong bg-soft/60 text-[11px]">
                  <button
                    type="button"
                    onClick={() => chooseZoom(htmlZoom - 0.1)}
                    title="Zoom out"
                    className="grid h-[24px] w-[26px] place-items-center text-muted hover:bg-soft"
                  >
                    <Minus size={12} aria-hidden />
                  </button>
                  <span className="h-full w-px bg-hair-strong" />
                  <button
                    type="button"
                    onClick={() => chooseZoom(1)}
                    title="Reset zoom to 100%"
                    className="h-[24px] min-w-[42px] px-2 text-center font-medium tabular-nums text-ink hover:bg-soft"
                  >
                    {Math.round(htmlZoom * 100)}%
                  </button>
                  <span className="h-full w-px bg-hair-strong" />
                  <button
                    type="button"
                    onClick={() => chooseZoom(htmlZoom + 0.1)}
                    title="Zoom in"
                    className="grid h-[24px] w-[26px] place-items-center text-muted hover:bg-soft"
                  >
                    <Plus size={12} aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  title="Fullscreen"
                  className="grid size-[24px] place-items-center rounded-[7px] border border-hair-strong bg-soft/60 text-muted hover:bg-soft hover:text-ink"
                >
                  <Maximize2 size={13} aria-hidden />
                </button>
              </>
            )}
          </>
        )}
        {toc.length > 0 && !htmlFile && <TocMenu items={toc} onJump={scrollToLine} />}
        {!readOnly && entry && fileProxy && content.kind !== "loading" && content.kind !== "error" && commentDisplay !== "side" && (
          <button
            type="button"
            onClick={() => setArtifactComposing(true)}
            title="Comment on this file"
            aria-label="Comment on this file"
            className="grid size-[30px] shrink-0 place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
          >
            <MessageSquarePlus size={16} aria-hidden />
          </button>
        )}
        {!readOnly && entry && fileProxy && verdict && (
          <VerdictChip file={verdict} proxy={fileProxy} />
        )}
      </div>
      {compare && <CompareBar compare={compare} />}
      {readOnly && entry && (
        <div className="flex shrink-0 items-center gap-2.5 border-b border-hair bg-soft/40 px-4 py-2 text-[11.5px] leading-[1.45] text-muted">
          <Lock size={15} className="shrink-0 text-muted" aria-hidden />
          <span>
            Round {selectedRound} is superseded and read-only. You can read its comments, but new comments
            and verdicts only go on the latest round.
          </span>
        </div>
      )}
      {entry && htmlFile && htmlMode !== "source" && content.kind === "text" ? (
        <HtmlView
          key={entry.path}
          source={content.lines.join("\n")}
          mode={htmlMode}
          zoom={htmlZoom}
          frameRef={htmlFrameRef}
          comments={comments}
          fileProxy={fileProxy}
          commentsProxy={commentsProxy}
          draftScope={`${reviewId}:${entry.path}`}
        />
      ) : (
        <div
          className="flex min-h-0 flex-1 flex-col overflow-auto"
          data-review-scroll
          onPointerDownCapture={(event) => {
            if ((event.target as Element).closest("[data-thread-card]")) return
            onClearFocus()
          }}
        >
          {commentDisplay === "inline" && entry && fileProxy && content.kind !== "loading" && content.kind !== "error" && (
            <ArtifactComments
              comments={comments}
              fileProxy={fileProxy}
              commentsProxy={commentsProxy}
              draftScope={`${reviewId}:${entry.path}`}
              composing={!readOnly && artifactComposing}
              onClose={() => setArtifactComposing(false)}
            />
          )}
          {!entry ? (
            <div className="grid flex-1 place-items-center text-[13px] text-faint">
              {filesLoaded ? "No files in this review." : "Loading…"}
            </div>
          ) : content.kind === "loading" ? (
            <div className="grid flex-1 place-items-center text-[13px] text-faint">Loading…</div>
          ) : content.kind === "error" ? (
            <div className="grid flex-1 place-items-center text-[13px] text-request">{content.message}</div>
          ) : content.kind === "image" ? (
            <ImageView name={name} url={content.url} mime={content.mime} bytes={content.bytes} />
          ) : content.kind === "binary" ? (
            <BinaryNotice name={name} mime={content.mime} bytes={content.bytes} />
          ) : content.lines.length === 1 && content.lines[0] === "" ? (
            <EmptyFileNotice name={name} />
          ) : previewable && view === "preview" ? (
            <MarkdownPreview
              source={content.lines.join("\n")}
              comments={comments}
              fileProxy={fileProxy}
              commentsProxy={commentsProxy}
              draftScope={`${reviewId}:${entry.path}`}
              readOnly={readOnly}
              composerMode={commentDisplay === "side" ? "popover" : "inline"}
              showThreads={commentDisplay === "inline"}
              focusedCommentId={focusedCommentId}
              highlightedRange={highlightedRange}
              onFocusComment={onFocusComment}
            />
          ) : (
            <Source
              lines={content.lines}
              tokens={content.tokens}
              comments={comments}
              fileProxy={fileProxy}
              commentsProxy={commentsProxy}
              draftScope={`${reviewId}:${entry.path}`}
              readOnly={readOnly}
              composerMode={commentDisplay === "side" ? "popover" : "inline"}
              showThreads={commentDisplay === "inline"}
              focusedCommentId={focusedCommentId}
              highlightedRange={highlightedRange}
              onFocusComment={onFocusComment}
            />
          )}
        </div>
      )}
    </div>
  )
}

/** A7: what changed between the prior round and the selected one — resolved,
 * new, and still-open comment counts, plus the round's verdict. */
function CompareBar({ compare }: { compare: RoundCompare }) {
  return (
    <div className="shrink-0 border-b border-hair-strong bg-surface">
      <div className="flex items-center gap-2 border-b border-hair bg-soft/40 px-4 py-2">
        <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-bold text-text">Round {compare.from}</span>
        <ArrowRight size={13} className="text-muted" aria-hidden />
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-bright shadow-[inset_0_0_0_0.5px_var(--accent-edge)]">
          Round {compare.to}
        </span>
        <span className="ml-1 text-[12px] text-muted">what changed this round</span>
      </div>
      <div className="flex items-center gap-4 px-4 py-2.5 text-[12px]">
        <CompareStat n={compare.resolved} label="resolved" tone="approve" />
        <CompareStat n={compare.added} label="new" tone="accent" />
        <CompareStat n={compare.open} label="still open" tone="amber" />
        {compare.verdict && (
          <>
            <span className="flex-1" />
            <span className="text-[10px] font-bold uppercase tracking-wide text-faint">Verdict</span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${verdictSoft(compare.verdict)} ${verdictText(compare.verdict)}`}
            >
              {VERDICT_META[compare.verdict].label}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

function CompareStat({ n, label, tone }: { n: number; label: string; tone: "approve" | "accent" | "amber" }) {
  const chip =
    tone === "approve"
      ? "bg-approve-soft text-approve"
      : tone === "accent"
        ? "bg-accent-soft text-accent-bright"
        : "bg-amber-soft text-amber"
  return (
    <span className="inline-flex items-center gap-1.5 text-text">
      <span className={`grid size-[18px] place-items-center rounded-[5px] text-[10px] font-extrabold tabular-nums ${chip}`}>
        {n}
      </span>
      {label}
    </span>
  )
}

/** Markdown Preview (D2): each top-level block rendered to HTML with a
 * line-number gutter mapping it back to source. A reviewer anchors a comment to
 * a whole block — the gutter is a click target, and published/pending threads
 * whose located anchor falls in a block render beneath it, mirroring Source. */

/** H2 review overview — the draft verdict rollup, open-blocker list, and round
 * stats. No longer a persistent column; opened from the toolbar Review button. */

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center bg-canvas text-[13px] text-muted">{children}</div>
  )
}
