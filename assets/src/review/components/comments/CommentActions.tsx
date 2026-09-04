import { useEffect, useState } from "react"
import { Check, RotateCcw, Trash2, type LucideIcon } from "lucide-react"

type Reveal = "always" | "comment-hover" | "reply-hover"

/** Hover-to-reveal only where hovering exists; see the `hoverable` variant in
 * index.css. Spelled out per case because Tailwind only sees class names that
 * appear literally in the source. */
const REVEAL: Record<Reveal, string> = {
  always: "opacity-100",
  "comment-hover":
    "opacity-100 hoverable:opacity-0 hoverable:group-hover/comment:opacity-100 hoverable:group-focus-within/comment:opacity-100",
  "reply-hover":
    "opacity-100 hoverable:opacity-0 hoverable:group-hover/reply:opacity-100 hoverable:group-focus-within/reply:opacity-100",
}

/** Touch needs a bigger target than a mouse; a coarse pointer gets the taller
 * control while a mouse keeps the compact one. */
const TOUCH_SIZE = "coarse:h-[32px] coarse:px-2.5"
const TOUCH_ICON_SIZE = "coarse:size-[32px]"

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
  reveal?: Reveal
}) {
  const sizeClass = `${size === "sm" ? "h-[24px]" : "h-[26px]"} text-xs ${TOUCH_SIZE}`
  const toneClass = tone === "approve" ? "text-approve hover:bg-soft" : "text-muted hover:bg-soft hover:text-ink"

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
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-ctrl px-2 font-medium transition-[opacity,background-color,color] ${sizeClass} ${toneClass} ${REVEAL[reveal]}`}
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
  reveal?: Reveal
}) {
  const [armed, setArmed] = useState(false)
  const sizeClass = `${size === "sm" ? "size-[24px]" : "size-[26px]"} ${TOUCH_ICON_SIZE}`

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
      } ${REVEAL[armed ? "always" : reveal]}`}
    >
      {armed ? <Check size={14} aria-hidden /> : <Trash2 size={14} aria-hidden />}
    </button>
  )
}

/** The resolve/reopen pair every comment card carries. Which side of the card
 * it sits on is the caller's call; what it looks like is not. */
export function ResolveToggle({
  resolved,
  size,
  reveal,
  onResolve,
  onReopen,
}: {
  resolved: boolean
  size?: "sm" | "md"
  reveal?: Reveal
  onResolve: () => void
  onReopen: () => void
}) {
  return resolved ? (
    <CommentActionButton icon={RotateCcw} label="Reopen" size={size} reveal={reveal} onClick={onReopen} />
  ) : (
    <CommentActionButton icon={Check} label="Resolve" tone="approve" size={size} reveal={reveal} onClick={onResolve} />
  )
}

/** The comment's anchor, pressable when the card can focus it: pressing pins
 * the editor highlight on the anchored lines. */
export function AnchorLabel({
  label,
  focused = false,
  onFocus,
}: {
  label: string
  focused?: boolean
  onFocus?: () => void
}) {
  if (!onFocus) return <span className="font-mono text-xs text-muted">{label}</span>

  return (
    <button
      type="button"
      aria-pressed={focused}
      title={focused ? "Clear comment focus" : "Focus comment"}
      onClick={onFocus}
      className={`-mx-1 rounded-ctrl px-1 font-mono text-xs transition-colors coarse:py-1.5 ${
        focused ? "bg-accent-soft text-accent-bright" : "text-muted hover:bg-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  )
}
