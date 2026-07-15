import { Tooltip } from "../../../components/ui/tooltip"
import { parseIso } from "../../../lib/utils"

export function TimeAgo({ iso }: { iso: string }) {
  const date = parseIso(iso)

  return (
    <Tooltip
      side="top"
      content={absoluteTime(date)}
      render={
        <time
          dateTime={date.toISOString()}
          className="shrink-0 cursor-default font-mono text-xs text-muted tabular-nums"
        >
          {relativeTime(date)}
        </time>
      }
    />
  )
}

function relativeTime(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (seconds < 10) return "now"
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`

  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`

  return `${Math.floor(days / 365)}y`
}

function absoluteTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date)
}
