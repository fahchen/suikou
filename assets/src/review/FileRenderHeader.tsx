import { observer } from "mobx-react-lite"
import { ChevronRight, Code2, Eye, MessageSquare, MousePointerClick } from "lucide-react"

import { ChangeStatusIcon, type ChangeStatus } from "./ChangeStatusIcon"
import { DiffDeltas } from "./ReviewFileTree"
import { useHeaderControls } from "./header-slot"
import { uiStore } from "../stores/ui-store"
import { useMediaQuery, WIDE_QUERY } from "../hooks/use-media-query"
import { FileIcon } from "./FileIcon"
import { FileSwitcher } from "./FileSwitcher"
import { StaleRefresh } from "./StaleRefresh"
import { TopBarTocMenu } from "./TopBarTocMenu"
import type { ReviewFileEntry } from "./types"
import type { ViewCapabilities, ViewKind } from "./view-kind"
import { Button } from "@/components/ui/button"

/**
 * Unified per-file render header used by both single-file route and the
 * all-files stacked view. Both modes share the same control set, ordering,
 * and visual language: file path + TOC sit on the left, count + display
 * toggles + verdict chip cluster on the right.
 *
 * Mode-specific affordances are passed as props rather than swapping the
 * component: stacked mode supplies a collapse chevron. The file path doubles as
 * a switcher when the caller passes the review's file list and a select handler
 * — stacked mode scrolls the chosen card into view, single mode navigates to
 * the artifact.
 */
export const FileRenderHeader = observer(function FileRenderHeader(props: {
  variant: "single" | "stacked"
  filePath: string
  changeStatus: ChangeStatus
  /** git_diff per-file line deltas from `git diff --numstat`; both null (or
   * absent) hides the chip. Available on both single-file and stacked headers. */
  added?: number | null
  deleted?: number | null
  outlineContent: string
  viewKind: ViewKind
  commentCount: number
  capabilities: ViewCapabilities
  sourceView: boolean
  onSourceViewChange: (source: boolean) => void
  verdictChip: React.ReactNode
  // Disk-change affordance: when stale, a "changed on disk" badge + refresh.
  stale?: boolean
  onRefresh?: () => void
  // File switcher: present together when the path should open a file picker.
  files?: ReviewFileEntry[]
  onSelectFile?: (file: ReviewFileEntry) => void
  commentCountFor?: (path: string) => number
  // Stacked-only.
  expanded?: boolean
  onToggleExpand?: () => void
}) {
  const {
    variant,
    filePath,
    changeStatus,
    added,
    deleted,
    outlineContent,
    viewKind,
    commentCount,
    capabilities,
    sourceView,
    onSourceViewChange,
    verdictChip,
    stale,
    onRefresh,
    files,
    onSelectFile,
    commentCountFor,
    expanded,
    onToggleExpand
  } = props

  const headerControls = useHeaderControls()
  const slash = filePath.lastIndexOf("/")
  const dir = slash === -1 ? "" : filePath.slice(0, slash + 1)
  const basename = slash === -1 ? filePath : filePath.slice(slash + 1)
  const tocSupported = viewKind !== "diff" && outlineContent !== ""

  const switchable = files !== undefined && onSelectFile !== undefined
  const pathLabel = switchable ? (
    <FileSwitcher
      files={files}
      currentPath={filePath}
      commentCountFor={commentCountFor ?? (() => 0)}
      onSelect={onSelectFile}
    />
  ) : (
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
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onToggleExpand}
          aria-expanded={expanded ?? false}
          aria-label={expanded ? "Collapse file" : "Expand file"}
          title={expanded ? "Collapse file" : "Expand file"}
          className="-ml-1 text-faint hover:text-muted-foreground"
        >
          <ChevronRight
            className={`transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
              expanded ? "rotate-90" : ""
            }`}
          />
        </Button>
      )}
      <ChangeStatusIcon status={changeStatus} size={12} />
      {pathLabel}
      {viewKind === "diff" && (
        <DiffDeltas added={added ?? null} deleted={deleted ?? null} />
      )}
      {tocSupported && (
        <TopBarTocMenu content={outlineContent} path={filePath} />
      )}
      {stale && onRefresh && <StaleRefresh onRefresh={onRefresh} />}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {commentCount > 0 && <CommentCountChip count={commentCount} />}
        {headerControls}
        {capabilities.diffLayout && <DiffLayoutSegmented />}
        {(capabilities.sourceToggle ||
          (capabilities.htmlInteraction && !sourceView)) && (
          <div className="flex items-center gap-1">
            {capabilities.htmlInteraction && !sourceView && <HtmlInteractionToggle />}
            {capabilities.sourceToggle && (
              <SourceToggle sourceView={sourceView} onChange={onSourceViewChange} />
            )}
          </div>
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
 * Inline Unified / Split segmented control shown in the diff card's file-head,
 * matching the mockup. Falls back to Unified on narrow viewports (matching the
 * DiffView's auto-fallback) so the pressed segment can't lie.
 */
const DiffLayoutSegmented = observer(function DiffLayoutSegmented() {
  const wide = useMediaQuery(WIDE_QUERY)
  const effective = uiStore.diffLayout === "side" && wide ? "side" : "unified"
  return (
    <div
      className="inline-flex h-[22px] items-center rounded-md bg-canvas/60 p-[2px] shadow-[inset_0_0_0_1px_var(--line)]"
      role="group"
      aria-label="Diff layout"
    >
      <SegBtn
        label="Unified"
        pressed={effective === "unified"}
        onClick={() => uiStore.setDiffLayout("unified")}
      />
      <SegBtn
        label="Split"
        pressed={effective === "side"}
        disabled={!wide}
        title={wide ? "Split view" : "Split needs a wider window"}
        onClick={() => uiStore.setDiffLayout("side")}
      />
    </div>
  )
})

function SegBtn(props: {
  label: string
  pressed: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
}) {
  const base =
    "inline-flex h-[18px] items-center rounded-[5px] px-[10px] text-[11.5px] font-[580] tracking-[-0.005em] transition-colors"
  const tone = props.pressed
    ? "bg-panel text-heading shadow-[inset_0_0_0_1px_var(--line-strong)]"
    : props.disabled
      ? "text-faint"
      : "text-muted-foreground hover:text-heading"
  return (
    <button
      type="button"
      aria-pressed={props.pressed}
      disabled={props.disabled}
      title={props.title}
      onClick={props.onClick}
      className={`${base} ${tone}`}
    >
      {props.label}
    </button>
  )
}

/**
 * Per-file rendered-vs-source control, shared by markdown and html. Single icon
 * toggle: shows what the user will see AFTER clicking (Code = "view source", Eye
 * = "view rendered") so the affordance reads as the next action, not the current
 * state.
 */
function SourceToggle(props: {
  sourceView: boolean
  onChange: (source: boolean) => void
}) {
  const title = props.sourceView ? "Show rendered" : "Show source"
  const Icon = props.sourceView ? Eye : Code2
  return (
    <Button
      variant="pill"
      size="icon-xs"
      title={title}
      aria-label={title}
      aria-pressed={props.sourceView}
      onClick={() => props.onChange(!props.sourceView)}
    >
      <Icon className="text-muted-foreground" />
    </Button>
  )
}

/**
 * Rendered-HTML interaction toggle, the comment↔interact axis (orthogonal to the
 * source toggle, which owns rendered↔source). Comment (default): hover + click
 * anchor a comment, with clicks intercepted. Interact: listeners off so the
 * scripted page handles its own pointer events. The icon shows the current mode;
 * the title names what the next click switches to.
 */
const HtmlInteractionToggle = observer(function HtmlInteractionToggle() {
  const interactive = uiStore.htmlInteractive
  const Icon = interactive ? MousePointerClick : MessageSquare
  const label = interactive ? "Interact" : "Comment"
  return (
    <Button
      variant="pill"
      size="icon-xs"
      title={`${label} mode — click to switch`}
      aria-label={`${label} mode, click to switch`}
      aria-pressed={interactive}
      onClick={() => uiStore.setHtmlInteractive(!interactive)}
    >
      <Icon className="text-muted-foreground" />
    </Button>
  )
})
