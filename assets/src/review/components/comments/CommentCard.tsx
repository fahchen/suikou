import type { ReactNode } from "react"
import { ChevronRight, CircleCheck } from "lucide-react"

import { TYPE_META, type Comment } from "./shared"

export function CommentCard({
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
              className={`grid place-items-center transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                collapsed ? "rotate-0" : "rotate-90"
              }`}
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
        className={`grid transition-[grid-template-rows,opacity] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        }`}
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
