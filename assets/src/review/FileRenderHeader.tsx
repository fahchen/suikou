import { observer } from "mobx-react-lite"
import { ChevronRight, Code2, Eye, MessageSquare, MousePointerClick } from "lucide-react"

import { ChangeStatusIcon, type ChangeStatus } from "./ChangeStatusIcon"
import { useHeaderControls } from "./header-slot"
import { uiStore } from "../stores/ui-store"
import { FileIcon } from "./FileIcon"
import { FileSwitcher } from "./FileSwitcher"
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
  outlineContent: string
  viewKind: ViewKind
  commentCount: number
  capabilities: ViewCapabilities
  sourceView: boolean
  onSourceViewChange: (source: boolean) => void
  verdictChip: React.ReactNode
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
    outlineContent,
    viewKind,
    commentCount,
    capabilities,
    sourceView,
    onSourceViewChange,
    verdictChip,
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
        {headerControls}
        {capabilities.htmlInteraction && !sourceView && <HtmlInteractionToggle />}
        {capabilities.sourceToggle && (
          <SourceToggle sourceView={sourceView} onChange={onSourceViewChange} />
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
