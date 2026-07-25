import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { observer } from "mobx-react-lite"
import { ChevronRight } from "lucide-react"

import { uiStore } from "../../../stores/ui-store"
import { Tooltip } from "../../../components/ui/tooltip"
import { TYPE_META, type Comment } from "./shared"
import { TimeAgo } from "./TimeAgo"

export function CommentCard({
  comment,
  className,
  headerClassName = "gap-1.5 px-3 py-2",
  focused = false,
  collapsible = false,
  collapsed = false,
  onToggleCollapse,
  onFocus,
  onHover,
  onLeave,
  metaLine,
  rightLabel,
  headerActions,
  summaryText,
  body,
  reactions,
  replies,
  actions,
  composer,
}: {
  comment: Comment
  className: string
  headerClassName?: string
  focused?: boolean
  collapsible?: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
  onFocus?: () => void
  onHover?: () => void
  onLeave?: () => void
  metaLine?: ReactNode
  rightLabel?: ReactNode
  headerActions?: ReactNode
  summaryText?: string
  body: ReactNode
  reactions?: ReactNode
  replies?: ReactNode
  actions?: ReactNode
  composer?: ReactNode
}) {
  const meta = TYPE_META[comment.critique_type]
  const pending = comment.status === "pending"
  const renderedMetaLine = renderMetaLine(metaLine, comment.outdated, comment.drifted)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return

    const measure = () => setContentHeight(Math.ceil(Math.max(content.scrollHeight, content.getBoundingClientRect().height)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      data-thread-card={comment.id}
      data-side-comment-id={comment.id}
      role={onFocus ? "button" : undefined}
      tabIndex={onFocus ? 0 : undefined}
      onClick={
        onFocus
          ? () => {
              // A drag that selected text also fires click; don't steal focus
              // mid-selection or the re-render drops the user's highlight.
              if (!window.getSelection()?.isCollapsed) return
              onFocus()
            }
          : undefined
      }
      onPointerEnter={onHover}
      onPointerLeave={onLeave}
      onKeyDown={
        onFocus
          ? (event) => {
              // Only the card itself activates on Space/Enter; a keystroke
              // bubbling up from the composer or another control must pass
              // through (otherwise the reply box can't type a space).
              if (event.target !== event.currentTarget) return
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onFocus()
              }
            }
          : undefined
      }
      className={`group/comment ${onFocus ? "cursor-pointer" : ""} ${className} overflow-hidden rounded-panel shadow-sm ring-1 ring-inset ${meta.card} ${
        focused ? "ring-2 ring-accent-edge" : ""
      } ${comment.resolved ? "opacity-65" : ""}`}
    >
      <div className={`@container/hdr flex min-w-0 items-center ${headerClassName}`}>
        <span aria-hidden className="-mr-1.5 h-[26px] w-0 shrink-0" />
        {collapsible && onToggleCollapse && (
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
              className={`grid place-items-center transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                collapsed ? "rotate-0" : "rotate-90"
              }`}
            >
              <ChevronRight size={15} aria-hidden />
            </span>
          </button>
        )}
        <AuthorEmoji />
        <Tooltip
          side="top"
          content={pending ? `${meta.title}, pending comment` : meta.title}
          render={
            <span
              aria-label={pending ? `${meta.title}, pending comment` : meta.title}
              className={`inline-flex h-[19px] shrink-0 items-center gap-1 rounded-full px-1.5 text-2xs font-extrabold tracking-wide ring-1 ring-inset ${meta.pill}`}
            >
              <meta.Icon size={11} aria-hidden />
              {pending && <span className="size-1.5 shrink-0 rounded-full bg-amber" aria-hidden />}
            </span>
          }
        />
        {renderedMetaLine}
        <TimeAgo iso={comment.inserted_at} />
        {collapsed && summaryText && (
          <span className="min-w-0 flex-1 truncate self-center text-xs leading-none text-muted">
            {summaryText}
          </span>
        )}
        {!collapsed && <span className="flex-1" />}
        {rightLabel}
        {headerActions}
      </div>
      <div
        aria-hidden={collapsed}
        inert={collapsed ? true : undefined}
        style={{ height: collapsed ? 0 : contentHeight ?? "auto", opacity: collapsed ? 0 : 1 }}
        className={`overflow-hidden ${
          contentHeight === null
            ? ""
            : "motion-safe:transition-[height,opacity] motion-safe:duration-250 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]"
        }`}
      >
        <div ref={contentRef} className="flow-root">
          {body}
          {reactions}
          {replies}
          {actions}
          {composer}
        </div>
      </div>
    </div>
  )
}

const AuthorEmoji = observer(function AuthorEmoji() {
  if (!uiStore.userEmoji) return null
  return (
    <span
      aria-hidden
      className="grid size-[18px] shrink-0 place-items-center rounded-[5px] bg-control text-[11px] leading-none"
    >
      {uiStore.userEmoji}
    </span>
  )
})

function renderMetaLine(metaLine: ReactNode, outdated: boolean, drifted: boolean): ReactNode {
  if (!metaLine) return undefined

  if (outdated) {
    return (
      <Tooltip
        side="top"
        content={
          <>
            <b className="font-semibold text-ink">Anchor outdated</b>
            <br />
            This line comes from older content and may no longer match the current file.
          </>
        }
        render={
          <span className="inline-flex shrink-0 items-center text-amber line-through decoration-amber/80 [&_button]:line-through [&_button]:decoration-amber/80 [&_span]:line-through [&_span]:decoration-amber/80">
            {metaLine}
          </span>
        }
      />
    )
  }

  if (drifted) {
    return (
      <Tooltip
        side="top"
        content={
          <>
            <b className="font-semibold text-ink">Anchor moved</b>
            <br />
            This comment was remapped to nearby content after the file changed.
          </>
        }
        render={<span className="inline-flex shrink-0 items-center">{metaLine}</span>}
      />
    )
  }

  return metaLine
}
