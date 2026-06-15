import { observer } from "mobx-react-lite"
import { ChevronRight, Code2, Eye } from "lucide-react"

import { ChangeStatusIcon, type ChangeStatus } from "./ChangeStatusIcon"
import { FileIcon } from "./FileIcon"
import { TopBarTocMenu } from "./TopBarTocMenu"
import type { ViewCapabilities, ViewKind } from "./view-kind"
import { Button } from "@/components/ui/button"

/**
 * Unified per-file render header used by both single-file route and the
 * all-files stacked view. Both modes share the same control set, ordering,
 * and visual language: file path + TOC sit on the left, count + display
 * toggles + verdict chip cluster on the right.
 *
 * Mode-specific affordances are passed as props rather than swapping the
 * component: stacked mode supplies a collapse chevron. File-switching is not a
 * card-header concern — it lives in the review top bar.
 */
export const FileRenderHeader = observer(function FileRenderHeader(props: {
  variant: "single" | "stacked"
  filePath: string
  changeStatus: ChangeStatus
  outlineContent: string
  viewKind: ViewKind
  commentCount: number
  capabilities: ViewCapabilities
  rawView: boolean
  onRawViewChange: (raw: boolean) => void
  verdictChip: React.ReactNode
  // Stacked-only.
  expanded?: boolean
  onToggleExpand?: () => void
}) {
  const {
    variant,
    filePath,
    changeStatus,
    outlineContent,
    viewKind,
    commentCount,
    capabilities,
    rawView,
    onRawViewChange,
    verdictChip,
    expanded,
    onToggleExpand
  } = props

  const slash = filePath.lastIndexOf("/")
  const dir = slash === -1 ? "" : filePath.slice(0, slash + 1)
  const basename = slash === -1 ? filePath : filePath.slice(slash + 1)
  const tocSupported = viewKind !== "diff" && outlineContent !== ""

  const pathLabel = (
    <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
      <FileIcon name={basename} />
      <span className="flex min-w-0 items-baseline gap-px overflow-hidden font-mono text-[12px]">
        {dir && (
          <span className="min-w-0 truncate text-faint" aria-hidden>
            {dir}
          </span>
        )}
        <span className="shrink-0 truncate font-medium text-heading">{basename}</span>
      </span>
    </span>
  )

  const container =
    "sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/92 px-3 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-surface/75"

  return (
    <div className={container}>
      {variant === "stacked" && (
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded ?? false}
          aria-label={expanded ? "Collapse file" : "Expand file"}
          title={expanded ? "Collapse file" : "Expand file"}
          className="-ml-1 inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md p-0.5 text-faint transition-colors hover:bg-hover hover:text-muted-foreground"
        >
          <ChevronRight
            size={13}
            className={`transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
              expanded ? "rotate-90" : ""
            }`}
          />
        </button>
      )}
      <ChangeStatusIcon status={changeStatus} size={12} />
      {pathLabel}
      {tocSupported && (
        <TopBarTocMenu content={outlineContent} path={filePath} />
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {commentCount > 0 && <CommentCountChip count={commentCount} />}
        {capabilities.rawToggle && (
          <RawViewToggle
            rawView={rawView}
            onChange={onRawViewChange}
            viewKind={viewKind}
          />
        )}
        {verdictChip}
      </div>
    </div>
  )
})

/**
 * Tight count affordance — design-token consistent with verdict / change-status
 * chips. Renders nothing at zero; the caller already gates on `count > 0` but
 * the internal guard keeps misuse cheap.
 */
function CommentCountChip(props: { count: number }) {
  if (props.count <= 0) return null
  const label = `${props.count} ${props.count === 1 ? "comment" : "comments"}`
  return (
    <span
      aria-label={label}
      title={label}
      className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-tint px-1.5 font-mono text-[10px] tabular-nums text-muted-foreground ring-1 ring-inset ring-line-soft"
    >
      {props.count}
    </span>
  )
}

/**
 * Per-file render-vs-raw control. Single icon toggle: shows what the user will
 * see AFTER clicking (Code = "view source", Eye = "view rendered") so the
 * affordance reads as the next action, not the current state.
 */
function RawViewToggle(props: {
  rawView: boolean
  onChange: (raw: boolean) => void
  viewKind: ViewKind
}) {
  const sourceLabel = props.viewKind === "html" ? "HTML source" : "raw source"
  const title = props.rawView ? "Show rendered" : `Show ${sourceLabel}`
  const Icon = props.rawView ? Eye : Code2
  return (
    <Button
      variant="pill"
      size="icon-xs"
      title={title}
      aria-label={title}
      aria-pressed={props.rawView}
      onClick={() => props.onChange(!props.rawView)}
    >
      <Icon className="text-muted-foreground" />
    </Button>
  )
}
