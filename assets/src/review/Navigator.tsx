import { useEffect, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import { useNavigate } from "@tanstack/react-router"
import { Folder, Plus, Search, X } from "lucide-react"

import { uiStore } from "../stores/ui-store"
import { ChangeStatusIcon } from "./ChangeStatusIcon"
import { FileIcon } from "./FileIcon"
import { VerdictIcon } from "./TopBarVerdictMenu"
import { reviewFileTarget } from "./review-navigation"
import { useNavigatorModel, type NavigatorModel } from "./use-navigator-model"
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

  const model = useNavigatorModel(reviewSnapshot, filter)
  const {
    total,
    softRemovedTotal,
    reviewedCount,
    commentsThisRound,
    unresolvedCount,
    blockerCount,
    round,
  } = model
  const query = filter.trim()

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
        <NavigatorList
          model={model}
          currentPath={currentPath}
          onSelect={onSelect}
          filter={query}
        />
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

/** The grouped file list (NEEDS REVIEW / REVIEWED / SOFT-REMOVED) plus the
 * no-match empty state. Shared by the desktop navigator column and the mobile
 * file sheet so both render the same rows from the same model; `touch` bumps
 * every row and glyph to ~50px targets for the sheet. */
export function NavigatorList(props: {
  model: NavigatorModel
  currentPath: string | null
  onSelect: (entry: ReviewFileEntry) => void
  filter: string
  touch?: boolean
}) {
  const { model, currentPath, onSelect, filter, touch } = props
  const { commonPrefix, needsReview, reviewed, softRemoved, filteredCount } = model
  return (
    <>
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
          touch={touch}
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
          touch={touch}
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
        <SoftRemovedRow key={r.entry.path} entry={r.entry} prefix={commonPrefix} touch={touch} />
      ))}
      {filter && filteredCount === 0 && (
        <div className="flex flex-col items-center gap-[6px] px-[12px] py-[22px] text-center">
          <span
            aria-hidden
            className="grid size-[26px] place-items-center rounded-full bg-canvas/70 text-muted-foreground shadow-[inset_0_0_0_1px_var(--line)]"
          >
            <Search size={12} />
          </span>
          <p className="text-[12px] font-[620] text-heading">No files match “{filter}”</p>
          <p className="max-w-[180px] text-[11px] leading-snug text-muted-foreground">
            Filter matches file names only, not contents.
          </p>
        </div>
      )}
    </>
  )
}

export function NavFilter(props: {
  inputRef?: React.RefObject<HTMLInputElement | null>
  value: string
  onChange: (v: string) => void
  onClear: () => void
  /** Touch layout for the mobile file sheet: taller field, no `/` kbd hint. */
  touch?: boolean
  autoFocus?: boolean
}) {
  const active = props.value.length > 0
  const touch = props.touch ?? false
  return (
    <div
      className={`flex items-center gap-[8px] rounded-[9px] transition-colors ${
        touch ? "mx-[4px] mb-[12px] h-[40px] px-[12px] text-[13px]" : "mx-[8px] mb-[9px] h-[28px] px-[10px] text-[12px]"
      } ${
        active
          ? "bg-blue-soft text-heading shadow-[inset_0_0_0_1px_var(--color-accent-edge)]"
          : "bg-canvas/60 text-muted-foreground shadow-[inset_0_0_0_1px_var(--line)]"
      }`}
    >
      <Search size={touch ? 15 : 13} className="shrink-0 text-muted-foreground" aria-hidden />
      <input
        ref={props.inputRef}
        type="text"
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={props.autoFocus}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder="Filter files..."
        aria-label="Filter files"
        className={`min-w-0 flex-1 bg-transparent text-heading placeholder:text-muted-foreground focus:outline-none ${
          touch ? "text-[13px]" : "text-[12px]"
        }`}
      />
      {active ? (
        <button
          type="button"
          onClick={props.onClear}
          aria-label="Clear filter"
          className={`grid shrink-0 place-items-center rounded-[4px] text-muted-foreground hover:bg-hover hover:text-heading ${
            touch ? "h-[24px] w-[24px]" : "h-[16px] w-[16px]"
          }`}
        >
          <X size={touch ? 15 : 11} aria-hidden />
        </button>
      ) : (
        !touch && (
          <span
            aria-hidden
            className="shrink-0 rounded-[4px] bg-canvas px-[5px] py-[1px] font-mono text-[10px] text-muted-foreground shadow-[inset_0_0_0_1px_var(--line)]"
          >
            /
          </span>
        )
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

export function GroupHeader(props: { label: string; count: number; first?: boolean }) {
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

export function NavRow(props: {
  entry: ReviewFileEntry
  verdict: import("./types").Verdict | null
  commentCount: number
  unresolved: number
  selected: boolean
  prefix: string
  onSelect: (entry: ReviewFileEntry) => void
  /** Touch layout for the mobile file sheet: ~50px tall row, larger glyphs. */
  touch?: boolean
}) {
  const { entry, verdict, commentCount, unresolved, selected, prefix, onSelect } = props
  const touch = props.touch ?? false
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
      className={`group flex w-full items-center rounded-[9px] text-left transition-colors ${
        touch ? "h-[50px] gap-[9px] px-[10px]" : "h-[31px] gap-[8px] px-[9px]"
      } ${
        selected
          ? "bg-blue-soft text-blue shadow-[inset_0_0_0_1px_var(--color-accent-edge)]"
          : "text-text hover:bg-hover"
      }`}
    >
      <ChangeStatusIcon status={entry.change_status ?? null} size={touch ? 18 : 14} />
      <FileIcon name={name} />
      <span
        className={`min-w-0 flex-1 truncate tracking-[-0.006em] ${
          touch ? "text-[13px]" : "text-[12.5px]"
        } ${selected ? "font-[600] text-blue" : "text-text"}`}
      >
        {dir && <span className="text-muted-foreground">{dir}</span>}
        {name}
      </span>
      {commentCount > 0 && (
        <span
          aria-label={`${commentCount} ${commentCount === 1 ? "comment" : "comments"}`}
          className={`inline-flex items-center justify-center rounded-full font-[720] tabular-nums ${
            touch ? "h-[19px] min-w-[20px] px-[6px] text-[11px]" : "h-[16px] min-w-[17px] px-[4px] text-[10px]"
          } ${
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
          className={`inline-flex shrink-0 justify-center ${touch ? "w-[18px]" : "ml-[2px] w-[16px]"}`}
        >
          <VerdictIcon verdict={verdict} size={touch ? 16 : 13} />
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
export function SoftRemovedRow(props: { entry: ReviewFileEntry; prefix: string; touch?: boolean }) {
  const { entry, prefix } = props
  const touch = props.touch ?? false
  const relative = prefix && entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.path
  const parts = relative.split("/")
  const name = parts[parts.length - 1]
  const dir = parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : ""
  return (
    <div
      title={`${entry.path} — soft-removed`}
      className={`flex w-full items-center rounded-[9px] text-left text-faint opacity-70 ${
        touch ? "h-[50px] gap-[9px] px-[10px]" : "h-[31px] gap-[8px] px-[9px]"
      }`}
    >
      <ChangeStatusIcon status="deleted" size={touch ? 18 : 14} />
      <FileIcon name={name} />
      <span
        className={`min-w-0 flex-1 truncate tracking-[-0.006em] line-through decoration-line/40 ${
          touch ? "text-[13px]" : "text-[12.5px]"
        }`}
      >
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
