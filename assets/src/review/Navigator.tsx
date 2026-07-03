import { useEffect, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import { useNavigate } from "@tanstack/react-router"
import { Folder, Plus, Search, X } from "lucide-react"

import { uiStore } from "../stores/ui-store"
import { ChangeStatusIcon } from "./ChangeStatusIcon"
import { FileIcon } from "./FileIcon"
import { VerdictIcon } from "./TopBarVerdictMenu"
import { orderedReviewFiles } from "./file-order"
import { reviewFileTarget } from "./review-navigation"
import { useReviewStructure } from "./use-review-structure"
import { VERDICT_META, type ReviewFileEntry, type ReviewSnapshot } from "./types"

/** Persistent 236px file list column matching the storyboard `.navigator`.
 * Groups files as NEEDS REVIEW / REVIEWED so the outstanding work reads first;
 * a footer summarises reviewed count, unresolved comments, blockers, round.
 * Kind-agnostic — works for file_selection and git_diff reviews alike. */
export const Navigator = observer(function Navigator(props: {
  reviewSnapshot: ReviewSnapshot
  currentPath: string | null
  sourceView: boolean
}) {
  const { reviewSnapshot, currentPath, sourceView } = props
  const structure = useReviewStructure()
  const navigate = useNavigate()
  const [filter, setFilter] = useState("")
  const filterInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // `/` focuses the filter, matching the mockup's `.kbd` hint. Skip when the
      // user is already typing in a form control so text entry keeps working.
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
      const input = filterInputRef.current
      if (!input) return
      e.preventDefault()
      input.focus()
      input.select()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const ordered = orderedReviewFiles(structure.file_entries)
  const commonPrefix = commonPathPrefix(ordered.map((e) => e.path))
  const live = reviewSnapshot.body.files ?? []

  const rows = ordered.map((entry) => {
    const liveRow = live.find((f) => f.path === entry.path)
    const verdict = liveRow?.draft_verdict ?? liveRow?.latest_verdict ?? null
    const items = liveRow?.comments?.items ?? []
    const commentCount = items.length
    const unresolved = items.filter((c) => c.status === "pending" || !c.resolved).length
    // Blockers (G8) are unresolved fix_required threads; a single one keeps
    // the review from a clean approve, so the count surfaces on both the file
    // row and the review-level meter.
    const blockers = items.filter(
      (c) => c.critique_type === "fix_required" && (c.status === "pending" || !c.resolved),
    ).length
    const reviewedThisRound = Boolean(verdict)
    return {
      entry,
      verdict,
      commentCount,
      unresolved,
      blockers,
      reviewed: reviewedThisRound,
    }
  })

  const query = filter.trim().toLowerCase()
  const filtered = query
    ? rows.filter((r) => r.entry.path.toLowerCase().includes(query))
    : rows

  const active = filtered.filter((r) => !r.entry.soft_removed)
  const softRemoved = filtered.filter((r) => r.entry.soft_removed)
  const needsReview = active.filter((r) => !r.reviewed)
  const reviewed = active.filter((r) => r.reviewed)

  const total = rows.filter((r) => !r.entry.soft_removed).length
  const softRemovedTotal = rows.filter((r) => r.entry.soft_removed).length
  const reviewedCount = rows.filter((r) => r.reviewed && !r.entry.soft_removed).length
  const commentsThisRound = rows.reduce((acc, r) => acc + r.commentCount, 0)
  const unresolvedCount = rows.reduce((acc, r) => acc + r.unresolved, 0)
  const blockerCount = rows.reduce((acc, r) => acc + r.blockers, 0)
  const round = reviewSnapshot.body.latest_round ?? 0

  function onSelect(entry: ReviewFileEntry) {
    void navigate(reviewFileTarget(structure.review_id, entry.path, sourceView))
  }

  if (uiStore.navigatorCollapsed) return null

  return (
    <aside
      className="hidden lg:flex w-[236px] shrink-0 flex-col border-r border-line-strong bg-panel shadow-[inset_0_1px_0_var(--line-soft)]"
      aria-label="Files in this review"
    >
      <div className="flex items-center gap-[7px] px-[11px] pt-[10px] pb-[8px]">
        <Folder size={15} className="shrink-0 text-muted-foreground" aria-hidden />
        <h3 className="text-[12px] font-[660] tracking-[-0.01em] text-heading">Files</h3>
        <span className="ml-auto text-[11px] font-[640] text-muted-foreground tabular-nums">
          {total} {total === 1 ? "file" : "files"}
          {softRemovedTotal > 0 && (
            <span className="text-faint">
              {" · "}
              {softRemovedTotal} soft-removed
            </span>
          )}
        </span>
      </div>

      <NavFilter
        inputRef={filterInputRef}
        value={filter}
        onChange={setFilter}
        onClear={() => setFilter("")}
      />

      <nav className="flex-1 overflow-y-auto px-[6px] pb-[6px]">
        {needsReview.length > 0 && (
          <GroupHeader label="Needs review" count={needsReview.length} first />
        )}
        {needsReview.map((r) => (
          <NavRow
            key={r.entry.path}
            entry={r.entry}
            verdict={r.verdict}
            commentCount={r.commentCount}
            unresolved={r.unresolved}
            selected={r.entry.path === currentPath}
            prefix={commonPrefix}
            onSelect={onSelect}
          />
        ))}
        {reviewed.length > 0 && (
          <GroupHeader label="Reviewed" count={reviewed.length} first={needsReview.length === 0} />
        )}
        {reviewed.map((r) => (
          <NavRow
            key={r.entry.path}
            entry={r.entry}
            verdict={r.verdict}
            commentCount={r.commentCount}
            unresolved={r.unresolved}
            selected={r.entry.path === currentPath}
            prefix={commonPrefix}
            onSelect={onSelect}
          />
        ))}
        {softRemoved.length > 0 && (
          <GroupHeader
            label="Soft-removed"
            count={softRemoved.length}
            first={needsReview.length === 0 && reviewed.length === 0}
          />
        )}
        {softRemoved.map((r) => (
          <SoftRemovedRow key={r.entry.path} entry={r.entry} prefix={commonPrefix} />
        ))}
        {query && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-[6px] px-[12px] py-[22px] text-center">
            <span
              aria-hidden
              className="grid size-[26px] place-items-center rounded-full bg-canvas/70 text-muted-foreground shadow-[inset_0_0_0_1px_var(--line)]"
            >
              <Search size={12} />
            </span>
            <p className="text-[12px] font-[620] text-heading">
              No files match “{filter.trim()}”
            </p>
            <p className="max-w-[180px] text-[11px] leading-snug text-muted-foreground">
              Filter matches file names only, not contents.
            </p>
          </div>
        )}
      </nav>

      <div className="mt-auto flex flex-col gap-[9px] border-t border-line-strong bg-canvas/40 px-[9px] pb-[9px] pt-[11px] text-[10.5px] text-muted-foreground">
        <Meter
          title="Reviewed"
          value={<><span className="text-green">{reviewedCount}</span> of {total}</>}
          fillPct={total === 0 ? 0 : (reviewedCount / total) * 100}
        />
        <Meter
          title="Comments"
          value={
            unresolvedCount > 0 ? (
              <>
                <span className="text-red">{unresolvedCount}</span> unresolved
                {blockerCount > 0 && (
                  <>
                    {" · "}
                    <span className="text-red">
                      {blockerCount} {blockerCount === 1 ? "blocker" : "blockers"}
                    </span>
                  </>
                )}
              </>
            ) : (
              <>{commentsThisRound} this round</>
            )
          }
          fillPct={
            unresolvedCount > 0
              ? Math.min(100, (unresolvedCount / Math.max(1, commentsThisRound)) * 100)
              : commentsThisRound > 0
                ? 100
                : 0
          }
          warn={unresolvedCount > 0}
        />
        <div className="flex items-center gap-[8px] pt-[2px] text-[11px] text-muted-foreground">
          <span className="ml-auto inline-flex items-center gap-[6px] tabular-nums">
            Round {round}
          </span>
        </div>
      </div>
    </aside>
  )
})

function NavFilter(props: {
  inputRef: React.RefObject<HTMLInputElement | null>
  value: string
  onChange: (v: string) => void
  onClear: () => void
}) {
  const active = props.value.length > 0
  return (
    <div
      className={`mx-[8px] mb-[9px] flex h-[28px] items-center gap-[7px] rounded-[9px] px-[10px] text-[12px] transition-colors ${
        active
          ? "bg-blue-soft text-heading shadow-[inset_0_0_0_1px_var(--color-accent-edge)]"
          : "bg-canvas/60 text-muted-foreground shadow-[inset_0_0_0_1px_var(--line)]"
      }`}
    >
      <Search size={13} className="shrink-0 text-muted-foreground" aria-hidden />
      <input
        ref={props.inputRef}
        type="text"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder="Filter files..."
        aria-label="Filter files"
        className="min-w-0 flex-1 bg-transparent text-[12px] text-heading placeholder:text-muted-foreground focus:outline-none"
      />
      {active ? (
        <button
          type="button"
          onClick={props.onClear}
          aria-label="Clear filter"
          className="grid h-[16px] w-[16px] shrink-0 place-items-center rounded-[4px] text-muted-foreground hover:bg-hover hover:text-heading"
        >
          <X size={11} aria-hidden />
        </button>
      ) : (
        <span
          aria-hidden
          className="shrink-0 rounded-[4px] bg-canvas px-[5px] py-[1px] font-mono text-[10px] text-muted-foreground shadow-[inset_0_0_0_1px_var(--line)]"
        >
          /
        </span>
      )}
    </div>
  )
}

function Meter(props: {
  title: string
  value: React.ReactNode
  fillPct: number
  warn?: boolean
}) {
  const pct = Math.max(0, Math.min(100, props.fillPct))
  return (
    <div className="flex flex-col gap-[5px]">
      <div className="flex items-baseline gap-[6px] text-[10.5px]">
        <span className="font-[600] text-text tracking-[-0.005em]">{props.title}</span>
        <span className="ml-auto font-[680] tabular-nums text-text">{props.value}</span>
      </div>
      <div
        className="h-[4px] w-full overflow-hidden rounded-full bg-canvas shadow-[inset_0_0.5px_1px_var(--line-soft)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div
          className={`h-full rounded-full ${props.warn ? "bg-red" : "bg-blue"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function GroupHeader(props: { label: string; count: number; first?: boolean }) {
  return (
    <div
      className={`flex items-center gap-[7px] px-[9px] pb-[5px] ${props.first ? "pt-[4px]" : "pt-[11px]"}`}
    >
      <span className="text-[9.5px] font-[760] uppercase tracking-[0.12em] text-muted-foreground">
        {props.label}
      </span>
      <span className="text-[9.5px] font-[700] tracking-[0.06em] text-faint tabular-nums">
        {props.count}
      </span>
      <span className="ml-1 h-px flex-1 bg-line" />
    </div>
  )
}

/** Longest directory prefix (ending with `/`) shared by every path. Trimming it
 * from each row keeps the file list scannable — a project rooted under `lib/`
 * shows `handler.ex` / `runtime/store.ex`, not `lib/handler.ex` / `lib/runtime/store.ex`. */
function commonPathPrefix(paths: string[]): string {
  if (paths.length === 0) return ""
  const first = paths[0]
  let end = first.lastIndexOf("/") + 1
  for (const path of paths) {
    while (end > 0 && !path.startsWith(first.slice(0, end))) {
      end = first.lastIndexOf("/", end - 2) + 1
    }
    if (end === 0) return ""
  }
  return first.slice(0, end)
}

function NavRow(props: {
  entry: ReviewFileEntry
  verdict: import("./types").Verdict | null
  commentCount: number
  unresolved: number
  selected: boolean
  prefix: string
  onSelect: (entry: ReviewFileEntry) => void
}) {
  const { entry, verdict, commentCount, unresolved, selected, prefix, onSelect } = props
  const relative = prefix && entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.path
  const parts = relative.split("/")
  const name = parts[parts.length - 1]
  const dir = parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : ""
  const hasBlocker = verdict === "request_changes" || unresolved > 0
  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      aria-current={selected ? "true" : undefined}
      title={entry.path}
      className={`group flex h-[31px] w-full items-center gap-[8px] rounded-[9px] px-[9px] text-left transition-colors ${
        selected
          ? "bg-blue-soft text-blue shadow-[inset_0_0_0_1px_var(--color-accent-edge)]"
          : "text-text hover:bg-hover"
      }`}
    >
      <ChangeStatusIcon status={entry.change_status ?? null} size={14} />
      <FileIcon name={name} />
      <span
        className={`min-w-0 flex-1 truncate text-[12.5px] tracking-[-0.006em] ${
          selected ? "font-[600] text-blue" : "text-text"
        }`}
      >
        {dir && <span className="text-muted-foreground">{dir}</span>}
        {name}
      </span>
      {commentCount > 0 && (
        <span
          aria-label={`${commentCount} ${commentCount === 1 ? "comment" : "comments"}`}
          className={`inline-flex h-[16px] min-w-[17px] items-center justify-center rounded-full px-[4px] text-[10px] font-[720] tabular-nums ${
            hasBlocker
              ? "bg-red-soft text-red shadow-[inset_0_0_0_0.5px_var(--color-red)]"
              : selected
                ? "bg-blue-soft text-blue"
                : "bg-tint text-muted-foreground"
          }`}
        >
          {commentCount}
        </span>
      )}
      {verdict && (
        <span
          title={VERDICT_META[verdict].label}
          aria-label={VERDICT_META[verdict].label}
          className="ml-[2px] inline-flex w-[16px] shrink-0 justify-center"
        >
          <VerdictIcon verdict={verdict} size={13} />
        </span>
      )}
    </button>
  )
}

/** Soft-removed file row (C8): dimmed + strikethrough so the reviewer can see
 * what they let go, with a decorative "reselect" pill matching the mockup.
 * ponytail: the pill is presentational — a real reselect flow needs a
 * `restore_file` command that adds the path back to the selection; add when
 * that lands. */
function SoftRemovedRow(props: { entry: ReviewFileEntry; prefix: string }) {
  const { entry, prefix } = props
  const relative = prefix && entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.path
  const parts = relative.split("/")
  const name = parts[parts.length - 1]
  const dir = parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : ""
  return (
    <div
      title={`${entry.path} — soft-removed`}
      className="flex h-[31px] w-full items-center gap-[8px] rounded-[9px] px-[9px] text-left text-faint opacity-70"
    >
      <ChangeStatusIcon status="deleted" size={14} />
      <FileIcon name={name} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] tracking-[-0.006em] line-through decoration-line/40">
        {dir && <span>{dir}</span>}
        {name}
      </span>
      <span
        aria-hidden
        className="inline-flex h-[18px] shrink-0 items-center gap-[3px] rounded-full bg-accent-soft px-[6px] text-[10px] font-[700] text-accent-bright shadow-[inset_0_0_0_0.5px_var(--color-accent-edge)]"
      >
        <Plus size={10} strokeWidth={2.4} aria-hidden />
        reselect
      </span>
    </div>
  )
}
