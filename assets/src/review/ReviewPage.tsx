import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "@tanstack/react-router"
import { observer } from "mobx-react-lite"
import type { CommandReply, StoreProxy, StoreSnapshot } from "@musubi/react"
import type { ThemedToken } from "shiki"
import { AlertTriangle, ArrowRight, Binary, Bot, Check, ChevronDown, ChevronRight, Circle, CircleCheck, Code2, CornerDownRight, File, FileText, Folder, GitCompare, GitCompareArrows, HelpCircle, Info, ListTree, Lock, Maximize2, MessageSquare, MessageSquarePlus, Minus, PanelLeft, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, StickyNote, Trash2, Upload, User, X } from "lucide-react"

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
import { Popover } from "../components/ui/popover"
import { Segmented } from "../components/ui/segmented"
import { Tooltip } from "../components/ui/tooltip"
import { SettingsModal } from "../settings/SettingsModal"
import { FileIcon } from "../board/FileIcon"
import { highlightLines } from "./highlight"
import { markdownToc, renderMarkdown, renderMarkdownBlocks } from "./markdown"
import { langForPath, outline, type OutlineItem } from "../treesitter/outline"

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
type RailGroup = { key: string; line: number | null; comments: Comment[] }

const VERDICT_META: Record<Verdict, { label: string; short: string }> = {
  approve: { label: "Approve", short: "Approved" },
  request_changes: { label: "Request changes", short: "Request changes" },
  comment: { label: "Comment", short: "Comment" },
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

const sameRange = (a: Range, b: Range): boolean => a.start === b.start && a.end === b.end

function safeRange(raw: string): Range | null {
  try {
    const value = JSON.parse(raw)
    return typeof value?.start === "number" && typeof value?.end === "number"
      ? { start: value.start, end: value.end }
      : null
  } catch {
    return null
  }
}

const draftBodyKey = (scope: string, range: Range): string => `suikou-draft:${scope}:${range.start}-${range.end}`

/** Whether a persisted composer draft for this anchor holds unsent text. */
function hasDraftBody(scope: string, range: Range): boolean {
  try {
    const value = JSON.parse(localStorage.getItem(draftBodyKey(scope, range)) || "{}")
    return typeof value?.body === "string" && value.body.trim().length > 0
  } catch {
    return false
  }
}

const elDraftKey = (scope: string, selector: string): string => `suikou-eldraft:${scope}:${selector}`

/** Whether a persisted html element composer draft holds unsent text. */
function hasElDraftBody(scope: string, selector: string): boolean {
  try {
    const value = JSON.parse(localStorage.getItem(elDraftKey(scope, selector)) || "{}")
    return typeof value?.body === "string" && value.body.trim().length > 0
  } catch {
    return false
  }
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
const inlineThreadCollapsedKey = (commentId: string): string => `suikou-thread-collapsed:${commentId}`
const sideRailExpandedKey = (scope: string): string => `suikou-side-group:${scope}`

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
        commentDisplay={commentDisplay}
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
        />
        {commentDisplay === "side" && (
          <SideRail
            comments={comments}
            commentsProxy={commentsProxy}
            storageKey={selected ? sideRailExpandedKey(`${reviewId}:${selected.path}`) : null}
            onHoverRange={setHoveredRange}
            onClearFocus={() => setFocusedCommentId(null)}
            onFocus={(comment) => setFocusedCommentId(comment.id)}
          />
        )}
      </div>
      <StatusBar
        path={selectedPath}
        connected={connected}
        blockers={review.blockers.length}
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

type RoundSummary = { number: number; comment_count: number; unresolved_count: number }

function Toolbar({
  name,
  isDiff,
  connected,
  commentDisplay,
  store,
  review,
  roundSummaries,
  selectedRound,
  latestRound,
  canCompare,
  compareOpen,
  onToggleCompare,
}: {
  name: string
  isDiff: boolean
  connected: boolean
  commentDisplay: CommentDisplayMode
  store: ReviewStore
  review: ReviewSummary
  roundSummaries: RoundSummary[]
  selectedRound: number
  latestRound: number
  canCompare: boolean
  compareOpen: boolean
  onToggleCompare: () => void
}) {
  return (
    <div className="flex h-[50px] shrink-0 items-center gap-[9px] border-b border-hair-strong bg-surface px-3">
      <a
        href="/"
        className="inline-flex h-[30px] items-center gap-1.5 rounded-ctrl px-2 hover:bg-soft"
        title={connected ? "Back to projects" : "Reconnecting…"}
      >
        <span
          className={`grid size-6 place-items-center rounded-[7px] bg-accent text-[13px] font-black text-on-accent ${
            connected ? "" : "animate-pulse"
          }`}
        >
          S
        </span>
      </a>
      <div className="inline-flex h-[30px] min-w-0 items-center gap-2 px-1">
        <span className="truncate text-[13px] font-semibold tracking-[-0.015em] text-ink">{name}</span>
        {isDiff && (
          <span className="ml-1 inline-flex h-[19px] shrink-0 items-center gap-1 rounded-full bg-accent-soft pr-2 pl-1.5 text-[11px] font-semibold text-accent-bright">
            <GitCompare size={12} aria-hidden />
            Diff
          </span>
        )}
      </div>
      <span className="flex-1" />
      <span className="hidden sm:inline-flex">
        <ReviewButton review={review} />
      </span>
      {canCompare && (
        <button
          type="button"
          onClick={onToggleCompare}
          title="Compare with the previous round"
          className={`hidden h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-ctrl border px-2.5 text-[12.5px] font-medium sm:inline-flex ${
            compareOpen
              ? "border-accent-edge bg-accent-soft text-accent-bright"
              : "border-hair-strong bg-canvas text-ink hover:bg-soft"
          }`}
        >
          <GitCompareArrows size={14} className={compareOpen ? "text-accent-bright" : "text-muted"} aria-hidden />
          Compare
        </button>
      )}
      {roundSummaries.length > 0 && (
        <RoundSelector
          store={store}
          rounds={roundSummaries}
          selectedRound={selectedRound}
          latestRound={latestRound}
        />
      )}
      <DisplayButton value={commentDisplay} />
      <button
        onClick={() => uiStore.setSettingsOpen(true)}
        className="grid size-[30px] shrink-0 place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
        title="Settings"
      >
        <SlidersHorizontal size={16} aria-hidden />
      </button>
      <SubmitButton store={store} review={review} />
    </div>
  )
}

function DisplayButton({ value }: { value: CommentDisplayMode }) {
  return (
    <span className="hidden sm:inline-flex">
      <Popover
        align="end"
        className="w-[214px] p-2"
        render={
          <button
            type="button"
            title="Display options"
            className="grid size-[30px] shrink-0 place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
          >
            <MessageSquare size={15} aria-hidden />
          </button>
        }
      >
        <div className="px-1 pt-1 pb-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
          Comments
        </div>
        <Segmented<CommentDisplayMode>
          value={value}
          onChange={(next) => uiStore.setCommentDisplay(next)}
          options={[
            ["inline", "Inline"],
            ["side", "Side"],
            ["hidden", "Hidden"],
          ]}
        />
      </Popover>
    </span>
  )
}

/** A4/A5/A6: the round selector. Shows the selected round and switches rounds via
 * select_round; picking a past round makes the workspace read-only. */
function RoundSelector({
  store,
  rounds,
  selectedRound,
  latestRound,
}: {
  store: ReviewStore
  rounds: RoundSummary[]
  selectedRound: number
  latestRound: number
}) {
  const select = useMusubiCommand(store, "select_round")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title={`Round ${selectedRound}${selectedRound < latestRound ? " (read-only)" : ""}`}
            className="inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-ctrl border border-hair-strong bg-canvas px-2 text-[12.5px] font-medium text-ink hover:bg-soft sm:px-2.5"
          >
            <GitCompare size={14} className="text-muted" aria-hidden />
            <span className="hidden sm:inline">Round </span>
            <span className="sm:hidden">R</span>
            {selectedRound}
            {selectedRound < latestRound && (
              <span className="hidden text-[11px] font-semibold text-muted sm:inline">· read-only</span>
            )}
            <ChevronDown size={12} className="text-faint" aria-hidden />
          </button>
        }
      />
      <DropdownMenuContent align="end">
        {[...rounds]
          .sort((a, b) => b.number - a.number)
          .map((round) => (
            <DropdownMenuItem key={round.number} onClick={() => void select.dispatch({ number: round.number })}>
              <span className={`flex-1 font-medium ${round.number === selectedRound ? "text-accent-bright" : "text-ink"}`}>
                Round {round.number}
                {round.number === latestRound && <span className="ml-1.5 text-[11px] font-normal text-muted">latest</span>}
              </span>
              {round.unresolved_count > 0 && (
                <span className="text-[11px] font-semibold text-request tabular-nums">{round.unresolved_count} open</span>
              )}
              {round.number === selectedRound && <Check size={13} className="ml-1.5 text-approve" aria-hidden />}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const SUBMIT_ROWS: { verdict: Verdict; hint: string }[] = [
  { verdict: "comment", hint: "no verdict" },
  { verdict: "approve", hint: "all files" },
  { verdict: "request_changes", hint: "" },
]

/** G3 submit panel + G4 soft gate + G5 confirm. `submit_review` carries no
 * verdict — the file verdicts are the source of truth — so the radio is a local
 * choice the reviewer confirms before publishing, defaulting to the current
 * rollup (or Comment when nothing is set). On desktop it's a toolbar popover; on
 * mobile a bottom sheet (there's no right rail to host the overview, so the sheet
 * also lists the open blockers). */
function SubmitButton({ store, review }: { store: ReviewStore; review: ReviewSummary }) {
  const submit = useMusubiCommand(store, "submit_review")
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [chosen, setChosen] = useState<Verdict>("comment")

  const openPanel = (set: (open: boolean) => void) => (open: boolean) => {
    if (open) setChosen(review.verdict ?? "comment")
    set(open)
  }

  const run = () => {
    void submit.dispatch({}).finally(() => {
      setConfirm(false)
      setPopoverOpen(false)
      setSheetOpen(false)
    })
  }

  return (
    <>
      <div className="hidden lg:block">
        <Popover
          open={popoverOpen}
          onOpenChange={openPanel(setPopoverOpen)}
          className="w-[290px] p-[7px]"
          render={
            <button type="button" className={SUBMIT_BTN}>
              <Upload size={14} aria-hidden />
              Submit
              <ChevronDown size={12} className="opacity-80" aria-hidden />
            </button>
          }
        >
          <SubmitPanel
            review={review}
            heading
            chosen={chosen}
            onChoose={setChosen}
            submitting={submit.isPending}
            onSubmit={() => setConfirm(true)}
          />
        </Popover>
      </div>
      <button
        type="button"
        onClick={() => openPanel(setSheetOpen)(true)}
        className={`lg:hidden ${SUBMIT_BTN}`}
      >
        <Upload size={14} aria-hidden />
        Submit
        <ChevronDown size={12} className="opacity-80" aria-hidden />
      </button>
      <Dialog
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        className="max-h-[86vh] sm:max-w-[360px]"
      >
        <div className="flex items-center gap-2 border-b border-hair px-4 py-3">
          <Upload size={16} className="text-muted" aria-hidden />
          <DialogTitle className="text-[14px] font-bold text-ink">Finish review</DialogTitle>
        </div>
        <div className="flex min-h-0 flex-col gap-2 overflow-auto p-2">
          <SubmitPanel
            review={review}
            chosen={chosen}
            onChoose={setChosen}
            submitting={submit.isPending}
            onSubmit={() => setConfirm(true)}
          />
          {review.blockers.length > 0 && (
            <div className="px-1">
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-faint">Open blockers</p>
              <BlockerList blockers={review.blockers} />
            </div>
          )}
        </div>
      </Dialog>
      <SubmitConfirm
        open={confirm}
        review={review}
        verdict={chosen}
        pending={submit.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={run}
      />
    </>
  )
}

const SUBMIT_BTN =
  "inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-ctrl bg-accent px-3 text-[12.5px] font-semibold text-on-accent hover:brightness-[1.06] active:translate-y-px"

function SubmitPanel({
  review,
  heading = false,
  chosen,
  onChoose,
  submitting,
  onSubmit,
}: {
  review: ReviewSummary
  heading?: boolean
  chosen: Verdict
  onChoose: (verdict: Verdict) => void
  submitting: boolean
  onSubmit: () => void
}) {
  const softGate = chosen === "approve" && review.blockers.length > 0
  // Approving can finalize a clean review at any time; Comment / Request changes
  // only make sense with something unpublished to carry (a comment, reply, or
  // draft verdict).
  const hasContent = review.hasUnpublished || review.pendingComments > 0 || review.draftVerdicts > 0
  const canSubmit = chosen === "approve" || hasContent
  return (
    <>
      {heading && (
        <div className="px-[9px] pt-2 pb-[7px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
          Finish review
        </div>
      )}
      <div className="flex flex-col">
        {SUBMIT_ROWS.map(({ verdict, hint }) => {
          const on = chosen === verdict
          return (
            <button
              key={verdict}
              type="button"
              onClick={() => onChoose(verdict)}
              className={`flex items-center gap-2.5 rounded-ctrl px-[9px] py-2 text-left text-[13px] ${on ? "bg-soft" : "hover:bg-soft/60"}`}
            >
              <VerdictRadio verdict={verdict} on={on} />
              <span className={`font-medium ${on ? verdictText(verdict) : "text-ink"}`}>
                {VERDICT_META[verdict].label}
              </span>
              {hint && <span className="ml-auto text-[11px] text-faint">{hint}</span>}
            </button>
          )
        })}
      </div>
      <div className="my-1.5 h-px bg-hair-strong" />
      <div className="flex flex-col gap-1.5 px-[9px] py-1 text-[12px] text-text">
        <SummaryRow icon={MessageSquare} n={review.pendingComments} label="pending comments" />
        <SummaryRow icon={FileText} n={review.draftVerdicts} label="draft verdicts" />
      </div>
      {softGate && (
        <div className="mx-1 mt-1.5 mb-[9px] flex items-start gap-2 rounded-ctrl border border-amber-edge bg-amber-soft px-[11px] py-2.5 text-[11.5px] leading-[1.45] text-amber-deep">
          <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden />
          <span>
            <b className="font-bold">{review.blockers.length} open fix_required.</b> Approving anyway is
            allowed, you have the final call.
          </span>
        </div>
      )}
      <div className="flex flex-col gap-1.5 px-1 pt-1 pb-1">
        <button
          type="button"
          disabled={!canSubmit || submitting}
          onClick={onSubmit}
          className="inline-flex h-[35px] items-center justify-center rounded-ctrl bg-accent text-[13px] font-semibold text-on-accent hover:brightness-[1.06] disabled:opacity-50"
        >
          {canSubmit ? "Submit review" : "Nothing to submit"}
        </button>
      </div>
    </>
  )
}

/** The open-blocker rows, shared by the inspector overview (desktop) and the
 * submit sheet (mobile). */
function BlockerList({ blockers }: { blockers: Blocker[] }) {
  return (
    <div className="flex flex-col gap-1">
      {blockers.map((b, i) => (
        <div
          key={`${b.path}:${b.line}:${i}`}
          className="flex items-center gap-2 rounded-[7px] border border-request-edge bg-request-soft px-2.5 py-1.5"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-request shadow-[0_0_6px_var(--request)]" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink">
            {b.path.slice(b.path.lastIndexOf("/") + 1)}
          </span>
          {b.line !== null && <span className="shrink-0 font-mono text-[11px] text-muted">line {b.line}</span>}
        </div>
      ))}
    </div>
  )
}

function VerdictRadio({ verdict, on }: { verdict: Verdict; on: boolean }) {
  const ring = verdict === "request_changes" ? "border-request" : verdict === "approve" ? "border-approve" : "border-accent"
  const dot = verdict === "request_changes" ? "bg-request" : verdict === "approve" ? "bg-approve" : "bg-accent"
  return (
    <span
      className={`grid size-4 shrink-0 place-items-center rounded-full border-[1.5px] ${on ? ring : "border-hair-strong"}`}
    >
      {on && <span className={`size-2 rounded-full ${dot}`} />}
    </span>
  )
}

function SummaryRow({ icon: Icon, n, label }: { icon: typeof MessageSquare; n: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={13} className="text-muted" aria-hidden />
      <span>
        <b className="font-bold text-ink tabular-nums">{n}</b> {label}
      </span>
    </div>
  )
}

function verdictText(verdict: Verdict): string {
  return verdict === "request_changes" ? "text-request" : verdict === "approve" ? "text-approve" : "text-accent-bright"
}

/** G5: the submit confirmation dialog, spelling out exactly what publishing
 * this round will do. */
function SubmitConfirm({
  open,
  review,
  verdict,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean
  review: ReviewSummary
  verdict: Verdict
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onClose={onCancel} className="gap-3 p-5 sm:max-w-[380px]">
      <div className="flex items-center gap-2.5">
        <span className={`grid size-[30px] shrink-0 place-items-center rounded-[9px] ${verdictSoft(verdict)}`}>
          <Upload size={16} className={verdictText(verdict)} aria-hidden />
        </span>
        <DialogTitle className="text-[13.5px] font-bold text-ink">
          Submit this review as <span className={verdictText(verdict)}>{VERDICT_META[verdict].label}</span>?
        </DialogTitle>
      </div>
      <div className="flex flex-col gap-2 text-[12px] text-text">
        <ConfirmLine icon={MessageSquare}>
          Publishes <b className="font-bold text-ink">{review.pendingComments}</b> pending comments across all files
        </ConfirmLine>
        <ConfirmLine icon={FileText}>
          Records <b className="font-bold text-ink">{review.draftVerdicts}</b> draft file verdicts
        </ConfirmLine>
        {review.blockers.length > 0 && (
          <ConfirmLine icon={AlertTriangle}>
            <b className="font-bold text-ink">{review.blockers.length} open fix_required</b> stays open for the agent
          </ConfirmLine>
        )}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <span className="flex-1" />
        <button
          onClick={onCancel}
          className="inline-flex h-[32px] items-center rounded-ctrl px-3 text-[13px] font-medium text-muted hover:bg-soft"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={pending}
          className="inline-flex h-[32px] items-center rounded-ctrl bg-accent px-4 text-[13px] font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
        >
          Submit review
        </button>
      </div>
    </Dialog>
  )
}

function ConfirmLine({ icon: Icon, children }: { icon: typeof MessageSquare; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} className="mt-px shrink-0 text-muted" aria-hidden />
      <span className="leading-[1.45]">{children}</span>
    </div>
  )
}

function verdictSoft(verdict: Verdict): string {
  return verdict === "request_changes"
    ? "bg-request-soft"
    : verdict === "approve"
      ? "bg-approve-soft"
      : "bg-accent-soft"
}

const VERDICT_CHIP: Record<
  Verdict,
  { icon: typeof Check; className: string }
> = {
  approve: { icon: Check, className: "bg-approve-soft text-approve shadow-[inset_0_0_0_0.5px_var(--approve-edge)]" },
  request_changes: { icon: X, className: "bg-request-soft text-request shadow-[inset_0_0_0_0.5px_var(--request-edge)]" },
  comment: { icon: MessageSquare, className: "bg-soft text-text shadow-[inset_0_0_0_0.5px_var(--hair-strong)]" },
}

/** G1 per-file verdict chip + G6 dismiss approval. Shows the file's effective
 * verdict (unsent draft if any, else the last published one; an amber dot marks
 * an unsubmitted draft) and opens a panel to pick one. Verdicts carry no text —
 * file-level discussion is a separate artifact comment (see ArtifactComments).
 * An approved file can have its approval dismissed to reopen it. */
function VerdictChip({ file, proxy }: { file: PerFile; proxy: FileStoreProxy }) {
  const setVerdict = useMusubiCommand(proxy, "set_draft_verdict")
  const dismiss = useMusubiCommand(proxy, "dismiss_approval")
  const [open, setOpen] = useState(false)
  const effective = file.draftVerdict ?? file.latestVerdict
  const chip = effective ? VERDICT_CHIP[effective] : null
  const Icon = chip?.icon ?? Circle

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      className="w-[220px] p-2"
      render={
        <button
          type="button"
          title={`Per-file verdict${effective ? `: ${VERDICT_META[effective].label}` : ""}`}
          className={`inline-flex h-[25px] shrink-0 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-semibold sm:px-2.5 ${
            chip ? chip.className : "border border-dashed border-hair-strong bg-soft/50 text-muted"
          }`}
        >
          <Icon size={13} aria-hidden />
          <span className="hidden sm:inline">{effective ? VERDICT_META[effective].label : "No verdict"}</span>
          {file.draftVerdict !== null && (
            <span className="size-1.5 rounded-full bg-amber" title="Unsubmitted draft" aria-hidden />
          )}
          <ChevronDown size={11} className="opacity-70" aria-hidden />
        </button>
      }
    >
      <div className="px-1 pt-1 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
        File verdict
      </div>
      <div className="flex flex-col">
        {(["approve", "request_changes", "comment"] as Verdict[]).map((v) => {
          const meta = VERDICT_CHIP[v]
          const on = effective === v
          return (
            <button
              key={v}
              type="button"
              onClick={() => void setVerdict.dispatch({ verdict: v })}
              className={`flex items-center gap-2.5 rounded-ctrl px-2 py-1.5 text-left text-[13px] ${on ? "bg-soft" : "hover:bg-soft/60"}`}
            >
              <meta.icon size={14} className={verdictText(v)} aria-hidden />
              <span className={`font-medium ${on ? verdictText(v) : "text-ink"}`}>{VERDICT_META[v].label}</span>
              {on && <Check size={13} className="ml-auto text-approve" aria-hidden />}
            </button>
          )
        })}
      </div>
      {file.approved && (
        <>
          <div className="my-1.5 h-px bg-hair-strong" />
          <button
            type="button"
            onClick={() => void dismiss.dispatch({})}
            className="flex w-full items-center gap-2 rounded-ctrl px-2 py-1.5 text-left text-[12.5px] text-text hover:bg-soft"
          >
            <RotateCcw size={13} className="text-muted" aria-hidden />
            Dismiss approval
          </button>
        </>
      )}
    </Popover>
  )
}

/** E2 artifact-scope comments: file-level discussion not tied to a line, shown
 * as a band above the content. Independent of the verdict — a file can carry any
 * number of these. Reuses the Thread + Composer used by line comments. */
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
        <Thread key={comment.id} comment={comment} commentsProxy={commentsProxy} className="my-1.5" />
      ))}
      {composing && (
        <div ref={composerRef}>
          <Composer
            anchorLabel="whole file"
            draftKey={artifactDraftKey(draftScope)}
            pending={addComment.isPending}
            className="my-1.5"
            onSubmit={submit}
            onCancel={onClose}
          />
        </div>
      )}
    </div>
  )
}

const STATUS_META: Record<
  NonNullable<FileEntry["change_status"]>,
  { letter: string; className: string; title: string }
> = {
  added: { letter: "A", className: "text-approve", title: "Added" },
  modified: { letter: "M", className: "text-amber", title: "Modified" },
  deleted: { letter: "D", className: "text-request", title: "Deleted" },
  renamed: { letter: "R", className: "text-muted", title: "Renamed" },
  copied: { letter: "C", className: "text-muted", title: "Copied" },
  type_changed: { letter: "T", className: "text-muted", title: "Type changed" },
}

function NavHeader({ entries, reviewed }: { entries: FileEntry[]; reviewed: number }) {
  return (
    <div className="flex items-center gap-[7px] px-3 pb-2">
      <FileText size={15} className="text-muted" aria-hidden />
      <h3 className="text-[12px] font-bold tracking-[-0.01em] text-ink">Files</h3>
      <span className="flex-1" />
      <span className="text-[11px] font-semibold text-muted tabular-nums">
        {reviewed}/{entries.length}
      </span>
    </div>
  )
}

type TreeNode =
  | { kind: "dir"; name: string; path: string; children: TreeNode[] }
  | { kind: "file"; name: string; path: string; entry: FileEntry }

// Fold the flat file list into a directory tree; intermediate path segments
// become collapsible folders, the leaf keeps its FileEntry. Dirs sort before
// files, each level alphabetical.
function buildTree(entries: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = []
  const dirs = new Map<string, Extract<TreeNode, { kind: "dir" }>>()
  for (const entry of entries) {
    const segs = entry.path.split("/")
    let level = root
    let prefix = ""
    for (let i = 0; i < segs.length - 1; i += 1) {
      prefix = prefix ? `${prefix}/${segs[i]}` : segs[i]
      let dir = dirs.get(prefix)
      if (!dir) {
        dir = { kind: "dir", name: segs[i], path: prefix, children: [] }
        dirs.set(prefix, dir)
        level.push(dir)
      }
      level = dir.children
    }
    level.push({ kind: "file", name: segs[segs.length - 1], path: entry.path, entry })
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1))
    for (const node of nodes) if (node.kind === "dir") sort(node.children)
  }
  sort(root)
  return root
}

function FileList({
  entries,
  isDiff,
  selectedPath,
  onSelect,
  status,
}: {
  entries: FileEntry[]
  isDiff: boolean
  selectedPath: string | null
  onSelect: (path: string) => void
  status: Map<string, PerFile>
}) {
  const [query, setQuery] = useState("")
  const [closedDirs, setClosedDirs] = useState<Set<string>>(new Set())
  const needle = query.trim().toLowerCase()
  const shown = needle ? entries.filter((e) => e.path.toLowerCase().includes(needle)) : entries
  const tree = useMemo(() => buildTree(shown), [shown])

  const toggleDir = (path: string) =>
    setClosedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  return (
    <>
      <div className="mx-[10px] mb-[9px] flex h-[28px] shrink-0 items-center gap-[7px] rounded-ctrl bg-canvas px-2.5 shadow-[inset_0_0_0_0.5px_var(--hair-strong)]">
        <Search size={13} className="shrink-0 text-faint" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter files…"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-faint focus:outline-none"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-1.5 pb-2">
        <TreeNodes
          nodes={tree}
          depth={0}
          isDiff={isDiff}
          selectedPath={selectedPath}
          onSelect={onSelect}
          status={status}
          // While filtering, ignore collapse state so every match is visible.
          closedDirs={needle ? EMPTY_SET : closedDirs}
          onToggleDir={toggleDir}
        />
        {shown.length === 0 && <p className="px-3 py-4 text-center text-[12px] text-faint">No files match.</p>}
      </div>
    </>
  )
}

const EMPTY_SET: Set<string> = new Set()

function TreeNodes({
  nodes,
  depth,
  isDiff,
  selectedPath,
  onSelect,
  status,
  closedDirs,
  onToggleDir,
}: {
  nodes: TreeNode[]
  depth: number
  isDiff: boolean
  selectedPath: string | null
  onSelect: (path: string) => void
  status: Map<string, PerFile>
  closedDirs: Set<string>
  onToggleDir: (path: string) => void
}) {
  return (
    <>
      {nodes.map((node) =>
        node.kind === "dir" ? (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => onToggleDir(node.path)}
              style={{ paddingLeft: 9 + depth * 12 }}
              className="flex h-[27px] w-full items-center gap-1.5 rounded-ctrl pr-2 text-left text-[12.5px] text-text hover:bg-soft"
            >
              <ChevronRight
                size={13}
                className={`shrink-0 text-faint transition-transform ${closedDirs.has(node.path) ? "" : "rotate-90"}`}
                aria-hidden
              />
              <Folder size={14} className="shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
            </button>
            {!closedDirs.has(node.path) && (
              <TreeNodes
                nodes={node.children}
                depth={depth + 1}
                isDiff={isDiff}
                selectedPath={selectedPath}
                onSelect={onSelect}
                status={status}
                closedDirs={closedDirs}
                onToggleDir={onToggleDir}
              />
            )}
          </div>
        ) : (
          <FileRow
            key={node.path}
            entry={node.entry}
            depth={depth}
            isDiff={isDiff}
            selected={node.path === selectedPath}
            onSelect={onSelect}
            live={status.get(node.path)}
          />
        ),
      )}
    </>
  )
}

function FileRow({
  entry,
  depth,
  isDiff,
  selected,
  onSelect,
  live,
}: {
  entry: FileEntry
  depth: number
  isDiff: boolean
  selected: boolean
  onSelect: (path: string) => void
  live: PerFile | undefined
}) {
  const name = entry.path.slice(entry.path.lastIndexOf("/") + 1)
  const status = entry.change_status ? STATUS_META[entry.change_status] : null
  // Prefer the live view (draft verdict, streamed blockers) so the row's ✓ and
  // blocker badge update immediately, falling back to the static entry.
  const blockers = live?.openBlockers ?? 0
  const verdict = (live ? (live.draftVerdict ?? live.latestVerdict) : entry.verdict) as Verdict | null
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.path)}
      aria-current={selected ? "true" : undefined}
      style={{ paddingLeft: 9 + depth * 12 }}
      className={`flex h-[31px] w-full shrink-0 items-center gap-2 rounded-ctrl pr-2 text-left text-[12.5px] ${
        selected
          ? "bg-accent-soft font-semibold text-accent-bright shadow-[inset_0_0_0_1px_var(--accent-edge)]"
          : "text-text hover:bg-soft"
      }`}
    >
      <span className={`w-[10px] shrink-0 text-center font-mono text-[10.5px] font-bold ${status?.className ?? "text-faint"}`} title={status?.title}>
        {status?.letter ?? ""}
      </span>
      <FileIcon name={name} size={13} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {isDiff && (entry.added !== null || entry.deleted !== null) && (
        <span className="shrink-0 font-mono text-[10.5px] tabular-nums">
          <span className="text-approve">+{entry.added ?? 0}</span>{" "}
          <span className="text-request">−{entry.deleted ?? 0}</span>
        </span>
      )}
      {blockers > 0 ? (
        <span
          title={`${blockers} open blocker${blockers > 1 ? "s" : ""}`}
          className="grid h-4 min-w-[17px] shrink-0 place-items-center rounded-full bg-request-soft px-1 text-[10px] font-bold tabular-nums text-request shadow-[inset_0_0_0_0.5px_var(--request-edge)]"
        >
          {blockers}
        </span>
      ) : verdict === "approve" ? (
        <Check size={13} className="shrink-0 text-approve" aria-label="Approved" />
      ) : verdict === "request_changes" ? (
        <X size={13} className="shrink-0 text-request" aria-label="Request changes" />
      ) : verdict === "comment" ? (
        <MessageSquare size={12} className="shrink-0 text-muted" aria-label="Comment" />
      ) : null}
    </button>
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
}: {
  reviewId: string
  entry: FileEntry | null
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
        <button
          type="button"
          onClick={onOpenFiles}
          className="grid size-[30px] shrink-0 place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink lg:hidden"
          title="Files"
          aria-label="Open file list"
        >
          <PanelLeft size={17} aria-hidden />
        </button>
        {entry ? (
          <>
            <FileIcon name={name} size={14} />
            <span className="truncate font-mono text-[12.5px] text-ink">
              <span className="text-faint">{dir}</span>
              {name}
            </span>
          </>
        ) : (
          <span className="text-[12.5px] text-faint">No file selected</span>
        )}
        <span className="flex-1" />
        {previewable && content.kind === "text" && (
          <Segmented<"source" | "preview">
            value={view}
            onChange={chooseView}
            options={[
              ["source", "Source"],
              ["preview", "Preview"],
            ]}
          />
        )}
        {htmlFile && content.kind === "text" && (
          <>
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
        {!readOnly && entry && fileProxy && content.kind !== "loading" && content.kind !== "error" && (
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
        {!readOnly && entry && fileProxy && verdict && commentDisplay !== "side" && (
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
            <div className="grid flex-1 place-items-center text-[13px] text-faint">Select a file to review.</div>
          ) : content.kind === "loading" ? (
            <div className="grid flex-1 place-items-center text-[13px] text-faint">Loading…</div>
          ) : content.kind === "error" ? (
            <div className="grid flex-1 place-items-center text-[13px] text-request">{content.message}</div>
          ) : content.kind === "image" ? (
            <ImageView name={name} url={content.url} mime={content.mime} bytes={content.bytes} />
          ) : content.kind === "binary" ? (
            <BinaryNotice name={name} mime={content.mime} bytes={content.bytes} />
          ) : content.lines.length === 1 && content.lines[0] === "" ? (
            <FileNotice
              icon={File}
              title="This file is empty"
              body="There's nothing to show or comment on in this file yet."
              meta={name}
            />
          ) : previewable && view === "preview" ? (
            <MarkdownPreview
              source={content.lines.join("\n")}
              comments={comments}
              fileProxy={fileProxy}
              commentsProxy={commentsProxy}
              draftScope={`${reviewId}:${entry.path}`}
              readOnly={readOnly}
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
const MarkdownPreview = observer(function MarkdownPreview({
  source,
  comments,
  fileProxy,
  commentsProxy,
  draftScope,
  readOnly = false,
  showThreads = true,
  focusedCommentId = null,
  highlightedRange = null,
  onFocusComment,
}: {
  source: string
  comments: Comment[]
  fileProxy: FileStoreProxy | null
  commentsProxy: CommentsStoreProxy | null
  draftScope: string
  readOnly?: boolean
  showThreads?: boolean
  focusedCommentId?: string | null
  highlightedRange?: HighlightRange
  onFocusComment?: (commentId: string | null) => void
}) {
  const blocks = useMemo(() => renderMarkdownBlocks(source), [source])
  // Match the source view's gutter: a narrow left column sized to the digit
  // count, right-aligned numbers, and the rest of the width for the prose.
  const gutter = String(blocks.length ? blocks[blocks.length - 1].endLine : 1).length
  const addComment = useMusubiCommand(fileProxy as FileStoreProxy, "add_comment")

  // Bucket each located comment to the block it belongs to: the block whose
  // source range contains the anchor's start line, else the last block that
  // begins at or before it (a comment can predate a re-rendered doc's blocks).
  const threadsByBlock = useMemo(() => {
    const map = new Map<number, Comment[]>()
    for (const comment of comments) {
      if (comment.scope !== "located" || comment.anchor?.type !== "line_range") continue
      const start = comment.anchor.start_line
      let idx = blocks.findIndex((block) => start >= block.line && start <= block.endLine)
      if (idx === -1) {
        idx = 0
        for (let i = 0; i < blocks.length; i++) if (blocks[i].line <= start) idx = i
      }
      const bucket = map.get(idx)
      if (bucket) bucket.push(comment)
      else map.set(idx, [comment])
    }
    return map
  }, [comments, blocks])

  const [draft, setDraft] = useState<Range | null>(null)
  const [switchTo, setSwitchTo] = useState<Range | null>(null)
  // A live gutter drag, in block indices; on release it commits to a line range.
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null)
  const draftRef = useRef<Range | null>(draft)
  draftRef.current = draft
  const dragRef = useRef(drag)
  dragRef.current = drag

  // The open composer's anchor persists under `openKey` (shared with Source, so
  // the same file's composer carries across the Source/Preview toggle) and its
  // body under the composer's own draft key, so a reload reopens it.
  const openKey = `suikou-composer:${draftScope}`
  const open = (range: Range) => {
    setDraft(range)
    localStorage.setItem(openKey, JSON.stringify(range))
  }
  const close = () => {
    const current = draftRef.current
    if (current) localStorage.removeItem(draftBodyKey(draftScope, current))
    localStorage.removeItem(openKey)
    setDraft(null)
  }
  // Opening a block with a dirty composer already open elsewhere confirms first.
  const requestOpen = (range: Range) => {
    if (readOnly) return
    const current = draftRef.current
    if (current && !sameRange(current, range) && hasDraftBody(draftScope, current)) setSwitchTo(range)
    else open(range)
  }

  // Reopen a composer left with unsaved text across a reload or a Source/Preview
  // toggle: reopen only when the persisted anchor still holds body AND still maps
  // to a block in this document. If the file changed so the anchor is out of range
  // or unlocatable, discard the cached draft outright rather than let it linger
  // invisibly and block new comments behind a spurious discard confirm. Re-runs
  // per file; a stale or bare anchor is dropped.
  useEffect(() => {
    const raw = localStorage.getItem(openKey)
    const stored = raw ? safeRange(raw) : null
    const locatable =
      stored !== null && blocks.some((block) => block.endLine === stored.end && block.line >= stored.start)
    const restored = stored && locatable && hasDraftBody(draftScope, stored) ? stored : null
    if (!restored) {
      localStorage.removeItem(openKey)
      if (stored) localStorage.removeItem(draftBodyKey(draftScope, stored))
    }
    setDraft(restored)
    if (restored) {
      requestAnimationFrame(() =>
        document.querySelector(`[data-review-line="${restored.start}"]`)?.scrollIntoView({ block: "center" }),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey])
  const submitNew = (body: string, type: CritiqueType) => {
    if (!fileProxy || !draft) return
    addComment
      .dispatch({
        scope: "located",
        critique_type: type,
        body,
        anchor: { type: "line_range", start_line: draft.start, end_line: draft.end },
      })
      .catch(() => undefined)
    close()
  }

  // Drag across block gutters to select a multi-block range, hit-testing the
  // block under the pointer (works for mouse and touch alike). On release the
  // span from the first to the last block's source lines becomes the anchor.
  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    const blockAt = (x: number, y: number): number | null => {
      const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest("[data-review-block]")
      const value = el?.getAttribute("data-review-block")
      return value ? Number(value) : null
    }
    const move = (event: PointerEvent) => {
      const idx = blockAt(event.clientX, event.clientY)
      if (idx != null) setDrag((d) => (d && d.to !== idx ? { ...d, to: idx } : d))
    }
    const up = () => {
      const d = dragRef.current
      setDrag(null)
      if (d) {
        const lo = Math.min(d.from, d.to)
        const hi = Math.max(d.from, d.to)
        requestOpen({ start: blocks[lo].line, end: blocks[hi].endLine })
      }
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  const dragLo = drag ? Math.min(drag.from, drag.to) : -1
  const dragHi = drag ? Math.max(drag.from, drag.to) : -1

  return (
    <div className="shrink-0">
      <div className="md-doc py-4">
        {blocks.map((block, index) => {
          const threads = threadsByBlock.get(index)
          // A block is highlighted while it's in the live drag, or (once a range
          // is committed) while it falls within the open composer's line span.
          const inDrag = drag !== null && index >= dragLo && index <= dragHi
          const inDraft = draft !== null && block.line >= draft.start && block.endLine <= draft.end
          const selecting = inDrag || inDraft
          const focused =
            highlightedRange !== null &&
            highlightedRange.start >= block.line &&
            highlightedRange.start <= block.endLine
          // The composer renders once, after the last block of the committed span.
          const composerHere = draft !== null && drag === null && block.endLine === draft.end && block.line >= draft.start
          const label = draft ? `line ${draft.start}${draft.end > draft.start ? `–${draft.end}` : ""}` : ""
          return (
            <Fragment key={index}>
              <div className={`flex ${selecting ? "bg-accent-soft" : "hover:bg-soft/40"}`}>
                <button
                  type="button"
                  data-review-block={index}
                  onPointerDown={(event) => {
                    if (event.shiftKey && draft) {
                      open({ start: Math.min(draft.start, block.line), end: Math.max(draft.end, block.endLine) })
                    } else {
                      setDrag({ from: index, to: index })
                    }
                  }}
                  style={{ minWidth: `${gutter + 2}ch`, touchAction: "none" }}
                  title="Comment on this block — drag or shift-click for a range"
                  className={`group/gut relative flex shrink-0 cursor-pointer select-none flex-col items-end px-3 pt-[0.4em] pb-[0.4em] text-right font-mono text-[10.5px] tabular-nums ${
                    selecting || focused ? "bg-accent-soft font-semibold text-accent-bright" : "text-faint hover:text-accent-bright"
                  }`}
                >
                  <span data-review-line={block.line} className="group-hover/gut:opacity-0">
                    {block.line}
                  </span>
                  {block.endLine > block.line && (
                    <>
                      <span aria-hidden className="my-1 w-px flex-1 bg-hair-strong group-hover/gut:opacity-0" />
                      <span className="group-hover/gut:opacity-0">{block.endLine}</span>
                    </>
                  )}
                  <Plus size={12} aria-hidden className="absolute right-2.5 top-[0.4em] hidden group-hover/gut:block" />
                </button>
                <div
                  className="md-body min-w-0 flex-1 pb-1 pr-4 text-[13.5px] leading-[1.6] text-ink"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: block.html }}
                />
              </div>
              {composerHere && draft && (
                <Composer
                  anchorLabel={label}
                  draftKey={draftBodyKey(draftScope, draft)}
                  pending={addComment.isPending}
                  onSubmit={submitNew}
                  onCancel={close}
                />
              )}
              {showThreads && threads?.map((comment) => (
                <Thread
                  key={comment.id}
                  comment={comment}
                  commentsProxy={commentsProxy}
                  focused={focusedCommentId === comment.id}
                  onFocus={onFocusComment ? () => onFocusComment(focusedCommentId === comment.id ? null : comment.id) : undefined}
                />
              ))}
            </Fragment>
          )
        })}
      </div>
      <ConfirmDialog
        open={switchTo !== null}
        title="Discard unsaved comment?"
        body="You have an unfinished comment open. Starting another one here discards it."
        confirmLabel="Discard"
        onCancel={() => setSwitchTo(null)}
        onConfirm={() => {
          if (draft) localStorage.removeItem(draftBodyKey(draftScope, draft))
          if (switchTo) open(switchTo)
          setSwitchTo(null)
        }}
      />
    </div>
  )
})

/** Clamp an html zoom factor to the 10%–200% range on a 10% grid. */
const clampZoom = (zoom: number): number => Math.min(2, Math.max(0.1, Math.round(zoom * 10) / 10))

type ElRect = { top: number; left: number; right: number; bottom: number; width: number; height: number }
type HtmlOverlay = { kind: "compose"; selector: string; quote: string; rect: ElRect } | { kind: "thread"; selector: string; rect: ElRect }

/** The script injected into the (null-origin) html iframe in Comment mode. Since
 * the sandbox withholds same-origin, the parent cannot read the framed document
 * and — to keep the page's DOM untouched — the annotation layer (hover highlight
 * and dots) lives in the parent, over the iframe. So this script only hit-tests
 * and reports geometry: the hovered element's selector + rect, a click's selector
 * (+ quote), and the rects of the host's anchored selectors, restreamed on scroll
 * so the parent overlay stays pinned. */
function htmlAnchorScript(): string {
  return `
(function () {
  function esc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : s; }
  function selectorFor(el) {
    if (!el || el === document.body || el === document.documentElement) return "body";
    if (el.id) return "#" + esc(el.id);
    var parts = [], node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      if (node.id) { parts.unshift("#" + esc(node.id)); break; }
      var tag = node.tagName.toLowerCase(), parent = node.parentElement;
      if (parent) {
        var same = [];
        for (var i = 0; i < parent.children.length; i++) if (parent.children[i].tagName === node.tagName) same.push(parent.children[i]);
        var idx = same.indexOf(node);
        if (same.length > 1 && idx >= 0) tag += ":nth-of-type(" + (idx + 1) + ")";
      }
      parts.unshift(tag);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }
  function quoteFor(el) { return (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 200); }
  function rectOf(el) { var r = el.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; }
  function elFor(sel) { try { return document.querySelector(sel); } catch (_) { return null; } }

  var anchored = [], tracked = null, hoverSel = null, active = true;
  function postAnchored() {
    var items = [];
    for (var i = 0; i < anchored.length; i++) { var el = elFor(anchored[i]); if (el) items.push({ selector: anchored[i], rect: rectOf(el) }); }
    parent.postMessage({ source: "suikou-html", kind: "rects", items: items }, "*");
  }
  function postHover() {
    var el = hoverSel ? elFor(hoverSel) : null;
    parent.postMessage({ source: "suikou-html", kind: "hover", selector: hoverSel, rect: el ? rectOf(el) : null }, "*");
  }
  function postTracked() {
    if (!tracked) return;
    var el = elFor(tracked);
    if (el) parent.postMessage({ source: "suikou-html", kind: "rect", selector: tracked, rect: rectOf(el) }, "*");
  }
  document.addEventListener("pointermove", function (e) {
    if (!active) return;
    var t = e.target;
    var ok = t && t.nodeType === 1 && t !== document.body && t !== document.documentElement;
    var sel = ok ? selectorFor(t) : null;
    if (sel !== hoverSel) { hoverSel = sel; postHover(); }
  }, true);
  document.addEventListener("pointerleave", function () { if (hoverSel !== null) { hoverSel = null; postHover(); } }, true);
  document.addEventListener("click", function (e) {
    if (!active) return;
    var t = e.target;
    if (!t || t.nodeType !== 1) return;
    e.preventDefault(); e.stopPropagation();
    var sel = selectorFor(t);
    if (anchored.indexOf(sel) !== -1) parent.postMessage({ source: "suikou-html", kind: "open", selector: sel, rect: rectOf(t) }, "*");
    else parent.postMessage({ source: "suikou-html", kind: "pick", selector: sel, quote: quoteFor(t), rect: rectOf(t) }, "*");
  }, true);
  function sync() { postAnchored(); postTracked(); if (hoverSel) postHover(); }
  window.addEventListener("scroll", sync, true);
  window.addEventListener("resize", sync);
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.source !== "suikou-host") return;
    if (d.kind === "anchors") { anchored = d.selectors || []; postAnchored(); }
    if (d.kind === "track") { tracked = d.selector || null; postTracked(); }
    if (d.kind === "mode") { active = !d.interactive; if (!active && hoverSel !== null) { hoverSel = null; postHover(); } }
  });
  parent.postMessage({ source: "suikou-html", kind: "ready" }, "*");
})();
`
}

/** HTML render (D3/D4/D5 + element anchoring): the artifact in a sandboxed
 * iframe. Comment mode injects a bridge script — hovering tints an element,
 * commented elements carry a pulsing dot, and clicking either opens an overlay
 * (a composer for a fresh element, the thread for an anchored one) pinned beside
 * the element in the parent so it escapes the frame's clip and tracks scroll.
 * Only one overlay is open at a time. Interactive mode drops the script and makes
 * the page live. The sandbox withholds same-origin, so the page can't reach us. */
const HtmlView = observer(function HtmlView({
  source,
  mode,
  zoom,
  frameRef,
  comments,
  fileProxy,
  commentsProxy,
  draftScope,
}: {
  source: string
  mode: "comment" | "interactive"
  zoom: number
  frameRef: RefObject<HTMLDivElement | null>
  comments: Comment[]
  fileProxy: FileStoreProxy | null
  commentsProxy: CommentsStoreProxy | null
  draftScope: string
}) {
  const interactive = mode === "interactive"
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const addComment = useMusubiCommand(fileProxy as FileStoreProxy, "add_comment")
  const [overlay, setOverlay] = useState<HtmlOverlay | null>(null)
  const [hover, setHover] = useState<{ selector: string; rect: ElRect } | null>(null)
  const [anchoredRects, setAnchoredRects] = useState<{ selector: string; rect: ElRect }[]>([])
  const elOpenKey = `suikou-elopen:${draftScope}`
  // An element compose left with unsaved text on the last visit, waiting for the
  // frame to report its rect so the composer can reopen where it was. Seeded on
  // mount (this view remounts per file) so it's set before the frame's ready.
  const [pendingRestore, setPendingRestore] = useState<{ selector: string; quote: string } | null>(() => {
    if (interactive) return null
    try {
      const stored = JSON.parse(localStorage.getItem(elOpenKey) || "null")
      if (typeof stored?.selector === "string" && hasElDraftBody(draftScope, stored.selector)) {
        return { selector: stored.selector, quote: typeof stored.quote === "string" ? stored.quote : "" }
      }
    } catch {
      // fall through
    }
    localStorage.removeItem(elOpenKey)
    return null
  })
  const [, setTick] = useState(0)
  const applyOverlay = (next: HtmlOverlay | null) => {
    setOverlay(next)
    if (next?.kind === "compose") localStorage.setItem(elOpenKey, JSON.stringify({ selector: next.selector, quote: next.quote }))
    else localStorage.removeItem(elOpenKey)
  }

  const anchoredSelectors = useMemo(
    () => comments.flatMap((comment) => (comment.anchor?.type === "element" ? [comment.anchor.selector] : [])),
    [comments],
  )
  const openThreads = useMemo(
    () =>
      overlay?.kind === "thread"
        ? comments.filter((c) => c.anchor?.type === "element" && c.anchor.selector === overlay.selector)
        : [],
    [comments, overlay],
  )
  const threadQuote = openThreads[0]?.anchor?.type === "element" ? openThreads[0].anchor.quote : ""

  // The element whose rect the frame should stream: the open overlay's, or the
  // one being restored. A ref lets the ready handler re-request it after reload.
  const trackSel = overlay?.selector ?? pendingRestore?.selector ?? null
  const trackRef = useRef<string | null>(trackSel)
  trackRef.current = trackSel
  const pendingRef = useRef(pendingRestore)
  pendingRef.current = pendingRestore

  // The bridge script rides along in both modes so toggling Comment/Interactive
  // never reloads the iframe (which would lose scroll and form state). The script
  // only reports geometry; a `mode` message flips whether it intercepts.
  const srcDoc = useMemo(() => `${source}\n<script>${htmlAnchorScript()}</scr` + `ipt>`, [source])
  const interactiveRef = useRef(interactive)
  interactiveRef.current = interactive

  const post = (message: object) => iframeRef.current?.contentWindow?.postMessage({ source: "suikou-host", ...message }, "*")

  // Bridge: receive picks / opens / rect updates and the ready signal; keep the
  // frame's dots in sync with the anchored selectors.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      const data = event.data
      if (!data || data.source !== "suikou-html") return
      if (data.kind === "ready") {
        post({ kind: "mode", interactive: interactiveRef.current })
        if (!interactiveRef.current) post({ kind: "anchors", selectors: anchoredSelectors })
        if (trackRef.current) post({ kind: "track", selector: trackRef.current })
      } else if (data.kind === "rects") setAnchoredRects(Array.isArray(data.items) ? data.items : [])
      else if (data.kind === "hover")
        setHover(data.selector && data.rect ? { selector: String(data.selector), rect: data.rect } : null)
      else if (data.kind === "pick" && data.rect)
        applyOverlay({ kind: "compose", selector: String(data.selector), quote: String(data.quote ?? ""), rect: data.rect })
      else if (data.kind === "open" && data.rect) applyOverlay({ kind: "thread", selector: String(data.selector), rect: data.rect })
      else if (data.kind === "rect" && data.rect) {
        const pending = pendingRef.current
        if (pending && pending.selector === data.selector) {
          applyOverlay({ kind: "compose", selector: pending.selector, quote: pending.quote, rect: data.rect })
          setPendingRestore(null)
        } else setOverlay((o) => (o && o.selector === data.selector ? { ...o, rect: data.rect } : o))
      }
    }
    window.addEventListener("message", onMessage)
    post({ kind: "anchors", selectors: anchoredSelectors })
    return () => window.removeEventListener("message", onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchoredSelectors])

  // Track the open (or restoring) element so the frame streams its rect; reposition on resize.
  useEffect(() => {
    post({ kind: "track", selector: trackSel })
    if (!trackSel) return
    const onResize = () => setTick((t) => t + 1)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackSel])

  // Toggle the frame's interception without reloading it. Leaving comment clears
  // the parent annotation; returning re-requests the anchored rects.
  useEffect(() => {
    post({ kind: "mode", interactive })
    if (interactive) {
      setOverlay(null)
      setHover(null)
      setAnchoredRects([])
      setPendingRestore(null)
    } else {
      post({ kind: "anchors", selectors: anchoredSelectors })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive])

  const submit = (body: string, type: CritiqueType) => {
    if (!fileProxy || overlay?.kind !== "compose") return
    addComment
      .dispatch({ scope: "located", critique_type: type, body, anchor: { type: "element", selector: overlay.selector, quote: overlay.quote } })
      .catch(() => undefined)
    applyOverlay(null)
  }

  // Pin the overlay beside the element: the frame's rect plus the element's rect
  // scaled by the zoom, clamped into the viewport.
  const frameRect = frameRef.current?.getBoundingClientRect()
  const overlayPos =
    overlay && frameRect
      ? {
          left: Math.min(Math.max(frameRect.left + overlay.rect.left * zoom, 8), window.innerWidth - 348),
          top: Math.min(frameRect.top + overlay.rect.bottom * zoom + 8, window.innerHeight - 90),
        }
      : null

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-editor p-[14px]">
      <div
        ref={frameRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-[11px] border border-hair-strong bg-white shadow-[0_1px_3px_oklch(50%_0.02_250/0.12)]"
      >
        <span className="absolute right-2 top-2 z-10 inline-flex h-[19px] items-center gap-1 rounded-full bg-[oklch(20%_0.02_235/0.72)] px-2 text-[9.5px] font-bold uppercase tracking-wide text-[oklch(94%_0.01_230)] backdrop-blur-[8px]">
          <Lock size={10} aria-hidden />
          sandboxed iframe{interactive ? " · interactive" : ""}
        </span>
        {hover && !interactive && (
          <span className="pointer-events-none absolute left-2 top-2 z-20 inline-flex h-[19px] max-w-[70%] items-center truncate rounded-full bg-[oklch(20%_0.02_235/0.72)] px-2 font-mono text-[9.5px] font-semibold text-[oklch(94%_0.01_230)] backdrop-blur-[8px]">
            {hover.selector}
          </span>
        )}
        <iframe
          ref={iframeRef}
          title="HTML preview"
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
          className="block border-0 bg-white"
          style={{
            width: `${100 / zoom}%`,
            height: `${100 / zoom}%`,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
          }}
        />
        {!interactive && (
          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            {hover && (
              <div
                className="absolute rounded-[4px] bg-accent-soft ring-1 ring-inset ring-accent-edge"
                style={{
                  left: hover.rect.left * zoom,
                  top: hover.rect.top * zoom,
                  width: hover.rect.width * zoom,
                  height: hover.rect.height * zoom,
                }}
              />
            )}
            {anchoredRects.map(({ selector, rect }) => (
              <button
                key={selector}
                type="button"
                aria-label="Open comment"
                onMouseEnter={() => setHover({ selector, rect })}
                onMouseLeave={() => setHover(null)}
                onClick={() => applyOverlay({ kind: "thread", selector, rect })}
                style={{ left: rect.right * zoom, top: rect.top * zoom }}
                className="group pointer-events-auto absolute grid size-[18px] -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center"
              >
                <span className="relative flex size-[8px] transition-transform duration-100 group-hover:scale-[1.2]">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
                  <span className="relative inline-flex size-[8px] rounded-full bg-accent shadow-[0_0_0_2px_white,0_1px_3px_oklch(0%_0_0/0.3)]" />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {overlay &&
        overlayPos &&
        !interactive &&
        createPortal(
          <div
            style={{ position: "fixed", left: overlayPos.left, top: overlayPos.top, zIndex: 40, width: 340 }}
            className="overflow-hidden rounded-panel border border-hair-strong bg-surface shadow-[0_16px_40px_oklch(0%_0_0/0.32)]"
          >
            <div className="flex items-center gap-2 border-b border-hair px-3 py-2 text-[11px]">
              <span className="truncate font-mono text-accent-bright">{overlay.selector}</span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => applyOverlay(null)}
                className="grid size-[18px] shrink-0 place-items-center rounded text-faint hover:bg-soft hover:text-ink"
                aria-label="Close"
              >
                <X size={13} aria-hidden />
              </button>
            </div>
            {overlay.kind === "compose" ? (
              <div className="p-2.5">
                {overlay.quote && (
                  <div className="mb-2 truncate rounded-md bg-soft px-2.5 py-1.5 font-mono text-[11px] text-muted shadow-[inset_0_0_0_1px_var(--hair-strong)]">
                    “{overlay.quote}”
                  </div>
                )}
                <Composer
                  anchorLabel="this element"
                  draftKey={elDraftKey(draftScope, overlay.selector)}
                  pending={addComment.isPending}
                  chrome={false}
                  onSubmit={submit}
                  onCancel={() => applyOverlay(null)}
                  className="m-0"
                />
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-auto p-2.5">
                {threadQuote && (
                  <div className="mb-2 truncate rounded-md bg-soft px-2.5 py-1.5 font-mono text-[11px] text-muted shadow-[inset_0_0_0_1px_var(--hair-strong)]">
                    “{threadQuote}”
                  </div>
                )}
                {openThreads.map((comment) => (
                  <Thread key={comment.id} comment={comment} commentsProxy={commentsProxy} className="mb-2 last:mb-0" compact />
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
})

/** Image render (D8): the artifact centered on a checkerboard backdrop with a
 * metadata caption. No zoom and no located anchors — an image is commented at
 * the artifact scope only. */
function ImageView({ name, url, mime, bytes }: { name: string; url: string; mime: string; bytes: number | null }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const format = mime.split("/")[1]?.split("+")[0]?.toUpperCase() ?? "IMAGE"
  const meta = [name, dims && `${dims.w}×${dims.h}`, bytes && formatBytes(bytes), format].filter(Boolean).join(" · ")
  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-6 [background:repeating-conic-gradient(var(--bg-2)_0%_25%,var(--bg-1)_0%_50%)_50%/18px_18px]">
      <figure className="max-w-[80%] overflow-hidden rounded-[12px] border border-hair-strong bg-soft shadow-[0_10px_30px_-10px_oklch(0%_0_0/0.28)]">
        <img
          src={url}
          alt={name}
          onLoad={(event) => setDims({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
          className="block h-auto w-full"
        />
        <figcaption className="border-t border-hair-strong bg-control px-3 py-1.5 text-center font-mono text-[11px] text-muted">
          {meta}
        </figcaption>
      </figure>
    </div>
  )
}

/** A centered empty-state for a file with nothing to render: an icon badge, a
 * heading, an explanation, and an optional metadata pill. */
function FileNotice({ icon: Icon, title, body, meta }: { icon: typeof Binary; title: string; body: string; meta?: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[13px] px-8 py-12 text-center">
      <div className="grid size-[54px] place-items-center rounded-[16px] border border-hair-strong bg-soft text-muted shadow-[inset_0_0.5px_0_var(--edge-top-2)]">
        <Icon size={26} aria-hidden />
      </div>
      <h3 className="text-[15px] font-[680] text-ink">{title}</h3>
      <p className="max-w-[40ch] text-[12.5px] leading-[1.5] text-muted">{body}</p>
      {meta && <div className="rounded-full bg-control px-[11px] py-1 font-mono text-[11px] text-faint">{meta}</div>}
    </div>
  )
}

/** Binary render (D9): a file the reviewer can neither read nor anchor a comment
 * to, so the editor states that plainly and shows the file's metadata. */
function BinaryNotice({ name, mime, bytes }: { name: string; mime: string; bytes: number | null }) {
  const meta = [name, bytes && formatBytes(bytes), mime].filter(Boolean).join(" · ")
  return (
    <FileNotice
      icon={Binary}
      title="Cannot render this file"
      body="This is a binary artifact. There is no text or visual representation to show, and no place to anchor a comment."
      meta={meta}
    />
  )
}

/** Human-readable byte size for a file's metadata line (1024-based). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

const MONO_PX: Record<MonoSize, string> = { small: "11.5px", default: "12.5px", large: "14px" }

// Source files with an unknown extension are served as octet-stream, so treat
// that (and svg) as text; only a real media type (image/*, font, pdf, …) is a
// genuine non-text file the source view can't show.
function isTextMime(mime: string): boolean {
  const type = mime.split(";")[0].trim()
  if (type === "" || type === "application/octet-stream" || type === "image/svg+xml") return true
  if (type.startsWith("text/")) return true
  return /^application\/(json|javascript|xml|x-yaml|yaml|toml|x-sh|x-httpd-php|graphql|sql)$/.test(type)
}

const Source = observer(function Source({
  lines,
  tokens,
  comments,
  fileProxy,
  commentsProxy,
  draftScope,
  readOnly = false,
  showThreads = true,
  focusedCommentId = null,
  highlightedRange = null,
  onFocusComment,
}: {
  lines: string[]
  tokens: ThemedToken[][] | null
  comments: Comment[]
  fileProxy: FileStoreProxy | null
  commentsProxy: CommentsStoreProxy | null
  draftScope: string
  readOnly?: boolean
  showThreads?: boolean
  focusedCommentId?: string | null
  highlightedRange?: HighlightRange
  onFocusComment?: (commentId: string | null) => void
}) {
  const rows = tokens ?? lines.map((line) => [{ content: line, color: "" } as ThemedToken])
  const count = rows.length
  const gutter = String(count).length
  const wrap = uiStore.codeWrap

  // `add_comment` lives on the FileStore. The proxy is null only in the brief
  // window before the file's child store mounts, and every dispatch is guarded,
  // so the cast keeps the hook unconditional (Rules of Hooks).
  const addComment = useMusubiCommand(fileProxy as FileStoreProxy, "add_comment")

  // Line-anchored threads bucket by their anchor's *end* line (card past the
  // range); `anchoredLines` carries the full span so a multi-line range
  // highlights whole. Pending comments (the author's own unsent drafts) render
  // alongside published ones so they can be seen and edited before submit.
  const threadsByLine = useMemo(() => {
    const map = new Map<number, Comment[]>()
    const last = count || 1
    for (const comment of comments) {
      if (comment.scope !== "located" || comment.anchor?.type !== "line_range") continue
      const start = Math.min(Math.max(comment.anchor.start_line, 1), last)
      const end = Math.min(Math.max(comment.anchor.end_line, start), last)
      const bucket = map.get(end)
      if (bucket) bucket.push(comment)
      else map.set(end, [comment])
    }
    return map
  }, [comments, count])

  // The line range whose new-comment composer is open (null = none). `drag` is
  // the live gutter drag in progress; on release it commits to `draft`. `switchTo`
  // is a range waiting on the user to confirm discarding a dirty open composer.
  const [draft, setDraft] = useState<Range | null>(null)
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null)
  const [switchTo, setSwitchTo] = useState<Range | null>(null)
  const draftRef = useRef<Range | null>(draft)
  draftRef.current = draft

  const openKey = `suikou-composer:${draftScope}`

  // Restore an open composer across reloads: the anchor persists under `openKey`
  // and the body/type under the composer's own draft key, so a refresh reopens
  // the card and scrolls to it. Re-runs per file; an absent record closes any
  // composer carried over from the previous file.
  useEffect(() => {
    const raw = localStorage.getItem(openKey)
    const stored = raw ? safeRange(raw) : null
    // Only reopen a composer that carried unsaved text and still points at lines
    // this file has; a bare anchor left from an emptied composer, or one now out
    // of range because the file shrank, is stale and discarded outright.
    const inRange = stored !== null && stored.start >= 1 && stored.end <= count
    const restored = stored && inRange && hasDraftBody(draftScope, stored) ? stored : null
    if (!restored) {
      localStorage.removeItem(openKey)
      if (stored) localStorage.removeItem(draftBodyKey(draftScope, stored))
    }
    setDraft(restored)
    if (restored) {
      requestAnimationFrame(() =>
        document.querySelector(`[data-review-line="${restored.end}"]`)?.scrollIntoView({ block: "center" }),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey])

  const open = (range: Range) => {
    setDraft(range)
    localStorage.setItem(openKey, JSON.stringify(range))
  }
  const close = () => {
    const current = draftRef.current
    if (current) localStorage.removeItem(draftBodyKey(draftScope, current))
    localStorage.removeItem(openKey)
    setDraft(null)
  }
  // Open a range, but if a different composer is open with unsaved text, stash
  // the target behind a discard confirm first.
  const requestOpen = (range: Range) => {
    if (readOnly) return
    const current = draftRef.current
    if (current && !sameRange(current, range) && hasDraftBody(draftScope, current)) setSwitchTo(range)
    else open(range)
  }

  // Drag selection via a window listener + hit-testing, not per-line
  // `onPointerEnter`: touch implicitly captures the pointer to the first target,
  // so enter never fires on the lines dragged over — `elementFromPoint` finds
  // them instead, which works for mouse and touch alike.
  const dragging = drag !== null
  const dragRef = useRef(drag)
  dragRef.current = drag
  useEffect(() => {
    if (!dragging) return
    const lineAt = (x: number, y: number): number | null => {
      const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest("[data-review-line]")
      const value = el?.getAttribute("data-review-line")
      return value ? Number(value) : null
    }
    const move = (event: PointerEvent) => {
      const line = lineAt(event.clientX, event.clientY)
      if (line != null) setDrag((d) => (d && d.to !== line ? { ...d, to: line } : d))
    }
    const up = () => {
      const d = dragRef.current
      setDrag(null)
      if (d) requestOpen({ start: Math.min(d.from, d.to), end: Math.max(d.from, d.to) })
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  const submitNew = (body: string, type: CritiqueType) => {
    if (!fileProxy || !draft) return
    addComment
      .dispatch({
        scope: "located",
        critique_type: type,
        body,
        anchor: { type: "line_range", start_line: draft.start, end_line: draft.end },
      })
      .catch(() => undefined)
    close()
  }

  return (
    <div
      className="shrink-0 py-1 font-mono leading-[1.55]"
      style={{ fontSize: MONO_PX[uiStore.monoSize] }}
    >
      {rows.map((lineTokens, index) => {
        const lineNo = index + 1
        const threads = threadsByLine.get(lineNo)
        const active = drag ? { start: Math.min(drag.from, drag.to), end: Math.max(drag.from, drag.to) } : draft
        const selecting = active && lineNo >= active.start && lineNo <= active.end
        const focused =
          highlightedRange !== null &&
          lineNo >= highlightedRange.start &&
          lineNo <= highlightedRange.end
        return (
          <Fragment key={index}>
            <div
              data-review-line={lineNo}
              className={`flex scroll-mt-2 ${selecting ? "bg-accent-soft" : "hover:bg-soft/40"}`}
            >
              <button
                type="button"
                onPointerDown={(event) => {
                  if (event.shiftKey && draft) {
                    open({ start: Math.min(draft.start, lineNo), end: Math.max(draft.start, lineNo) })
                  } else {
                    setDrag({ from: lineNo, to: lineNo })
                  }
                }}
                style={{ minWidth: `${gutter + 2}ch`, touchAction: "none" }}
                title="Comment on this line — drag or shift-click for a range"
                className={`group/gut sticky left-0 shrink-0 cursor-pointer select-none px-3 text-right tabular-nums ${
                  selecting || focused
                    ? "bg-accent-soft font-semibold text-accent-bright"
                    : "bg-editor text-faint hover:text-accent-bright"
                }`}
              >
                <span className="group-hover/gut:opacity-0">{lineNo}</span>
                <Plus
                  size={12}
                  aria-hidden
                  className="absolute inset-y-0 right-2.5 my-auto hidden group-hover/gut:block"
                />
              </button>
              <code className={`pr-6 text-text ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}>
                {lineTokens.length === 0 ? (
                  " "
                ) : (
                  lineTokens.map((token, ti) => (
                    <span key={ti} style={token.color ? { color: token.color } : undefined}>
                      {token.content}
                    </span>
                  ))
                )}
              </code>
            </div>
            {draft && draft.end === lineNo && (
              <Composer
                anchorLabel={`line ${draft.start}${draft.end > draft.start ? `–${draft.end}` : ""}`}
                draftKey={draftBodyKey(draftScope, draft)}
                pending={addComment.isPending}
                suggestSeed={lines.slice(draft.start - 1, draft.end).join("\n")}
                onSubmit={submitNew}
                onCancel={close}
              />
            )}
            {showThreads && threads?.map((comment) => (
              <Thread
                key={comment.id}
                comment={comment}
                commentsProxy={commentsProxy}
                focused={focusedCommentId === comment.id}
                onFocus={onFocusComment ? () => onFocusComment(focusedCommentId === comment.id ? null : comment.id) : undefined}
              />
            ))}
          </Fragment>
        )
      })}
      <ConfirmDialog
        open={switchTo !== null}
        title="Discard unsaved comment?"
        body="You have an unfinished comment open. Starting another one here discards it."
        confirmLabel="Discard"
        onCancel={() => setSwitchTo(null)}
        onConfirm={() => {
          if (draft) localStorage.removeItem(draftBodyKey(draftScope, draft))
          if (switchTo) open(switchTo)
          setSwitchTo(null)
        }}
      />
    </div>
  )
})

const TYPE_META = {
  fix_required: { label: "FIX_REQUIRED", Icon: AlertTriangle, card: "bg-type-fix-soft ring-type-fix-edge", pill: "bg-type-fix-soft text-type-fix ring-type-fix-edge" },
  needs_answer: { label: "NEEDS_ANSWER", Icon: HelpCircle, card: "bg-type-ask-soft ring-type-ask-edge", pill: "bg-type-ask-soft text-type-ask ring-type-ask-edge" },
  note: { label: "NOTE", Icon: StickyNote, card: "bg-type-note-soft ring-type-note-edge", pill: "bg-type-note-soft text-muted ring-type-note-edge" },
} as const

// An inline comment thread below its anchored code line. Published comments are
// read-only with a Reply affordance; a pending comment (the author's own unsent
// draft) carries a Pending badge and Edit / Delete. Editing swaps the card for a
// prefilled composer.
function Thread({
  comment,
  commentsProxy,
  className = "my-1.5 ml-14 mr-3.5",
  compact = false,
  focused = false,
  onFocus,
}: {
  comment: Comment
  commentsProxy: CommentsStoreProxy | null
  className?: string
  compact?: boolean
  focused?: boolean
  onFocus?: () => void
}) {
  const anchor = comment.anchor?.type === "line_range" ? comment.anchor : null
  const pending = comment.status === "pending"
  const bodyHtml = useMemo(() => renderMarkdown(comment.body), [comment.body])

  // Guarded casts: the CommentsStore proxy is null only until the child mounts,
  // and every dispatch below checks it first (Rules of Hooks keep the calls
  // unconditional).
  const editCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "edit_comment")
  const deleteCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "delete_comment")
  const replyCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "reply")
  const [editing, setEditing] = useState(false)
  const [replying, setReplying] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(inlineThreadCollapsedKey(comment.id)) === "1")

  useEffect(() => {
    if (compact) return
    localStorage.setItem(inlineThreadCollapsedKey(comment.id), collapsed ? "1" : "0")
  }, [collapsed, comment.id, compact])

  const range = anchor
    ? `line ${anchor.start_line}${anchor.end_line > anchor.start_line ? `–${anchor.end_line}` : ""}`
    : "comment"
  const anchorLabel = anchor ? `${anchor.start_line}${anchor.end_line > anchor.start_line ? `-${anchor.end_line}` : ""}L` : null

  if (editing) {
    return (
      <Composer
        anchorLabel={range}
        initialType={comment.critique_type}
        initialBody={comment.body}
        submitLabel="Save"
        pending={editCmd.isPending}
        chrome={!compact}
        className={compact ? "m-0" : undefined}
        onSubmit={(body, type) => {
          if (commentsProxy) editCmd.dispatch({ comment_id: comment.id, body, critique_type: type }).catch(() => undefined)
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <CommentCard
      comment={comment}
      className={className}
      headerClassName="gap-1.5 px-3 py-2"
      compact={compact}
      focused={focused}
      collapsible={!compact}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((value) => !value)}
      onFocus={onFocus}
      metaLine={
        anchorLabel ? (
          <span className="inline-flex items-center font-mono text-[11px] text-muted">
            {anchorLabel}
            {pending ? "" : ` · R${comment.authored_round}`}
          </span>
        ) : undefined
      }
      summaryText={comment.body}
      body={
        <div
          className="md-body px-3 pb-2.5 text-[12.5px] leading-[1.5] text-ink"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      }
      replies={
        comment.replies.length > 0 ? (
          <div className="mx-3 mb-2.5 flex flex-col gap-2">
            {comment.replies.map((reply) => (
              <Reply key={reply.id} reply={reply} commentsProxy={commentsProxy} />
            ))}
          </div>
        ) : undefined
      }
      actions={
        <div className="flex items-center justify-end gap-0.5 px-2.5 pb-2">
          {pending ? (
            <>
              <ThreadAction icon={Pencil} label="Edit" onClick={() => setEditing(true)} />
              <ThreadAction
                icon={Trash2}
                label="Delete"
                onClick={() => {
                  if (commentsProxy) deleteCmd.dispatch({ comment_id: comment.id }).catch(() => undefined)
                }}
              />
            </>
          ) : (
            !replying && <ThreadAction icon={CornerDownRight} label="Reply" onClick={() => setReplying(true)} />
          )}
        </div>
      }
      composer={
        replying ? (
          <Composer
            anchorLabel={null}
            submitLabel="Reply"
            draftKey={`suikou-reply:${comment.id}`}
            className="mx-2.5 mb-2.5"
            pending={replyCmd.isPending}
            onSubmit={(body) => {
              if (commentsProxy) replyCmd.dispatch({ comment_id: comment.id, body }).catch(() => undefined)
              setReplying(false)
            }}
            onCancel={() => setReplying(false)}
          />
        ) : undefined
      }
    />
  )
}

function CommentCard({
  comment,
  className,
  headerClassName = "gap-1.5 px-3 py-2",
  focused = false,
  compact = false,
  collapsible = false,
  collapsed = false,
  onToggleCollapse,
  onFocus,
  onHover,
  onLeave,
  metaLine,
  rightLabel,
  summaryText,
  body,
  replies,
  actions,
  composer,
}: {
  comment: Comment
  className: string
  headerClassName?: string
  focused?: boolean
  compact?: boolean
  collapsible?: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
  onFocus?: () => void
  onHover?: () => void
  onLeave?: () => void
  metaLine?: ReactNode
  rightLabel?: ReactNode
  summaryText?: string
  body: ReactNode
  replies?: ReactNode
  actions?: ReactNode
  composer?: ReactNode
}) {
  const meta = TYPE_META[comment.critique_type]
  const pending = comment.status === "pending"

  return (
    <div
      data-thread-card={comment.id}
      data-side-comment-id={comment.id}
      role={onFocus ? "button" : undefined}
      tabIndex={onFocus ? 0 : undefined}
      onClick={onFocus}
      onPointerEnter={onHover}
      onPointerLeave={onLeave}
      onKeyDown={
        onFocus
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onFocus()
              }
            }
          : undefined
      }
      className={`${className} overflow-hidden rounded-panel shadow-sm ring-1 ring-inset ${meta.card} ${
        focused ? "ring-2 ring-accent-edge" : ""
      } ${comment.resolved ? "opacity-65" : ""}`}
    >
      <div className={`flex items-center ${headerClassName}`}>
        {collapsible && !compact && onToggleCollapse && (
          <button
            type="button"
            aria-label={collapsed ? "Expand comment" : "Collapse comment"}
            title={collapsed ? "Expand comment" : "Collapse comment"}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onToggleCollapse()
            }}
            className="-m-1 grid size-6 shrink-0 place-items-center rounded-ctrl text-muted touch-manipulation hover:bg-soft hover:text-ink"
          >
            <span
              className={`grid place-items-center transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${collapsed ? "rotate-0" : "rotate-90"}`}
            >
              <ChevronRight size={15} aria-hidden />
            </span>
          </button>
        )}
        <span className={`inline-flex h-[19px] items-center gap-1 rounded-full px-2 text-[10px] font-extrabold tracking-wide ring-1 ring-inset ${meta.pill}`}>
          <meta.Icon size={11} aria-hidden />
          {meta.label}
          {pending && <span className="size-1.5 shrink-0 rounded-full bg-amber" title="Pending" aria-label="Pending" />}
        </span>
        {metaLine}
        {comment.outdated && <span className="inline-flex items-center font-mono text-[11px] text-amber">· outdated</span>}
        {collapsed && summaryText && (
          <span className="min-w-0 flex-1 truncate self-center text-[12px] leading-none text-muted">
            {summaryText}
          </span>
        )}
        {!collapsed && <span className="flex-1" />}
        {!pending && comment.resolved ? (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-approve">
            <CircleCheck size={12} aria-hidden />
            Resolved
          </span>
        ) : (
          rightLabel
        )}
      </div>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}
      >
        <div className="min-h-0 overflow-hidden">
          {body}
          {replies}
          {actions}
          {composer}
        </div>
      </div>
    </div>
  )
}

function ThreadAction({ icon: Icon, label, onClick }: { icon: typeof Pencil; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="inline-flex h-[26px] items-center gap-1.5 rounded-ctrl px-2 text-[11.5px] font-medium text-muted hover:bg-soft hover:text-ink"
    >
      <Icon size={13} aria-hidden />
      {label}
    </button>
  )
}

const TYPE_OPTIONS: { value: CritiqueType; label: string; Icon: typeof AlertTriangle; dot: string }[] = [
  { value: "fix_required", label: "Fix required", Icon: AlertTriangle, dot: "bg-type-fix" },
  { value: "needs_answer", label: "Needs answer", Icon: HelpCircle, dot: "bg-type-ask" },
  { value: "note", label: "Note", Icon: StickyNote, dot: "bg-type-note" },
]

function safeDraft(raw: string | null): { type: CritiqueType; body: string } | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    if (typeof value?.body !== "string") return null
    const type: CritiqueType = value.type === "needs_answer" || value.type === "note" ? value.type : "fix_required"
    return { type, body: value.body }
  } catch {
    return null
  }
}

// The compact inline composer: a header (anchor + type dropdown), a textarea,
// and Add/Cancel. Type lives in a header dropdown rather than a pill row to keep
// the card short. `anchorLabel: null` = reply mode (no type/anchor). A `draftKey`
// persists the in-progress type+body to localStorage so a reload restores it;
// Cancel with unsaved text asks before discarding.
function Composer({
  anchorLabel,
  initialType = "fix_required",
  initialBody = "",
  draftKey,
  submitLabel = "Add",
  pending,
  className = "my-1.5 ml-14 mr-3.5",
  chrome = true,
  suggestSeed,
  onSubmit,
  onCancel,
}: {
  anchorLabel: string | null
  initialType?: CritiqueType
  initialBody?: string
  draftKey?: string
  submitLabel?: string
  pending?: boolean
  className?: string
  chrome?: boolean
  suggestSeed?: string
  onSubmit: (body: string, type: CritiqueType) => void
  onCancel: () => void
}) {
  const withType = anchorLabel !== null
  const [type, setType] = useState<CritiqueType>(
    () => (draftKey ? safeDraft(localStorage.getItem(draftKey))?.type : undefined) ?? initialType,
  )
  const [body, setBody] = useState<string>(
    () => (draftKey ? safeDraft(localStorage.getItem(draftKey))?.body : undefined) ?? initialBody,
  )
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  // Grow the textarea to fit its content up to a max height, then scroll. Reset
  // to `auto` first so it also shrinks when text is deleted.
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [body])

  useEffect(() => {
    if (!draftKey) return
    if (body.trim()) localStorage.setItem(draftKey, JSON.stringify({ type, body }))
    else localStorage.removeItem(draftKey)
  }, [type, body, draftKey])

  // Any non-empty text is treated as unsaved content worth protecting, so the
  // discard confirm fires the same way whether the composer is a fresh comment,
  // a reply, or an edit prefilled with existing text.
  const hasText = body.trim().length > 0

  const submit = () => {
    const text = body.trim()
    if (!text) return
    if (draftKey) localStorage.removeItem(draftKey)
    onSubmit(text, type)
  }
  // F7: drop a ```suggestion fence seeded with the anchored source so the
  // reviewer edits it into the proposed replacement.
  const insertSuggestion = () => {
    const fence = "```suggestion\n" + (suggestSeed ?? "") + "\n```\n"
    setBody((prev) => (prev.trim() ? prev.replace(/\s*$/, "\n\n") : "") + fence)
    requestAnimationFrame(() => areaRef.current?.focus())
  }
  // Clicking Cancel is an explicit choice, so it discards straight away. Escape
  // and switching to another line are easier to hit by accident, so those route
  // through `requestCancel` and confirm first when there's unsaved text.
  const cancelNow = () => {
    if (draftKey) localStorage.removeItem(draftKey)
    onCancel()
  }
  const requestCancel = () => {
    if (hasText) setConfirmDiscard(true)
    else cancelNow()
  }
  const discard = () => {
    setConfirmDiscard(false)
    cancelNow()
  }

  const current = TYPE_OPTIONS.find((o) => o.value === type) ?? TYPE_OPTIONS[0]

  return (
    <div
      className={`overflow-hidden font-sans ${chrome ? "rounded-panel border border-hair-strong bg-surface shadow-lg" : ""} ${className}`}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        {anchorLabel && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
            <CornerDownRight size={12} aria-hidden />
            {anchorLabel}
          </span>
        )}
        <span className="flex-1" />
        {withType && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="inline-flex h-[24px] cursor-pointer items-center gap-1.5 rounded-full border border-hair-strong bg-canvas px-2.5 text-[11px] font-semibold text-text hover:bg-soft"
                >
                  <span className={`size-2 rounded-full ${current.dot}`} aria-hidden />
                  {current.label}
                  <ChevronDown size={12} className="text-faint" aria-hidden />
                </button>
              }
            />
            <DropdownMenuContent>
              {TYPE_OPTIONS.map((option) => (
                <DropdownMenuItem key={option.value} onClick={() => setType(option.value)}>
                  <span className={`size-2 shrink-0 rounded-full ${option.dot}`} aria-hidden />
                  <option.Icon size={13} className="shrink-0 text-muted" aria-hidden />
                  <span className="flex-1">{option.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="px-3 pb-3">
        <textarea
          ref={areaRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              submit()
            } else if (event.key === "Escape") {
              event.preventDefault()
              requestCancel()
            }
          }}
          rows={2}
          placeholder={withType ? "Leave a comment…" : "Write a reply…"}
          className="block max-h-[240px] min-h-[58px] w-full resize-none overflow-y-auto rounded-ctrl border border-hair-strong bg-canvas px-2.5 py-2 text-[12.5px] leading-[1.5] text-ink placeholder:text-faint focus:border-accent-edge focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-2">
          {suggestSeed !== undefined && (
            <button
              type="button"
              onClick={insertSuggestion}
              title="Insert a code suggestion"
              className="inline-flex h-[28px] items-center gap-1.5 rounded-ctrl border border-hair-strong bg-canvas px-3 text-[12px] font-medium text-text hover:bg-soft"
            >
              <Code2 size={13} className="text-muted" aria-hidden />
              Suggest
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={cancelNow}
            className="h-[28px] rounded-ctrl px-3 text-[12px] font-medium text-muted hover:bg-soft hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!body.trim() || pending}
            className="inline-flex h-[28px] items-center gap-1.5 rounded-ctrl bg-accent px-3.5 text-[12px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
          >
            {submitLabel}
            <span className="text-[11px] opacity-80">⌘⏎</span>
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard unsaved changes?"
        body="Your unsaved text will be lost."
        confirmLabel="Discard"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={discard}
      />
    </div>
  )
}

// A reply under a comment. Agent and published human replies are read-only; the
// author's own pending (unsent) reply can still be edited or deleted before the
// round is submitted. Editing swaps the bubble for a prefilled reply composer.
function Reply({
  reply,
  commentsProxy,
}: {
  reply: Comment["replies"][number]
  commentsProxy: CommentsStoreProxy | null
}) {
  const agent = reply.author === "agent"
  const pending = reply.status === "pending"
  const bodyHtml = useMemo(() => renderMarkdown(reply.body), [reply.body])
  const editCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "edit_reply")
  const deleteCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "delete_reply")
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <Composer
        anchorLabel={null}
        initialBody={reply.body}
        submitLabel="Save"
        className=""
        pending={editCmd.isPending}
        onSubmit={(body) => {
          if (commentsProxy) editCmd.dispatch({ reply_id: reply.id, body }).catch(() => undefined)
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div
      className={`rounded-ctrl px-3 py-2 ring-1 ring-inset ${
        agent ? "bg-accent-softer ring-accent-edge" : "bg-soft ring-hair-strong"
      }`}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${agent ? "text-accent-bright" : "text-text"}`}>
          <span className={`grid size-[15px] place-items-center rounded-[5px] ${agent ? "bg-accent text-on-accent" : "bg-control text-muted"}`}>
            {agent ? <Bot size={10} aria-hidden /> : <User size={10} aria-hidden />}
          </span>
          {agent ? "agent" : "you"}
        </span>
        {pending && (
          <span className="inline-flex items-center rounded-full bg-amber-soft px-1.5 py-px text-[9px] font-bold tracking-wide text-amber ring-1 ring-inset ring-amber-edge">
            PENDING
          </span>
        )}
        <span className="flex-1" />
        {pending && (
          <>
            <ThreadAction icon={Pencil} label="Edit" onClick={() => setEditing(true)} />
            <ThreadAction
              icon={Trash2}
              label="Delete"
              onClick={() => {
                if (commentsProxy) deleteCmd.dispatch({ reply_id: reply.id }).catch(() => undefined)
              }}
            />
          </>
        )}
      </div>
      <div
        className="md-body text-[12px] leading-[1.5] text-text"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </div>
  )
}

function TocMenu({ items, onJump }: { items: OutlineItem[]; onJump: (line: number) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className="grid size-[30px] shrink-0 cursor-pointer place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
            title="Outline"
          >
            <ListTree size={16} aria-hidden />
          </button>
        }
      />
      <DropdownMenuContent>
        <div className="max-h-[60vh] w-[260px] overflow-auto">
          {items.map((item, index) => (
            <DropdownMenuItem key={`${item.line}-${index}`} onClick={() => onJump(item.line)}>
              <span
                style={{ paddingLeft: (item.level - 1) * 12 }}
                className="min-w-0 flex-1 truncate font-mono text-[12px]"
              >
                {item.text}
              </span>
              <span className="ml-2 shrink-0 font-mono text-[10.5px] tabular-nums text-faint">{item.line}</span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** H2 review overview — the draft verdict rollup, open-blocker list, and round
 * stats. No longer a persistent column; opened from the toolbar Review button. */
function ReviewButton({ review }: { review: ReviewSummary }) {
  return (
    <Popover
      align="end"
      className="w-[290px] p-3"
      render={
        <button
          type="button"
          title="Review summary"
          className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-ctrl border border-hair-strong bg-canvas px-2.5 text-[12.5px] font-medium text-ink hover:bg-soft"
        >
          <ListTree size={14} className="text-muted" aria-hidden />
          Review
          <ChevronDown size={12} className="text-faint" aria-hidden />
        </button>
      }
    >
      <ReviewOverview review={review} />
    </Popover>
  )
}

function ReviewOverview({ review }: { review: ReviewSummary }) {
  const total = review.perFile.length
  return (
    <div className="flex flex-col gap-3">
      <VerdictSummary verdict={review.verdict} allApproved={review.allApproved} />
      <div>
        <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-faint">Open blockers</p>
        {review.blockers.length === 0 ? (
          <div className="flex items-center justify-center gap-1.5 rounded-[7px] border border-approve-edge bg-approve-soft py-2 text-[12px] font-medium text-approve">
            <Check size={14} aria-hidden />
            No open blockers
          </div>
        ) : (
          <BlockerList blockers={review.blockers} />
        )}
      </div>
      <div>
        <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-faint">This round</p>
        <div className="grid grid-cols-3 gap-[7px]">
          <IoStat n={total} label="files" />
          <IoStat n={review.unresolved} label="unresolved" tone={review.unresolved > 0 ? "warn" : undefined} />
          <IoStat n={review.reviewed} label="reviewed" tone={review.reviewed === total && total > 0 ? "ok" : undefined} />
        </div>
      </div>
    </div>
  )
}

function VerdictSummary({ verdict, allApproved }: { verdict: Verdict | null; allApproved: boolean }) {
  if (allApproved) {
    return (
      <div className="flex items-center gap-2.5 rounded-[9px] bg-approve-soft px-[11px] py-2.5 shadow-[inset_0_0_0_0.5px_var(--approve-edge)]">
        <span className="grid size-[26px] shrink-0 place-items-center rounded-[7px] bg-approve-soft">
          <Check size={15} className="text-approve" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-faint">Verdict</span>
          <span className="text-[13px] font-semibold text-approve">Review approved</span>
        </span>
      </div>
    )
  }
  const bad = verdict === "request_changes"
  const tint = bad
    ? "bg-request-soft shadow-[inset_0_0_0_0.5px_var(--request-edge)]"
    : verdict === "approve"
      ? "bg-approve-soft shadow-[inset_0_0_0_0.5px_var(--approve-edge)]"
      : "bg-soft shadow-[inset_0_0_0_0.5px_var(--hair-strong)]"
  return (
    <div className={`flex items-center gap-2.5 rounded-[9px] px-[11px] py-2.5 ${tint}`}>
      <span className="grid size-[26px] shrink-0 place-items-center rounded-[7px] bg-canvas/40">
        {bad ? (
          <X size={15} className="text-request" aria-hidden />
        ) : verdict === "approve" ? (
          <Check size={15} className="text-approve" aria-hidden />
        ) : (
          <MessageSquare size={15} className="text-accent-bright" aria-hidden />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-faint">Draft verdict</span>
        <span className={`text-[13px] font-semibold ${verdict ? verdictText(verdict) : "text-muted"}`}>
          {verdict ? `${VERDICT_META[verdict].label} (draft)` : "No verdict yet"}
        </span>
      </span>
    </div>
  )
}

function IoStat({ n, label, tone }: { n: number; label: string; tone?: "ok" | "warn" }) {
  const color = tone === "ok" ? "text-approve" : tone === "warn" ? "text-request" : "text-ink"
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg border border-hair-strong bg-canvas py-2">
      <span className={`text-[18px] font-bold tabular-nums ${color}`}>{n}</span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.02em] text-muted">{label}</span>
    </div>
  )
}

function SideRail({
  comments,
  commentsProxy,
  storageKey,
  onHoverRange,
  onClearFocus,
  onFocus,
}: {
  comments: Comment[]
  commentsProxy: CommentsStoreProxy | null
  storageKey: string | null
  onHoverRange: (range: HighlightRange) => void
  onClearFocus: () => void
  onFocus: (comment: Comment) => void
}) {
  const railBodyRef = useRef<HTMLDivElement | null>(null)
  const [groupTops, setGroupTops] = useState<Map<string, number>>(() => new Map())
  const [hoveredGroupKey, setHoveredGroupKey] = useState<string | null>(null)
  const [pinnedGroupKey, setPinnedGroupKey] = useState<string | null>(() => (storageKey ? localStorage.getItem(storageKey) : null))
  const groups = useMemo<RailGroup[]>(() => {
    const located = comments
      .filter((comment) => comment.scope === "located" && comment.anchor?.type === "line_range")
      .sort((a, b) => commentSortKey(a) - commentSortKey(b))
    const artifacts = comments
      .filter((comment) => comment.scope === "artifact")
      .map((comment) => ({ key: `artifact:${comment.id}`, line: null, comments: [comment] }) satisfies RailGroup)
    const groupedLocated: RailGroup[] = []

    let current: { line: number; end: number; comments: Comment[] } | null = null
    for (const comment of located) {
      const anchor = comment.anchor
      if (!anchor || anchor.type !== "line_range") continue
      if (current && anchor.start_line <= current.end) {
        current.comments.push(comment)
        current.end = Math.max(current.end, anchor.end_line)
        continue
      }
      if (current) {
        groupedLocated.push({
          key: `line:${current.line}`,
          line: current.line,
          comments: current.comments,
        })
      }
      current = { line: anchor.start_line, end: anchor.end_line, comments: [comment] }
    }
    if (current) {
      groupedLocated.push({
        key: `line:${current.line}`,
        line: current.line,
        comments: current.comments,
      })
    }

    return [...groupedLocated, ...artifacts]
  }, [comments])

  useLayoutEffect(() => {
    setPinnedGroupKey(storageKey ? localStorage.getItem(storageKey) : null)
  }, [storageKey])

  useEffect(() => {
    if (storageKey === null) return
    if (pinnedGroupKey === null) {
      localStorage.removeItem(storageKey)
      return
    }
    localStorage.setItem(storageKey, pinnedGroupKey)
  }, [storageKey, pinnedGroupKey])

  useEffect(() => {
    if (pinnedGroupKey !== null && !groups.some((group) => group.key === pinnedGroupKey)) {
      setPinnedGroupKey(null)
    }
  }, [groups, pinnedGroupKey])
  const fallbackTopFor = (group: RailGroup) => {
    const line = group.line
    return line === null ? 8 : Math.max(8, (line - 1) * parseFloat(MONO_PX[uiStore.monoSize]) * 1.55 + 8)
  }
  const groupExpanded = (group: RailGroup) => pinnedGroupKey === group.key
  const groupPreviewing = (group: RailGroup) => hoveredGroupKey === group.key && pinnedGroupKey !== group.key
  const focusGroup = (group: RailGroup) => {
    const comment = group.comments[0]
    setPinnedGroupKey(group.key)
    setHoveredGroupKey(group.key)
    onHoverRange(group.line === null ? null : { start: group.line, end: group.line })
    onFocus(comment)
    scrollToCommentAnchor(comment)
  }
  const clearTransientHover = () => {
    if (pinnedGroupKey !== null) return
    setHoveredGroupKey(null)
    onHoverRange(null)
  }
  const heightForComment = (comment: Comment) => (comment.replies.length > 0 ? 150 : 116)
  const heightForGroup = (group: RailGroup) => {
    if (!groupExpanded(group)) return groupPreviewing(group) ? 64 : 38
    return group.comments.reduce((sum, comment) => sum + heightForComment(comment), 0) + (group.comments.length - 1) * 8
  }

  useLayoutEffect(() => {
    const rail = railBodyRef.current
    const editor = document.querySelector("[data-review-scroll]") as HTMLElement | null

    const measure = () => {
      const next = new Map<string, number>()
      const locatedGroups = groups.filter((group) => group.line !== null)
      const artifactGroups = groups.filter((group) => group.line === null)

      const rawTopFor = (group: RailGroup) => {
        if (group.line === null) return fallbackTopFor(group)
        const lineEl = document.querySelector(`[data-review-line="${group.line}"]`) as HTMLElement | null
        return (
          lineEl && editor
            ? lineEl.getBoundingClientRect().top - editor.getBoundingClientRect().top + editor.scrollTop
            : fallbackTopFor(group)
        )
      }
      const measuredHeightFor = (group: RailGroup) => {
        const box = document.querySelector(`[data-side-group-id="${group.key}"]`) as HTMLElement | null
        return box?.getBoundingClientRect().height || heightForGroup(group)
      }

      const focusedIndex = pinnedGroupKey ? locatedGroups.findIndex((group) => group.key === pinnedGroupKey) : -1
      if (focusedIndex >= 0) {
        const focused = locatedGroups[focusedIndex]
        const focusedTop = Math.max(8, rawTopFor(focused))
        next.set(focused.key, focusedTop)

        let beforeBottom = focusedTop - 8
        for (let index = focusedIndex - 1; index >= 0; index -= 1) {
          const group = locatedGroups[index]
          const height = measuredHeightFor(group)
          const top = Math.max(8, Math.min(rawTopFor(group), beforeBottom - height))
          next.set(group.key, top)
          beforeBottom = top - 8
        }

        let afterTop = focusedTop + measuredHeightFor(focused) + 8
        for (let index = focusedIndex + 1; index < locatedGroups.length; index += 1) {
          const group = locatedGroups[index]
          const top = Math.max(rawTopFor(group), afterTop)
          next.set(group.key, top)
          afterTop = top + measuredHeightFor(group) + 8
        }
      } else {
        let nextLocatedTop = 8
        for (const group of locatedGroups) {
          const top = Math.max(8, rawTopFor(group), nextLocatedTop)
          next.set(group.key, top)
          nextLocatedTop = top + measuredHeightFor(group) + 8
        }
      }

      const locatedBottoms = locatedGroups.map((group) => (next.get(group.key) ?? fallbackTopFor(group)) + measuredHeightFor(group))
      let nextArtifactTop = Math.max(8, locatedBottoms.length ? Math.max(...locatedBottoms) + 8 : 8)
      for (const group of artifactGroups) {
        next.set(group.key, nextArtifactTop)
        nextArtifactTop += measuredHeightFor(group) + 8
      }

      if (rail && editor && rail.scrollTop !== editor.scrollTop) rail.scrollTop = editor.scrollTop
      setGroupTops(next)
    }

    measure()
    editor?.addEventListener("scroll", measure, { passive: true })
    window.addEventListener("resize", measure)
    return () => {
      editor?.removeEventListener("scroll", measure)
      window.removeEventListener("resize", measure)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, hoveredGroupKey, pinnedGroupKey, uiStore.monoSize])

  useEffect(() => {
    if (pinnedGroupKey === null) return
    const clearPinned = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      const rail = railBodyRef.current
      if (rail?.contains(target)) return
      setPinnedGroupKey(null)
      setHoveredGroupKey(null)
      onHoverRange(null)
      onClearFocus()
    }
    window.addEventListener("pointerdown", clearPinned)
    return () => window.removeEventListener("pointerdown", clearPinned)
  }, [onClearFocus, onHoverRange, pinnedGroupKey])

  const railHeight =
    groups.length === 0
      ? "100%"
      : Math.max(...groups.map((group) => (groupTops.get(group.key) ?? fallbackTopFor(group)) + heightForGroup(group))) + 8

  return (
    <aside className="hidden min-h-0 flex-col border-l border-hair-strong bg-surface lg:flex">
      <div
        className="flex h-[42px] shrink-0 items-center gap-2 border-b border-hair px-3"
        onPointerEnter={clearTransientHover}
      >
        <MessageSquare size={15} className="text-muted" aria-hidden />
        <h3 className="text-[12px] font-bold tracking-[-0.01em] text-ink">Comments</h3>
        <span className="rounded-full bg-soft px-2 py-0.5 text-[10.5px] font-bold text-muted tabular-nums">
          {comments.length}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => uiStore.setCommentDisplay("inline")}
          title="Switch to inline layout"
          className="grid size-[26px] place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
        >
          <MessageSquarePlus size={14} aria-hidden />
        </button>
      </div>
      <div
        ref={railBodyRef}
        className="min-h-0 flex-1 overflow-auto p-2"
        onPointerMove={(event) => {
          if (pinnedGroupKey !== null) return
          if ((event.target as Element).closest("[data-side-group-id]")) return
          clearTransientHover()
        }}
      >
        {groups.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center text-[12px] leading-[1.45] text-faint">
            No comments on this file.
          </div>
        ) : (
          <div className="relative min-h-full" style={{ minHeight: railHeight }}>
            {groups.map((group) => (
              <div
                key={group.key}
                data-side-group-id={group.key}
                style={{ top: groupTops.get(group.key) ?? fallbackTopFor(group) }}
                className={`absolute left-0 right-0 ${groupExpanded(group) ? "z-0" : "z-10"}`}
                onPointerDownCapture={(event) => {
                  if (groupExpanded(group)) return
                  if ((event.target as Element).closest("[data-side-group-summary]")) focusGroup(group)
                }}
                onPointerEnter={() => {
                  setHoveredGroupKey(group.key)
                  if (!groupExpanded(group)) onHoverRange(group.line === null ? null : { start: group.line, end: group.line })
                }}
                onPointerLeave={() => {
                  if (pinnedGroupKey !== group.key) setHoveredGroupKey((current) => (current === group.key ? null : current))
                  clearTransientHover()
                }}
              >
                {!groupExpanded(group) ? (
                  <SideGroupSummary
                    group={group}
                    preview={groupPreviewing(group)}
                    onFocus={() => focusGroup(group)}
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {group.comments.map((comment) => (
                      <SideCommentCard
                        key={comment.id}
                        comment={comment}
                        commentsProxy={commentsProxy}
                        onHover={() => onHoverRange(commentRange(comment))}
                        onLeave={() => onHoverRange(group.line === null ? null : { start: group.line, end: group.line })}
                        onFocus={() => scrollToCommentAnchor(comment)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function SideGroupSummary({
  group,
  preview,
  onFocus,
}: {
  group: RailGroup
  preview: boolean
  onFocus: () => void
}) {
  const first = group.comments[0]
  const line = group.line
  const count = group.comments.length
  const pendingCount = group.comments.filter((comment) => comment.status === "pending").length
  const typeLabels = [...new Set(group.comments.map((comment) => TYPE_META[comment.critique_type].label.replace("_REQUIRED", "").replace("NEEDS_", "")))]

  return (
    <button
      type="button"
      data-side-group-summary
      onClick={onFocus}
      className="w-full overflow-hidden rounded-panel bg-canvas px-3 py-2 text-left shadow-sm ring-1 ring-inset ring-hair-strong hover:ring-accent-edge"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-soft px-2 text-[10px] font-bold normal-case text-muted">
          {count}
        </span>
        {line !== null && <span className="shrink-0 font-mono text-[11px] font-semibold text-muted">L{line}</span>}
        <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-faint">
          {typeLabels.join(" / ")}
          {pendingCount > 0 && <span className="size-1.5 shrink-0 rounded-full bg-amber" title="Pending" aria-label="Pending" />}
        </span>
        <span className={`min-w-0 flex-1 text-[12px] leading-[1.45] text-ink ${preview ? "line-clamp-2 whitespace-normal" : "truncate"}`}>
          {first.body}
        </span>
      </div>
    </button>
  )
}

function SideCommentCard({
  comment,
  commentsProxy,
  onHover,
  onLeave,
  onFocus,
}: {
  comment: Comment
  commentsProxy: CommentsStoreProxy | null
  onHover: () => void
  onLeave: () => void
  onFocus: () => void
}) {
  const anchor = comment.anchor?.type === "line_range" ? comment.anchor : null
  const label =
    comment.scope === "artifact"
      ? "File"
      : anchor
        ? `L${anchor.start_line}${anchor.end_line > anchor.start_line ? `-${anchor.end_line}` : ""}`
        : comment.anchor?.type === "element"
          ? "Element"
          : "Anchor"
  const latestReply = comment.replies[comment.replies.length - 1]
  const pending = comment.status === "pending"
  const bodyHtml = useMemo(() => renderMarkdown(comment.body), [comment.body])
  const editCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "edit_comment")
  const deleteCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "delete_comment")
  const resolveCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "resolve_comment")
  const replyCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "reply")
  const [editing, setEditing] = useState(false)
  const [replying, setReplying] = useState(false)

  if (editing) {
    return (
      <div data-side-comment-id={comment.id} className="z-10">
        <Composer
          anchorLabel={label}
          initialType={comment.critique_type}
          initialBody={comment.body}
          submitLabel="Save"
          pending={editCmd.isPending}
          className="m-0"
          onSubmit={(body, type) => {
            if (commentsProxy) editCmd.dispatch({ comment_id: comment.id, body, critique_type: type }).catch(() => undefined)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <CommentCard
      comment={comment}
      className="cursor-pointer p-2.5 text-left"
      headerClassName="gap-1.5 pt-0 pb-0"
      onFocus={onFocus}
      onHover={onHover}
      onLeave={onLeave}
      rightLabel={<span className="shrink-0 font-mono text-[11px] font-semibold text-muted">{label}</span>}
      body={
        <div
          className="md-body mt-2 text-[12px] leading-[1.45] text-ink"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      }
      replies={
        comment.replies.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            {comment.replies.map((reply) => (
              <Reply key={reply.id} reply={reply} commentsProxy={commentsProxy} />
            ))}
          </div>
        ) : latestReply ? (
          <div className="mt-2 rounded-[8px] bg-canvas/55 px-2 py-1.5 text-[11.5px] leading-[1.45] text-text">
            {latestReply.body}
          </div>
        ) : undefined
      }
      actions={
        <div className="mt-2 flex items-center gap-2 text-[10.5px] font-semibold text-muted">
          {comment.replies.length > 0 && <span className="tabular-nums">{comment.replies.length} replies</span>}
          <span className="flex-1" />
          {pending && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setEditing(true)
                }}
                className="inline-flex h-[24px] items-center rounded-ctrl px-2 text-[11px] text-muted hover:bg-soft hover:text-ink"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  if (commentsProxy) deleteCmd.dispatch({ comment_id: comment.id }).catch(() => undefined)
                }}
                className="inline-flex h-[24px] items-center rounded-ctrl px-2 text-[11px] text-muted hover:bg-soft hover:text-ink"
              >
                Delete
              </button>
            </>
          )}
          {!pending && !comment.resolved && !replying && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setReplying(true)
                }}
                className="inline-flex h-[24px] items-center rounded-ctrl px-2 text-[11px] text-muted hover:bg-soft hover:text-ink"
              >
                Reply
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  if (commentsProxy) resolveCmd.dispatch({ comment_id: comment.id }).catch(() => undefined)
                }}
                className="inline-flex h-[24px] items-center rounded-ctrl px-2 text-[11px] text-approve hover:bg-soft"
              >
                Resolve
              </button>
            </>
          )}
        </div>
      }
      composer={
        replying ? (
          <Composer
            anchorLabel={null}
            submitLabel="Reply"
            draftKey={`suikou-reply:${comment.id}`}
            className="mt-2 mb-0 ml-0 mr-0"
            pending={replyCmd.isPending}
            onSubmit={(body) => {
              if (commentsProxy) replyCmd.dispatch({ comment_id: comment.id, body }).catch(() => undefined)
              setReplying(false)
            }}
            onCancel={() => setReplying(false)}
          />
        ) : undefined
      }
    />
  )
}

function commentSortKey(comment: Comment): number {
  if (comment.scope === "artifact") return 0
  if (comment.anchor?.type === "line_range") return comment.anchor.start_line
  return 1_000_000
}

function scrollToCommentAnchor(comment: Comment) {
  if (comment.anchor?.type !== "line_range") return
  document
    .querySelector(`[data-review-line="${comment.anchor.start_line}"]`)
    ?.scrollIntoView({ block: "center", behavior: "smooth" })
}

function StatusBar({
  path,
  connected,
  blockers,
  round,
  readOnly,
  commentDisplay,
}: {
  path: string | null
  connected: boolean
  blockers: number
  round: number
  readOnly: boolean
  commentDisplay: CommentDisplayMode
}) {
  return (
    <div className="flex h-[29px] shrink-0 items-center gap-2.5 border-t border-hair-strong bg-surface px-3.5 text-[11.5px] text-muted">
      <span className="truncate font-mono text-faint">{path ?? "No file selected"}</span>
      <span className="size-[2.5px] rounded-full bg-faint" aria-hidden />
      <span>Round {round}</span>
      {readOnly && <span className="font-semibold text-muted">· read-only</span>}
      {commentDisplay !== "inline" && (
        <>
          <span className="size-[2.5px] rounded-full bg-faint" aria-hidden />
          <span>{commentDisplay === "side" ? "side rail" : "comments hidden"}</span>
        </>
      )}
      {blockers > 0 && (
        <>
          <span className="size-[2.5px] rounded-full bg-faint" aria-hidden />
          <span className="font-semibold text-request">
            {blockers} unresolved
          </span>
        </>
      )}
      <span className="flex-1" />
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`size-[7px] rounded-full ${connected ? "bg-approve shadow-[0_0_0_2.5px_var(--approve-soft)]" : "bg-amber shadow-[0_0_0_2.5px_var(--amber-soft)]"}`}
          aria-hidden
        />
        {connected ? "connected" : "reconnecting…"}
      </span>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center bg-canvas text-[13px] text-muted">{children}</div>
  )
}
