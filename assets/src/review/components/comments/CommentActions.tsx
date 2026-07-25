import { useEffect, useState } from "react"
import { Check, Trash2, type LucideIcon } from "lucide-react"

export function CommentActionButton({
  icon: Icon,
  label,
  onClick,
  size = "md",
  tone = "default",
  reveal = "always",
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  size?: "sm" | "md"
  tone?: "default" | "approve"
  reveal?: "always" | "comment-hover" | "reply-hover"
}) {
  const sizeClass = size === "sm" ? "h-[24px] text-xs" : "h-[26px] text-xs"
  const toneClass = tone === "approve" ? "text-approve hover:bg-soft" : "text-muted hover:bg-soft hover:text-ink"
  const revealClass =
    reveal === "comment-hover"
      ? "opacity-100 md:opacity-0 md:group-hover/comment:opacity-100 md:group-focus-within/comment:opacity-100"
      : reveal === "reply-hover"
        ? "opacity-100 md:opacity-0 md:group-hover/reply:opacity-100 md:group-focus-within/reply:opacity-100"
        : "opacity-100"

  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={`inline-flex items-center gap-1.5 rounded-ctrl px-2 font-medium transition-[opacity,background-color,color] ${sizeClass} ${toneClass} ${revealClass}`}
    >
      <Icon size={13} aria-hidden />
      {label}
    </button>
  )
}

export function ConfirmDeleteIconButton({
  onConfirm,
  size = "md",
  reveal = "always",
}: {
  onConfirm: () => void
  size?: "sm" | "md"
  reveal?: "always" | "comment-hover" | "reply-hover"
}) {
  const [armed, setArmed] = useState(false)
  const sizeClass = size === "sm" ? "size-[24px]" : "size-[26px]"
  const revealClass =
    armed
      ? "opacity-100"
      : reveal === "comment-hover"
        ? "opacity-100 md:opacity-0 md:group-hover/comment:opacity-100 md:group-focus-within/comment:opacity-100"
        : reveal === "reply-hover"
          ? "opacity-100 md:opacity-0 md:group-hover/reply:opacity-100 md:group-focus-within/reply:opacity-100"
          : "opacity-100"

  useEffect(() => {
    if (!armed) return
    const timeout = window.setTimeout(() => setArmed(false), 3000)
    return () => window.clearTimeout(timeout)
  }, [armed])

  return (
    <button
      type="button"
      aria-label={armed ? "Confirm delete" : "Delete"}
      title={armed ? "Confirm delete" : "Delete"}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onClick={(event) => {
        event.stopPropagation()
        if (armed) {
          onConfirm()
        } else {
          setArmed(true)
        }
      }}
      className={`grid shrink-0 place-items-center rounded-ctrl transition-[opacity,background-color,color] ${sizeClass} ${
        armed ? "bg-request-soft text-request" : "text-muted hover:bg-request-soft hover:text-request"
      } ${revealClass}`}
    >
      {armed ? <Check size={14} aria-hidden /> : <Trash2 size={14} aria-hidden />}
    </button>
  )
}
