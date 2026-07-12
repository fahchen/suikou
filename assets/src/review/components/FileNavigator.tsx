import { useMemo, useState } from "react"
import { Check, ChevronRight, Eye, EyeOff, FileText, Folder, MessageSquare, Search, X } from "lucide-react"

import { FileIcon } from "../../board/FileIcon"

type Verdict = "approve" | "request_changes" | "comment"

export type ReviewFileEntry = {
  path: string
  verdict: Verdict | null
  added: number | null
  deleted: number | null
  change_status: "added" | "modified" | "deleted" | "renamed" | "copied" | "type_changed" | null
}

export type ReviewFileStatus = {
  draftVerdict: Verdict | null
  latestVerdict: Verdict | null
  openBlockers: number
}

const STATUS_META: Record<
  NonNullable<ReviewFileEntry["change_status"]>,
  { letter: string; className: string; title: string }
> = {
  added: { letter: "A", className: "text-approve", title: "Added" },
  modified: { letter: "M", className: "text-amber", title: "Modified" },
  deleted: { letter: "D", className: "text-request", title: "Deleted" },
  renamed: { letter: "R", className: "text-muted", title: "Renamed" },
  copied: { letter: "C", className: "text-muted", title: "Copied" },
  type_changed: { letter: "T", className: "text-muted", title: "Type changed" },
}

/** Shared A/M/D letter used by the navigator's FileRow and the editor's
 * file head so a diff review shows the same change-status affordance on
 * both surfaces. `null` renders nothing so the caller doesn't need to
 * branch. */
export function ChangeStatusLetter({
  status,
  className = "",
}: {
  status: NonNullable<ReviewFileEntry["change_status"]> | null
  className?: string
}) {
  if (!status) return null
  const meta = STATUS_META[status]
  return (
    <span
      title={meta.title}
      className={`w-[10px] shrink-0 text-center font-mono text-[10.5px] font-bold ${meta.className} ${className}`}
    >
      {meta.letter}
    </span>
  )
}

type TreeNode =
  | { kind: "dir"; name: string; path: string; children: TreeNode[] }
  | { kind: "file"; name: string; path: string; entry: ReviewFileEntry }

const EMPTY_SET: Set<string> = new Set()

export function NavHeader({
  entries,
  reviewed,
  hideReviewed,
  onToggleHideReviewed,
}: {
  entries: ReviewFileEntry[]
  reviewed: number
  hideReviewed: boolean
  onToggleHideReviewed: () => void
}) {
  return (
    <div className="flex items-center gap-[7px] px-3 pb-2">
      <FileText size={15} className="text-muted" aria-hidden />
      <h3 className="text-[12px] font-bold tracking-[-0.01em] text-ink">Files</h3>
      <span className="flex-1" />
      <span className="text-[11px] font-semibold text-muted tabular-nums">
        {reviewed}/{entries.length}
      </span>
      <HideReviewedToggle hideReviewed={hideReviewed} onToggle={onToggleHideReviewed} />
    </div>
  )
}

/** Eye toggle that hides files already carrying a verdict from the navigator.
 * Lives in both the desktop nav header and the mobile files sheet header. */
export function HideReviewedToggle({ hideReviewed, onToggle }: { hideReviewed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={hideReviewed}
      title={hideReviewed ? "Show reviewed files" : "Hide reviewed files"}
      className={`grid size-[22px] shrink-0 place-items-center rounded-ctrl transition-colors ${
        hideReviewed ? "bg-accent-soft text-accent-bright" : "text-muted hover:bg-soft hover:text-ink"
      }`}
    >
      {hideReviewed ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
    </button>
  )
}

export function FileList({
  entries,
  isDiff,
  selectedPath,
  onSelect,
  status,
}: {
  entries: ReviewFileEntry[]
  isDiff: boolean
  selectedPath: string | null
  onSelect: (path: string) => void
  status: Map<string, ReviewFileStatus>
}) {
  const [query, setQuery] = useState("")
  const [closedDirs, setClosedDirs] = useState<Set<string>>(new Set())
  const needle = query.trim().toLowerCase()
  const shown = needle ? entries.filter((entry) => entry.path.toLowerCase().includes(needle)) : entries
  const tree = useMemo(() => buildTree(shown), [shown])

  const toggleDir = (path: string) =>
    setClosedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  return (
    <>
      <div className="mx-[10px] mb-[9px] flex h-[28px] shrink-0 items-center gap-[7px] rounded-ctrl bg-canvas px-2.5 shadow-[inset_0_0_0_0.5px_var(--hair-strong)]">
        <Search size={13} className="shrink-0 text-faint" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter files…"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-faint focus:outline-none"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-1.5 pb-2">
        <TreeNodes
          nodes={tree}
          depth={0}
          isDiff={isDiff}
          selectedPath={selectedPath}
          onSelect={onSelect}
          status={status}
          closedDirs={needle ? EMPTY_SET : closedDirs}
          onToggleDir={toggleDir}
        />
        {shown.length === 0 && <p className="px-3 py-4 text-center text-[12px] text-faint">No files match.</p>}
      </div>
    </>
  )
}

/** Flatten a file list into DFS tree-traversal order — dirs before files at
 * each level, alphabetical inside — so stacked view + prev/next nav iterate
 * files in the same order as the FileNavigator tree renders them. Generic
 * on the entry shape: only `path` is read. */
export function orderByTree<T extends { path: string }>(entries: T[]): T[] {
  type Node =
    | { kind: "dir"; name: string; children: Node[] }
    | { kind: "file"; name: string; entry: T }
  const root: Node[] = []
  const dirs = new Map<string, Extract<Node, { kind: "dir" }>>()

  for (const entry of entries) {
    const segs = entry.path.split("/")
    let level = root
    let prefix = ""

    for (let index = 0; index < segs.length - 1; index += 1) {
      prefix = prefix ? `${prefix}/${segs[index]}` : segs[index]
      let dir = dirs.get(prefix)
      if (!dir) {
        dir = { kind: "dir", name: segs[index], children: [] }
        dirs.set(prefix, dir)
        level.push(dir)
      }
      level = dir.children
    }
    level.push({ kind: "file", name: segs[segs.length - 1], entry })
  }

  const sort = (nodes: Node[]) => {
    nodes.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1))
    for (const node of nodes) if (node.kind === "dir") sort(node.children)
  }
  sort(root)

  const out: T[] = []
  const walk = (nodes: Node[]) => {
    for (const node of nodes) {
      if (node.kind === "dir") walk(node.children)
      else out.push(node.entry)
    }
  }
  walk(root)
  return out
}

function buildTree(entries: ReviewFileEntry[]): TreeNode[] {
  const root: TreeNode[] = []
  const dirs = new Map<string, Extract<TreeNode, { kind: "dir" }>>()

  for (const entry of entries) {
    const segs = entry.path.split("/")
    let level = root
    let prefix = ""

    for (let index = 0; index < segs.length - 1; index += 1) {
      prefix = prefix ? `${prefix}/${segs[index]}` : segs[index]
      let dir = dirs.get(prefix)

      if (!dir) {
        dir = { kind: "dir", name: segs[index], path: prefix, children: [] }
        dirs.set(prefix, dir)
        level.push(dir)
      }

      level = dir.children
    }

    level.push({ kind: "file", name: segs[segs.length - 1], path: entry.path, entry })
  }

  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1))
    for (const node of nodes) {
      if (node.kind === "dir") sort(node.children)
    }
  }

  sort(root)
  return root
}

function TreeNodes({
  nodes,
  depth,
  isDiff,
  selectedPath,
  onSelect,
  status,
  closedDirs,
  onToggleDir,
}: {
  nodes: TreeNode[]
  depth: number
  isDiff: boolean
  selectedPath: string | null
  onSelect: (path: string) => void
  status: Map<string, ReviewFileStatus>
  closedDirs: Set<string>
  onToggleDir: (path: string) => void
}) {
  return (
    <>
      {nodes.map((node) =>
        node.kind === "dir" ? (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => onToggleDir(node.path)}
              style={{ paddingLeft: 9 + depth * 12 }}
              className="flex h-[27px] w-full items-center gap-1.5 rounded-ctrl pr-2 text-left text-[12.5px] text-text hover:bg-soft"
            >
              <ChevronRight
                size={13}
                className={`shrink-0 text-faint transition-transform ${closedDirs.has(node.path) ? "" : "rotate-90"}`}
                aria-hidden
              />
              <Folder size={14} className="shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
            </button>
            {!closedDirs.has(node.path) && (
              <TreeNodes
                nodes={node.children}
                depth={depth + 1}
                isDiff={isDiff}
                selectedPath={selectedPath}
                onSelect={onSelect}
                status={status}
                closedDirs={closedDirs}
                onToggleDir={onToggleDir}
              />
            )}
          </div>
        ) : (
          <FileRow
            key={node.path}
            entry={node.entry}
            depth={depth}
            isDiff={isDiff}
            selected={node.path === selectedPath}
            onSelect={onSelect}
            live={status.get(node.path)}
          />
        ),
      )}
    </>
  )
}

function FileRow({
  entry,
  depth,
  isDiff,
  selected,
  onSelect,
  live,
}: {
  entry: ReviewFileEntry
  depth: number
  isDiff: boolean
  selected: boolean
  onSelect: (path: string) => void
  live: ReviewFileStatus | undefined
}) {
  const name = entry.path.slice(entry.path.lastIndexOf("/") + 1)
  const status = entry.change_status ? STATUS_META[entry.change_status] : null
  const blockers = live?.openBlockers ?? 0
  const verdict = live ? (live.draftVerdict ?? live.latestVerdict) : entry.verdict

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.path)}
      aria-current={selected ? "true" : undefined}
      style={{ paddingLeft: 9 + depth * 12 }}
      className={`flex h-[31px] w-full shrink-0 items-center gap-2 rounded-ctrl pr-2 text-left text-[12.5px] ${
        selected
          ? "bg-accent-soft font-semibold text-accent-bright shadow-[inset_0_0_0_1px_var(--accent-edge)]"
          : "text-text hover:bg-soft"
      }`}
    >
      <span
        className={`w-[10px] shrink-0 text-center font-mono text-[10.5px] font-bold ${status?.className ?? "text-faint"}`}
        title={status?.title}
      >
        {status?.letter ?? ""}
      </span>
      <FileIcon name={name} size={13} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {isDiff && (entry.added || entry.deleted) ? (
        <span className="flex shrink-0 items-center gap-1 font-mono text-[10.5px] tabular-nums">
          {entry.added ? <span className="text-approve">+{entry.added}</span> : null}
          {entry.deleted ? <span className="text-request">−{entry.deleted}</span> : null}
        </span>
      ) : null}
      {blockers > 0 ? (
        <span
          title={`${blockers} open blocker${blockers > 1 ? "s" : ""}`}
          className="grid h-4 min-w-[17px] shrink-0 place-items-center rounded-full bg-request-soft px-1 text-[10px] font-bold tabular-nums text-request shadow-[inset_0_0_0_0.5px_var(--request-edge)]"
        >
          {blockers}
        </span>
      ) : verdict === "approve" ? (
        <Check size={13} className="shrink-0 text-approve" aria-label="Approved" />
      ) : verdict === "request_changes" ? (
        <X size={13} className="shrink-0 text-request" aria-label="Request changes" />
      ) : verdict === "comment" ? (
        <MessageSquare size={12} className="shrink-0 text-muted" aria-label="Comment" />
      ) : null}
    </button>
  )
}
