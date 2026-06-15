export type ChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "type_changed"
  | null

// GitHub octicon diff glyphs (16px), inlined so no runtime icon dependency.
const ADDED =
  "M2.75 1h10.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 15H2.75A1.75 1.75 0 0 1 1 13.25V2.75C1 1.784 1.784 1 2.75 1Zm10.5 1.5H2.75a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25ZM8 4a.75.75 0 0 1 .75.75v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5A.75.75 0 0 1 8 4Z"
const MODIFIED =
  "M13.25 1c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 15H2.75A1.75 1.75 0 0 1 1 13.25V2.75C1 1.784 1.784 1 2.75 1ZM2.75 2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z"
const REMOVED =
  "M13.25 1c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 15H2.75A1.75 1.75 0 0 1 1 13.25V2.75C1 1.784 1.784 1 2.75 1ZM2.75 2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25Zm8.5 6.25h-6.5a.75.75 0 0 1 0-1.5h6.5a.75.75 0 0 1 0 1.5Z"
const RENAMED =
  "M13.25 1c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 15H2.75A1.75 1.75 0 0 1 1 13.25V2.75C1 1.784 1.784 1 2.75 1ZM2.75 2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25Zm9.03 6.03-3.25 3.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l1.97-1.97H4.75a.75.75 0 0 1 0-1.5h4.69L7.47 5.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018l3.25 3.25a.75.75 0 0 1 0 1.06Z"

interface Spec {
  path: string
  className: string
  label: string
}

// GitHub's conventional diff colors: green added, amber modified, red removed,
// blue renamed. `copied`/`type_changed` have no octicon, so they reuse the
// closest glyph with a distinct color (violet copy, teal type change).
const SPECS: Record<Exclude<ChangeStatus, null>, Spec> = {
  added: { path: ADDED, className: "text-green", label: "Added" },
  modified: { path: MODIFIED, className: "text-amber", label: "Modified" },
  deleted: { path: REMOVED, className: "text-red", label: "Deleted" },
  renamed: { path: RENAMED, className: "text-blue", label: "Renamed" },
  copied: {
    path: RENAMED,
    className: "text-violet-500 dark:text-violet-300",
    label: "Copied"
  },
  type_changed: {
    path: MODIFIED,
    className: "text-teal-600 dark:text-teal-300",
    label: "Type changed"
  }
}

/**
 * GitHub octicon-style diff-status glyph for a file's `change_status`, rendered
 * in GitHub's conventional color. The octicon shapes (filled square with +/dot/-
 * /arrow) are distinct enough to read bare, so no background chip is needed.
 * `null` renders nothing.
 */
export function ChangeStatusIcon({
  status,
  size = 14
}: {
  status: ChangeStatus
  size?: number
}) {
  if (status === null || status === undefined) return null
  const spec = SPECS[status]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      role="img"
      aria-label={spec.label}
      className={`shrink-0 ${spec.className}`}
    >
      <title>{spec.label}</title>
      <path d={spec.path} />
    </svg>
  )
}
