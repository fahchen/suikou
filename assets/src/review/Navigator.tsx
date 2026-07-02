import { observer } from "mobx-react-lite"
import { useNavigate } from "@tanstack/react-router"
import { Folder } from "lucide-react"

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

  const ordered = orderedReviewFiles(structure.file_entries)
  const live = reviewSnapshot.body.files ?? []

  const rows = ordered.map((entry) => {
    const liveRow = live.find((f) => f.path === entry.path)
    const verdict = liveRow?.draft_verdict ?? liveRow?.latest_verdict ?? null
    const items = liveRow?.comments?.items ?? []
    const commentCount = items.length
    const unresolved = items.filter((c) => c.status === "pending" || !c.resolved).length
    const reviewedThisRound = Boolean(verdict)
    return {
      entry,
      verdict,
      commentCount,
      unresolved,
      reviewed: reviewedThisRound,
    }
  })

  const needsReview = rows.filter((r) => !r.reviewed)
  const reviewed = rows.filter((r) => r.reviewed)

  const total = rows.length
  const reviewedCount = reviewed.length
  const unresolvedCount = rows.reduce((acc, r) => acc + r.unresolved, 0)
  const round = reviewSnapshot.body.latest_round ?? 0

  function onSelect(entry: ReviewFileEntry) {
    void navigate(reviewFileTarget(structure.review_id, entry.path, sourceView))
  }

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
        </span>
      </div>

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
            onSelect={onSelect}
          />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-[9px] border-t border-line-strong bg-canvas/40 px-[9px] pb-[9px] pt-[11px] text-[10.5px] text-muted-foreground">
        <Meter
          title="Reviewed"
          value={<><span className="text-green">{reviewedCount}</span> of {total}</>}
          fillPct={total === 0 ? 0 : (reviewedCount / total) * 100}
        />
        <Meter
          title="Unresolved"
          value={
            unresolvedCount > 0 ? (
              <span className="text-red">{unresolvedCount}</span>
            ) : (
              <>{unresolvedCount}</>
            )
          }
          fillPct={total === 0 ? 0 : Math.min(100, (unresolvedCount / total) * 100)}
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

function NavRow(props: {
  entry: ReviewFileEntry
  verdict: import("./types").Verdict | null
  commentCount: number
  unresolved: number
  selected: boolean
  onSelect: (entry: ReviewFileEntry) => void
}) {
  const { entry, verdict, commentCount, unresolved, selected, onSelect } = props
  const parts = entry.path.split("/")
  const name = parts[parts.length - 1]
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
