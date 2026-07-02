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

      <div className="flex flex-col gap-[6px] border-t border-line-strong bg-canvas/40 px-[11px] py-[9px] text-[10.5px] text-muted-foreground">
        <div className="flex items-baseline gap-[6px]">
          <span className="font-[600] text-text tracking-[-0.005em]">Reviewed</span>
          <span className="ml-auto font-[680] tabular-nums text-text">
            {reviewedCount} of {total}
          </span>
        </div>
        <div className="flex items-baseline gap-[6px]">
          <span className="font-[600] text-text tracking-[-0.005em]">Unresolved</span>
          <span
            className={`ml-auto font-[680] tabular-nums ${unresolvedCount > 0 ? "text-red" : "text-text"}`}
          >
            {unresolvedCount}
          </span>
        </div>
        <div className="flex items-baseline gap-[6px] pt-[2px]">
          <span className="text-muted-foreground">Round</span>
          <span className="ml-auto font-[680] tabular-nums text-text">{round}</span>
        </div>
      </div>
    </aside>
  )
})

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
