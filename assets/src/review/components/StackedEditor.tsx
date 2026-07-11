import { useEffect, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import type { StoreProxy } from "@musubi/react"
import { ArrowDownUp, Check, ChevronDown, ChevronRight, CircleCheck, Files, Lock, MessageSquare } from "lucide-react"

import { useMusubiCommand } from "../../musubi"
import type { CommentDisplayMode } from "../../stores/ui-store"
import { FileIcon } from "../../board/FileIcon"
import { Segmented } from "../../components/ui/segmented"
import { MarkdownPreview, Source } from "./EditorBodies"
import { SideCommentCard } from "./comments/SideCommentCard"
import {
  BinaryNotice,
  type Content,
  type DiffLens,
  EmptyFileNotice,
  ImageView,
  LoadingNotice,
  readDocView,
  useFileContent,
  writeDocView,
} from "./EditorSurface"
import { DiffView } from "./DiffView"
import { FileNotice } from "./EditorSurface"
import { VerdictChip } from "./ReviewChrome"
import { CommentThread } from "./comments/CommentThread"
import type { Comment, CommentsStoreProxy } from "./comments/shared"

type FileStoreProxy = StoreProxy<"SuikouWeb.Stores.FileStore", Musubi.Stores>
type Verdict = "approve" | "request_changes" | "comment"
type ChangeStatus = "added" | "modified" | "deleted" | "renamed" | "copied" | "type_changed" | null

/** One file's slice of the stacked view: its static entry joined with its live
 * FileStore proxy, streamed comments, and rolled-up verdict. */
export type StackedFileDatum = {
  path: string
  changeStatus: ChangeStatus
  proxy: FileStoreProxy | null
  commentsProxy: CommentsStoreProxy | null
  comments: Comment[]
  draftVerdict: Verdict | null
  latestVerdict: Verdict | null
  approved: boolean
  openBlockers: number
}

const STATUS_BADGE: Record<Exclude<ChangeStatus, null>, { letter: string; className: string; title: string }> = {
  added: { letter: "A", className: "bg-approve-soft text-approve shadow-[inset_0_0_0_0.5px_var(--approve-edge)]", title: "Added" },
  modified: { letter: "M", className: "bg-amber-soft text-amber shadow-[inset_0_0_0_0.5px_var(--amber-edge)]", title: "Modified" },
  deleted: { letter: "D", className: "bg-request-soft text-request shadow-[inset_0_0_0_0.5px_var(--request-edge)]", title: "Deleted" },
  renamed: { letter: "R", className: "bg-soft text-muted shadow-[inset_0_0_0_0.5px_var(--hair-strong)]", title: "Renamed" },
  copied: { letter: "C", className: "bg-soft text-muted shadow-[inset_0_0_0_0.5px_var(--hair-strong)]", title: "Copied" },
  type_changed: { letter: "T", className: "bg-soft text-muted shadow-[inset_0_0_0_0.5px_var(--hair-strong)]", title: "Type changed" },
}

const effectiveVerdict = (file: StackedFileDatum): Verdict | null => file.draftVerdict ?? file.latestVerdict
const isReviewed = (file: StackedFileDatum): boolean => effectiveVerdict(file) !== null && file.openBlockers === 0

/** A request to bring a stacked file (and optionally a specific line) into view.
 * A `null` line just scrolls to the file header; a set line scrolls to that line
 * once the file's body has mounted (render-before-locate). */
export type StackedScrollTarget = { path: string; line: number | null }

export const commentStartLine = (comment: Comment): number | null =>
  comment.anchor?.type === "line_range" ? comment.anchor.start_line : null

/** D11 stacked all-files view: every file in the review rendered top to bottom in
 * one vertical scroll, each with a sticky header (status · path · view toggle ·
 * per-file verdict chip) then its content and inline threads. A scroll-spy reports
 * the file currently in view so the navigator can mark it; "Hide reviewed" drops
 * files that already carry a verdict. */
export const StackedFiles = observer(function StackedFiles({
  reviewId,
  files,
  readOnly,
  selectedRound,
  commentDisplay,
  hideReviewed,
  focusedCommentId,
  onFocusComment,
  onClearFocus,
  onScrolledTo,
  scrollTarget,
  onScrollHandled,
  diffLens,
}: {
  reviewId: string
  files: StackedFileDatum[]
  readOnly: boolean
  selectedRound: number
  commentDisplay: CommentDisplayMode
  hideReviewed: boolean
  focusedCommentId: string | null
  onFocusComment: (commentId: string | null) => void
  onClearFocus: () => void
  onScrolledTo: (path: string) => void
  scrollTarget: StackedScrollTarget | null
  onScrollHandled: () => void
  diffLens?: DiffLens
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const showThreads = commentDisplay === "inline"
  const shown = hideReviewed ? files.filter((f) => !isReviewed(f)) : files

  // Scroll-spy: mark the file whose header sits near the top of the scroll as the
  // one "in view", so the navigator tracks the reader down the stack.
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const heads = Array.from(root.querySelectorAll<HTMLElement>("[data-stacked-file]"))
    if (heads.length === 0) return
    const io = new IntersectionObserver(
      (entries) => {
        const hits = entries.filter((e) => e.isIntersecting)
        if (hits.length === 0) return
        const top = hits.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b))
        const path = (top.target as HTMLElement).dataset.stackedFile
        if (path) onScrolledTo(path)
      },
      { root, rootMargin: "0px 0px -82% 0px", threshold: 0 },
    )
    heads.forEach((h) => io.observe(h))
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((f) => f.path).join("|")])

  return (
    <div className="flex min-h-0 min-w-0 flex-col bg-editor">
      {readOnly && (
        <div className="flex shrink-0 items-center gap-2.5 border-b border-hair bg-soft/40 px-4 py-2 text-[11.5px] leading-[1.45] text-muted">
          <Lock size={15} className="shrink-0 text-muted" aria-hidden />
          <span>
            Round {selectedRound} is superseded and read-only. You can read its comments, but new comments
            and verdicts only go on the latest round.
          </span>
        </div>
      )}
      <div
        ref={containerRef}
        className="flex min-h-0 flex-1 flex-col overflow-auto"
        data-review-scroll
        onPointerDownCapture={(event) => {
          if ((event.target as Element).closest("[data-thread-card]")) return
          onClearFocus()
        }}
      >
        {shown.length === 0 ? (
          files.length === 0 ? (
            <FileNotice icon={Files} title="No files in this review" body="Add files from the project board or check that the review's selection is not empty." />
          ) : (
            <FileNotice icon={CircleCheck} title="Every file has a verdict" body="Nothing left to review under the current filter. Toggle Hide reviewed off to see the finished files again." />
          )
        ) : (
          shown.map((file) => (
            <StackedFile
              key={file.path}
              reviewId={reviewId}
              file={file}
              readOnly={readOnly}
              showThreads={showThreads}
              focusedCommentId={focusedCommentId}
              onFocusComment={onFocusComment}
              scrollTarget={scrollTarget?.path === file.path ? scrollTarget : null}
              jumping={scrollTarget != null && scrollTarget.path !== file.path}
              onScrollHandled={onScrollHandled}
              diffLens={diffLens}
            />
          ))
        )}
      </div>
    </div>
  )
})

// Virtualization budget: mount a file's heavy body while it is within this many
// pixels of the viewport, and keep it mounted this long after it scrolls away
// before dropping it to a spacer. The margin prerenders neighbours so scrolling
// rarely hits a blank; the delay avoids thrashing on small back-and-forth scrolls.
const RENDER_MARGIN_PX = 800
const UNMOUNT_DELAY_MS = 4000
// A not-yet-measured file reserves roughly a loading-notice's worth of height, so
// the first paint keeps only a few files per screen and mounts few heavy bodies.
const DEFAULT_BODY_HEIGHT = 440

const StackedFile = observer(function StackedFile({
  reviewId,
  file,
  readOnly,
  showThreads,
  focusedCommentId,
  onFocusComment,
  scrollTarget,
  jumping,
  onScrollHandled,
  diffLens,
}: {
  reviewId: string
  file: StackedFileDatum
  readOnly: boolean
  showThreads: boolean
  focusedCommentId: string | null
  onFocusComment: (commentId: string | null) => void
  scrollTarget: StackedScrollTarget | null
  jumping: boolean
  onScrollHandled: () => void
  diffLens?: DiffLens
}) {
  const dir = file.path.slice(0, file.path.lastIndexOf("/") + 1)
  const name = file.path.slice(file.path.lastIndexOf("/") + 1)
  const previewable = /\.(md|markdown)$/i.test(file.path)
  const [view, setView] = useState<"source" | "preview">(readDocView() === "source" ? "source" : "preview")
  const badge = file.changeStatus ? STATUS_BADGE[file.changeStatus] : null
  const draftScope = `${reviewId}:${file.path}`
  // The highlight is scoped to this file: only its own focused comment lights up,
  // so a shared line number never highlights the same row in every stacked file.
  const focused = file.comments.find((c) => c.id === focusedCommentId)
  const highlightedRange =
    focused && focused.anchor?.type === "line_range"
      ? { start: focused.anchor.start_line, end: focused.anchor.end_line }
      : null

  // Viewport virtualization: only the files near the viewport keep their body
  // (fetch + Shiki tokens + threads) in memory. Off-screen files unmount to a
  // spacer of their last measured height after UNMOUNT_DELAY_MS, so a long
  // review scrolls without holding every file's render at once.
  const sectionRef = useRef<HTMLElement>(null)
  const [mounted, setMounted] = useState(false)
  // Manual per-file collapse: reviewer clicks the chevron to hide the body.
  // Collapsed files skip the heavy render entirely (no spacer either), so the
  // stack behaves like a folded outline. Transient — resets on remount.
  const [collapsed, setCollapsed] = useState(false)
  const bodyHeight = useRef<number>(DEFAULT_BODY_HEIGHT)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    // Mount deterministically on first paint if this section already sits within
    // the render margin — the observer's first callback can lag a frame, and a
    // visible file must never paint as a blank spacer.
    const rect = el.getBoundingClientRect()
    if (rect.bottom > -RENDER_MARGIN_PX && rect.top < window.innerHeight + RENDER_MARGIN_PX) {
      setMounted(true)
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          clearTimeout(timer.current)
          setMounted(true)
        } else {
          clearTimeout(timer.current)
          timer.current = setTimeout(() => setMounted(false), UNMOUNT_DELAY_MS)
        }
      },
      { rootMargin: `${RENDER_MARGIN_PX}px 0px ${RENDER_MARGIN_PX}px 0px`, threshold: 0 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      clearTimeout(timer.current)
    }
  }, [])

  // Render-before-locate: a scroll request force-mounts this file (so a body
  // that was dropped to a spacer renders first), then scrolls. The spacer's
  // reserved height is a stale estimate from the last measurement (or the
  // 440px default on first mount), so scrolling BEFORE the real body renders
  // lands on the wrong absolute position — after mount, everything below
  // shifts and the header ends up above/below the viewport. Solution: mount
  // first, defer scroll until the body has laid out (two RAFs = "next frame
  // after commit"). A header-only target (no line) is enough; a line target
  // is handled inside StackedFileContent once the specific line row exists.
  const pendingScroll = useRef(false)
  useEffect(() => {
    if (!scrollTarget) return
    setMounted(true)
    clearTimeout(timer.current)
    if (scrollTarget.line == null) {
      pendingScroll.current = true
    }
  }, [scrollTarget])

  // Direct jump: when the reader clicks another file, drop every non-target body
  // at once (instead of after UNMOUNT_DELAY_MS) so the jump lands without paying
  // to render the files scrolled past. IO re-mounts the new neighbours on arrival.
  useEffect(() => {
    if (!jumping) return
    clearTimeout(timer.current)
    setMounted(false)
  }, [jumping])

  useEffect(() => {
    if (!mounted || !pendingScroll.current || !scrollTarget || scrollTarget.line != null) return
    pendingScroll.current = false
    // Two RAFs so both React commit + browser layout are settled before we
    // measure the header's position and scroll to it.
    const r1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        sectionRef.current?.scrollIntoView({ block: "start" })
        onScrollHandled()
      })
    })
    return () => cancelAnimationFrame(r1)
  }, [mounted, scrollTarget, onScrollHandled])

  const chooseView = (next: "source" | "preview") => {
    setView(next)
    writeDocView(next === "source" ? "source" : "rendered")
  }

  const isDiff = !!diffLens
  return (
    <section ref={sectionRef} className="border-b border-hair-strong last:border-b-0">
      <header
        data-stacked-file={file.path}
        className="sticky top-0 z-[4] flex items-center gap-2.5 border-b border-hair-strong bg-surface px-3.5 py-2 shadow-[0_2px_8px_var(--shadow-color,transparent)]"
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="grid size-[20px] shrink-0 place-items-center rounded text-muted hover:bg-soft hover:text-ink"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand file" : "Collapse file"}
          title={collapsed ? "Expand file" : "Collapse file"}
        >
          {collapsed ? <ChevronRight size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
        </button>
        {badge && (
          <span
            title={badge.title}
            className={`grid size-[17px] shrink-0 place-items-center rounded-[4px] text-[9.5px] font-extrabold ${badge.className}`}
          >
            {badge.letter}
          </span>
        )}
        <FileIcon name={name} size={13} />
        <span className="min-w-0 truncate font-mono text-[12.5px] font-semibold text-ink" title={file.path}>
          <span className="font-normal text-faint">{dir}</span>
          {name}
        </span>
        {isReviewed(file) && (
          <span className="inline-flex h-[19px] shrink-0 items-center gap-1 rounded-full bg-approve-soft px-2 text-[10px] font-bold text-approve shadow-[inset_0_0_0_0.5px_var(--approve-edge)]">
            <Check size={11} aria-hidden />
            Reviewed
          </span>
        )}
        <span className="flex-1" />
        {previewable && !isDiff && (
          <Segmented<"source" | "preview">
            value={view}
            onChange={chooseView}
            options={[
              ["source", "Source"],
              ["preview", "Preview"],
            ]}
          />
        )}
        {!readOnly && file.proxy && (
          <VerdictChip file={file} proxy={file.proxy} />
        )}
      </header>
      {collapsed ? null : mounted ? (
        <StackedFileContent
          reviewId={reviewId}
          file={file}
          name={name}
          previewable={previewable}
          view={view}
          draftScope={draftScope}
          readOnly={readOnly}
          showThreads={showThreads}
          focusedCommentId={focusedCommentId}
          highlightedRange={highlightedRange}
          onFocusComment={onFocusComment}
          scrollToLine={scrollTarget?.line ?? null}
          onScrollHandled={onScrollHandled}
          onHeight={(h) => {
            bodyHeight.current = h
          }}
          diffLens={diffLens}
        />
      ) : (
        <div style={{ height: bodyHeight.current }} aria-hidden />
      )}
    </section>
  )
})

/** The heavy half of a stacked file — content fetch, render, and threads — split
 * out so it only exists while its parent is near the viewport. Reports its
 * measured height up so the parent can reserve the same space with a spacer once
 * it unmounts, keeping the scroll position stable. */
const StackedFileContent = observer(function StackedFileContent({
  reviewId,
  file,
  name,
  previewable,
  view,
  draftScope,
  readOnly,
  showThreads,
  focusedCommentId,
  highlightedRange,
  onFocusComment,
  scrollToLine,
  onScrollHandled,
  onHeight,
  diffLens,
}: {
  reviewId: string
  file: StackedFileDatum
  name: string
  previewable: boolean
  view: "source" | "preview"
  draftScope: string
  readOnly: boolean
  showThreads: boolean
  focusedCommentId: string | null
  highlightedRange: { start: number; end: number } | null
  onFocusComment: (commentId: string | null) => void
  scrollToLine: number | null
  onScrollHandled: () => void
  onHeight: (height: number) => void
  diffLens?: DiffLens
}) {
  const { content } = useFileContent(reviewId, file.path, diffLens)
  // ponytail: html renders as Source in the stacked scan view. Rich html modes
  // (iframe comment/interactive/zoom) stay in the single-file editor — an iframe
  // per stacked file would be heavy and the anchoring belongs to focused reading.
  const artifactComments = file.comments.filter((c) => c.scope === "artifact")
  const ref = useRef<HTMLDivElement>(null)
  const requestContent = useMusubiCommand(file.proxy as FileStoreProxy, "request_content")

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [onHeight])

  // Signal the server that this file's content is being read, so it re-anchors
  // the file's comments against the current text and pushes any moved anchors
  // back. Fires when the file mounts into (or near) the viewport.
  useEffect(() => {
    if (file.proxy) requestContent.dispatch({}).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.path, file.proxy])

  // Line-target scroll (render-before-locate step 2): once the body has rendered
  // its lines, bring the requested line into view, then clear the request.
  useEffect(() => {
    if (scrollToLine == null || content.kind !== "text") return
    ref.current
      ?.querySelector(`[data-review-line="${scrollToLine}"]`)
      ?.scrollIntoView({ block: "center" })
    onScrollHandled()
  }, [scrollToLine, content.kind, onScrollHandled])

  return (
    <div ref={ref} className="pb-1.5">
      {showThreads && artifactComments.length > 0 && (
        <div className="border-b border-hair px-3.5 pt-2 pb-1">
          <div className="flex items-center gap-2 px-1 pb-0.5">
            <MessageSquare size={13} className="text-muted" aria-hidden />
            <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-faint">File comments</span>
            <span className="text-[11px] font-semibold text-muted tabular-nums">{artifactComments.length}</span>
          </div>
          {artifactComments.map((comment) => (
            <CommentThread key={comment.id} comment={comment} commentsProxy={file.commentsProxy} className="my-1.5" />
          ))}
        </div>
      )}
      <StackedBody
        content={content}
        name={name}
        previewable={previewable}
        view={view}
        file={file}
        draftScope={draftScope}
        readOnly={readOnly}
        showThreads={showThreads}
        focusedCommentId={focusedCommentId}
        highlightedRange={highlightedRange}
        onFocusComment={onFocusComment}
        isDiff={!!diffLens}
      />
    </div>
  )
})

function StackedBody({
  content,
  name,
  previewable,
  view,
  file,
  draftScope,
  readOnly,
  showThreads,
  focusedCommentId,
  highlightedRange,
  onFocusComment,
  isDiff,
}: {
  content: Content
  name: string
  previewable: boolean
  view: "source" | "preview"
  file: StackedFileDatum
  draftScope: string
  readOnly: boolean
  showThreads: boolean
  focusedCommentId: string | null
  highlightedRange: { start: number; end: number } | null
  onFocusComment: (commentId: string | null) => void
  isDiff: boolean
}) {
  if (content.kind === "loading") {
    return <LoadingNotice name={name} />
  }
  if (content.kind === "error") {
    return <div className="px-4 py-6 text-[12.5px] text-request">{content.message}</div>
  }
  if (content.kind === "image") {
    return <ImageView name={name} url={content.url} mime={content.mime} bytes={content.bytes} />
  }
  if (content.kind === "binary") {
    return <BinaryNotice name={name} mime={content.mime} bytes={content.bytes} />
  }
  if (content.lines.length === 1 && content.lines[0] === "") {
    return <EmptyFileNotice name={name} />
  }
  if (isDiff) {
    return (
      <DiffView
        patch={content.lines.join("\n")}
        path={file.path}
        comments={file.comments}
        fileProxy={file.proxy}
        commentsProxy={file.commentsProxy}
        draftScope={draftScope}
        readOnly={readOnly}
        focusedCommentId={focusedCommentId}
        onFocusComment={onFocusComment}
      />
    )
  }
  if (previewable && view === "preview") {
    return (
      <MarkdownPreview
        source={content.lines.join("\n")}
        comments={file.comments}
        fileProxy={file.proxy}
        commentsProxy={file.commentsProxy}
        draftScope={draftScope}
        readOnly={readOnly}
        showThreads={showThreads}
        focusedCommentId={focusedCommentId}
        highlightedRange={highlightedRange}
        onFocusComment={onFocusComment}
      />
    )
  }
  return (
    <Source
      lines={content.lines}
      tokens={content.tokens}
      comments={file.comments}
      fileProxy={file.proxy}
      commentsProxy={file.commentsProxy}
      draftScope={draftScope}
      readOnly={readOnly}
      showThreads={showThreads}
      focusedCommentId={focusedCommentId}
      highlightedRange={highlightedRange}
      onFocusComment={onFocusComment}
    />
  )
}

const commentTime = (comment: Comment): number => Date.parse(comment.inserted_at) || 0

/** The stacked view's side-comment rail (D11 + side comments): one continuous
 * rail spanning the whole scroll, its cards grouped by file into collapsible
 * sections. Only files that carry comments get a group, and a newly authored
 * comment surfaces its file's group at once (the rail reads the live snapshot).
 * Cards reuse the single-file side card, so the behaviour matches; clicking a
 * card's anchor asks the parent to scroll that file's line into view. */
export const StackedSideRail = observer(function StackedSideRail({
  files,
  onFocus,
}: {
  files: StackedFileDatum[]
  onFocus: (file: StackedFileDatum, comment: Comment) => void
}) {
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const withComments = files.filter((f) => f.comments.length > 0)
  const total = withComments.reduce((n, f) => n + f.comments.length, 0)

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  return (
    <aside className="hidden min-h-0 flex-col border-l border-hair-strong bg-surface lg:flex">
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-hair px-3">
        <MessageSquare size={15} className="text-muted" aria-hidden />
        <h3 className="text-[12px] font-bold tracking-[-0.01em] text-ink">Comments</h3>
        <span className="rounded-full bg-soft px-2 py-0.5 text-[10.5px] font-bold text-muted tabular-nums">{total}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setSortOrder((order) => (order === "newest" ? "oldest" : "newest"))}
          title={`Sort: ${sortOrder === "newest" ? "Newest first" : "Oldest first"}`}
          aria-label={`Sort comments: ${sortOrder === "newest" ? "newest first" : "oldest first"}`}
          className="grid size-[26px] cursor-pointer place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
        >
          <ArrowDownUp size={14} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {withComments.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center text-[12px] leading-[1.45] text-faint">
            No comments in this review yet.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {withComments.map((file) => {
              const open = !collapsed.has(file.path)
              const name = file.path.slice(file.path.lastIndexOf("/") + 1)
              const dir = file.path.slice(0, file.path.lastIndexOf("/") + 1)
              const direction = sortOrder === "newest" ? -1 : 1
              const sorted = [...file.comments].sort((a, b) => direction * (commentTime(a) - commentTime(b)))
              return (
                <div key={file.path}>
                  <button
                    type="button"
                    onClick={() => toggle(file.path)}
                    className="flex w-full items-center gap-1.5 rounded-ctrl px-1.5 py-1 text-left hover:bg-soft"
                  >
                    <ChevronRight
                      size={13}
                      className={`shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`}
                      aria-hidden
                    />
                    <FileIcon name={name} size={12} />
                    <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] font-semibold text-ink" title={file.path}>
                      <span className="font-normal text-faint">{dir}</span>
                      {name}
                    </span>
                    <span className="shrink-0 rounded-full bg-soft px-1.5 py-0.5 text-[10px] font-bold text-muted tabular-nums">
                      {file.comments.length}
                    </span>
                  </button>
                  {open && (
                    <div className="mt-1 mb-1 flex flex-col gap-2 pl-1.5">
                      {sorted.map((comment) => (
                        <SideCommentCard
                          key={comment.id}
                          comment={comment}
                          commentsProxy={file.commentsProxy}
                          onFocusLine={() => onFocus(file, comment)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
})
