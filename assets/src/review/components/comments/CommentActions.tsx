import type { LucideIcon } from "lucide-react"

export function CommentActionButton({
  icon: Icon,
  label,
  onClick,
  size = "md",
  tone = "default",
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  size?: "sm" | "md"
  tone?: "default" | "approve"
}) {
  const sizeClass = size === "sm" ? "h-[24px] text-[11px]" : "h-[26px] text-[11.5px]"
  const toneClass = tone === "approve" ? "text-approve hover:bg-soft" : "text-muted hover:bg-soft hover:text-ink"

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={`inline-flex items-center gap-1.5 rounded-ctrl px-2 font-medium ${sizeClass} ${toneClass}`}
    >
      <Icon size={13} aria-hidden />
      {label}
    </button>
  )
}
