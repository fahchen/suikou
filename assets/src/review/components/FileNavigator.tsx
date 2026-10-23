import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ChevronRight, Folder, MessageSquare, MessageSquareOff, Search } from "lucide-react"

import { FileIcon } from "../../board/FileIcon"
import { Badge } from "../../components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs"

export type ReviewFileEntry = {
  path: string
  added: number | null
  deleted: number | null
  change_status: "added" | "modified" | "deleted" | "renamed" | "copied" | "type_changed" | null
}

export type ReviewFileStatus = {
  openBlockers: number
  unresolved: number
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
      className={`w-[10px] shrink-0 text-center font-mono text-2xs font-bold ${meta.className} ${className}`}
    >
      {meta.letter}
    </span>
  )
}

/** A folder row may stand for a chain of folders that each hold only the next
 * one (VS Code's compact folders): `segments` lists them outermost first, and
 * `path` is the innermost, whose children the row opens onto. */
type DirSegment = { name: string; path: string }
export type TreeNode =
  | { kind: "dir"; segments: DirSegment[]; path: string; children: TreeNode[] }
  | { kind: "file"; name: string; path: string; entry: ReviewFileEntry }

const EMPTY_SET: Set<string> = new Set()

export type ExplorerTab = "files" | "scope"

/** A diff review's explorer: the Files tab (carrying the file count, so no
 * separate title row repeats it) and the Scope tab. */
export function ExplorerTabs({
  tab,
  onTab,
  fileCount,
  files,
  scope,
}: {
  tab: ExplorerTab
  onTab: (tab: ExplorerTab) => void
  fileCount: number
  files: ReactNode
  scope: ReactNode
}) {
  return (
    <Tabs value={tab} onValueChange={(value: ExplorerTab) => onTab(value)} className="flex-1">
      <TabsList>
        <TabsTrigger value="files">
          Files
          <Badge>{fileCount}</Badge>
        </TabsTrigger>
        <TabsTrigger value="scope">Scope</TabsTrigger>
      </TabsList>
      <TabsContent value="files" className="flex flex-col pt-2">
        {files}
      </TabsContent>
      <TabsContent value="scope" className="flex flex-col overflow-auto pt-1">
        {scope}
      </TabsContent>
    </Tabs>
  )
}

/** The file tree with its filter. `count` puts the file count in the filter
 * box, for an explorer with no Files tab to carry it (a file-selection
 * review). */
export function FileList({
  entries,
  isDiff,
  selectedPath,
  onSelect,
  status,
  count,
}: {
  entries: ReviewFileEntry[]
  isDiff: boolean
  selectedPath: string | null
  onSelect: (path: string) => void
  status: Map<string, ReviewFileStatus>
  count?: number
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
  const openDirs = (paths: string[]) =>
    setClosedDirs((prev) => {
      const next = new Set(prev)
      for (const path of paths) next.delete(path)
      return next
    })
  // Opening a file (from a link, prev/next, or a comment) unfolds the folders
  // above it, so the selection is never hidden in a collapsed folder.
  useEffect(() => {
    if (!selectedPath) return
    const parts = selectedPath.split("/").slice(0, -1)
    const ancestors = parts.map((_, index) => parts.slice(0, index + 1).join("/"))
    setClosedDirs((prev) => (ancestors.some((dir) => prev.has(dir)) ? new Set([...prev].filter((dir) => !ancestors.includes(dir))) : prev))
  }, [selectedPath])

  return (
    <>
      <div className="mx-[10px] mb-[9px] flex h-[28px] shrink-0 items-center gap-[7px] rounded-ctrl bg-canvas px-2.5 shadow-[inset_0_0_0_0.5px_var(--hair-strong)]">
        <Search size={13} className="shrink-0 text-faint" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter files…"
          className="min-w-0 flex-1 bg-transparent text-xs text-ink placeholder:text-faint focus:outline-none"
        />
        {count !== undefined && (
          <span className="shrink-0 text-2xs font-semibold text-muted tabular-nums" aria-label={`${count} files`}>
            {count}
          </span>
        )}
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
          onOpenDirs={openDirs}
        />
        {shown.length === 0 && <p className="px-3 py-4 text-center text-xs text-faint">No files match.</p>}
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

/** The navigator's folder tree: folders before files, alphabetical, with
 * single-child folder chains compacted into one row. */
export function buildTree(entries: ReviewFileEntry[]): TreeNode[] {
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
        dir = { kind: "dir", segments: [{ name: segs[index], path: prefix }], path: prefix, children: [] }
        dirs.set(prefix, dir)
        level.push(dir)
      }

      level = dir.children
    }

    level.push({ kind: "file", name: segs[segs.length - 1], path: entry.path, entry })
  }

  const label = (node: TreeNode) => (node.kind === "dir" ? node.segments[0]!.name : node.name)
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.kind === b.kind ? label(a).localeCompare(label(b)) : a.kind === "dir" ? -1 : 1))
    for (const node of nodes) {
      if (node.kind === "dir") sort(node.children)
    }
  }

  sort(root)
  return root.map(compactFolders)
}

/** Fold a folder whose only child is another folder into one row, all the
 * way down the chain. */
function compactFolders(node: TreeNode): TreeNode {
  if (node.kind !== "dir") return node
  let dir = node
  while (dir.children.length === 1 && dir.children[0]!.kind === "dir") {
    const only = dir.children[0] as Extract<TreeNode, { kind: "dir" }>
    dir = { kind: "dir", segments: [...dir.segments, ...only.segments], path: only.path, children: only.children }
  }
  return { ...dir, children: dir.children.map(compactFolders) }
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
  onOpenDirs,
}: {
  nodes: TreeNode[]
  depth: number
  isDiff: boolean
  selectedPath: string | null
  onSelect: (path: string) => void
  status: Map<string, ReviewFileStatus>
  closedDirs: Set<string>
  onToggleDir: (path: string) => void
  onOpenDirs: (paths: string[]) => void
}) {
  return (
    <>
      {nodes.map((node) =>
        node.kind === "dir" ? (
          <div key={node.path}>
            <DirRow node={node} depth={depth} closedDirs={closedDirs} onToggleDir={onToggleDir} onOpenDirs={onOpenDirs} />
            {!node.segments.some((segment) => closedDirs.has(segment.path)) && (
              <TreeNodes
                nodes={node.children}
                depth={depth + 1}
                isDiff={isDiff}
                selectedPath={selectedPath}
                onSelect={onSelect}
                status={status}
                closedDirs={closedDirs}
                onToggleDir={onToggleDir}
                onOpenDirs={onOpenDirs}
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

/** A folder row. A compacted chain shows each folder as its own target, so a
 * click collapses at that level; the chevron opens the whole chain when any
 * of it is closed, else closes it at the innermost folder. */
function DirRow({
  node,
  depth,
  closedDirs,
  onToggleDir,
  onOpenDirs,
}: {
  node: Extract<TreeNode, { kind: "dir" }>
  depth: number
  closedDirs: Set<string>
  onToggleDir: (path: string) => void
  onOpenDirs: (paths: string[]) => void
}) {
  const closed = node.segments.some((segment) => closedDirs.has(segment.path))
  const toggleChain = () => (closed ? onOpenDirs(node.segments.map((segment) => segment.path)) : onToggleDir(node.path))
  const chevron = (
    <ChevronRight size={13} className={`shrink-0 text-faint transition-transform ${closed ? "" : "rotate-90"}`} aria-hidden />
  )
  const rowClass = "flex h-[27px] w-full items-center gap-1.5 rounded-ctrl pr-2 text-left text-xs text-text"
  if (node.segments.length === 1) {
    return (
      <button
        type="button"
        onClick={toggleChain}
        aria-expanded={!closed}
        style={{ paddingLeft: 9 + depth * 12 }}
        className={`${rowClass} hover:bg-soft`}
      >
        {chevron}
        <Folder size={14} className="shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{node.segments[0]!.name}</span>
      </button>
    )
  }
  return (
    <div style={{ paddingLeft: 9 + depth * 12 }} className={`${rowClass} hover:bg-soft`}>
      <button
        type="button"
        onClick={toggleChain}
        aria-expanded={!closed}
        aria-label={node.path}
        className="flex shrink-0 items-center gap-1.5 self-stretch"
      >
        {chevron}
        <Folder size={14} className="shrink-0 text-muted" aria-hidden />
      </button>
      <span className="flex min-w-0 flex-1 items-center overflow-hidden">
        {node.segments.map((segment, index) => (
          <span key={segment.path} className="flex min-w-0 shrink items-center last:shrink-0 last:max-w-full">
            {index > 0 && <span className="shrink-0 px-px text-faint">/</span>}
            <button
              type="button"
              onClick={() => onToggleDir(segment.path)}
              aria-expanded={!closedDirs.has(segment.path)}
              title={segment.path}
              className="min-w-0 truncate rounded-[3px] hover:text-ink hover:underline"
            >
              {segment.name}
            </button>
          </span>
        ))}
      </span>
    </div>
  )
}

/** One file in a navigator list, indented by `depth`: change status, name,
 * comment and line-count chips. Shared by the file tree and the stack rail's
 * per-step file list; a flat list (`showDir`) adds the folder after the name,
 * since no tree above says where the file lives. `readOnly` marks a file that
 * takes no comments. */
export function FileRow({
  entry,
  depth,
  isDiff,
  selected,
  onSelect,
  live,
  showDir = false,
  readOnly = false,
}: {
  entry: ReviewFileEntry
  depth: number
  isDiff: boolean
  selected: boolean
  onSelect: (path: string) => void
  live: ReviewFileStatus | undefined
  showDir?: boolean
  readOnly?: boolean
}) {
  const name = entry.path.slice(entry.path.lastIndexOf("/") + 1)
  const dir = entry.path.slice(0, entry.path.lastIndexOf("/") + 1)
  const status = entry.change_status ? STATUS_META[entry.change_status] : null
  const blockers = live?.openBlockers ?? 0
  const unresolved = live?.unresolved ?? 0

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.path)}
      aria-current={selected ? "true" : undefined}
      title={entry.path}
      style={{ paddingLeft: 9 + depth * 12 }}
      className={`flex h-[31px] w-full shrink-0 items-center gap-2 rounded-ctrl pr-2 text-left text-xs ${
        selected
          ? "bg-accent-soft font-semibold text-accent-bright shadow-[inset_0_0_0_1px_var(--accent-edge)]"
          : "text-text hover:bg-soft"
      }`}
    >
      <span
        className={`w-[10px] shrink-0 text-center font-mono text-2xs font-bold ${status?.className ?? "text-faint"}`}
        title={status?.title}
      >
        {status?.letter ?? ""}
      </span>
      <FileIcon name={name} size={13} />
      {showDir && dir ? (
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="max-w-full shrink-0 truncate">{name}</span>
          <span className={`min-w-0 truncate font-mono text-2xs ${selected ? "text-accent-bright/70" : "text-faint"}`}>
            {dir.slice(0, -1)}
          </span>
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate">{name}</span>
      )}
      {readOnly && (
        <span title="Not in the branch's net change: read-only" className="shrink-0 text-faint">
          <MessageSquareOff size={11} aria-hidden />
          <span className="sr-only">Read-only, not in the branch's net change</span>
        </span>
      )}
      {unresolved > 0 ? (
        <span
          title={`${unresolved} unresolved comment${unresolved > 1 ? "s" : ""}`}
          className="flex shrink-0 items-center gap-0.5 font-mono text-2xs tabular-nums text-muted"
        >
          <MessageSquare size={11} aria-hidden />
          {unresolved}
        </span>
      ) : null}
      {isDiff && (entry.added || entry.deleted) ? (
        <span className="flex shrink-0 items-center gap-1 font-mono text-2xs tabular-nums">
          {entry.added ? <span className="text-approve">+{entry.added}</span> : null}
          {entry.deleted ? <span className="text-request">−{entry.deleted}</span> : null}
        </span>
      ) : null}
      {blockers > 0 ? (
        <span
          title={`${blockers} open blocker${blockers > 1 ? "s" : ""}`}
          className="grid h-4 min-w-[17px] shrink-0 place-items-center rounded-full bg-request-soft px-1 text-2xs font-bold tabular-nums text-request shadow-[inset_0_0_0_0.5px_var(--request-edge)]"
        >
          {blockers}
        </span>
      ) : null}
    </button>
  )
}
