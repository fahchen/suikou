import { useEffect, useState } from "react"

import { ChevronRight, Folder } from "lucide-react"

import { FileIcon } from "./FileIcon"

export interface DirEntry {
  path: string
  dir: boolean
}

/** Fetches one directory level (`""` is the project root). */
export type LoadDir = (path: string) => Promise<DirEntry[]>

type CheckState = "checked" | "indeterminate" | "unchecked"

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1)
}

/** Whether a strict ancestor of `path` is selected, so `path` is covered by it. */
function coveredByAncestor(selected: Set<string>, path: string): boolean {
  let slash = path.indexOf("/")
  while (slash !== -1) {
    if (selected.has(path.slice(0, slash))) return true
    slash = path.indexOf("/", slash + 1)
  }
  return false
}

function hasSelectedUnder(selected: Set<string>, dir: string): boolean {
  const prefix = `${dir}/`
  for (const path of selected) if (path.startsWith(prefix)) return true
  return false
}

/**
 * Controlled multi-select tree that reads one directory level at a time, so a
 * large working directory is never scanned in full. `selected` holds chosen
 * paths; a chosen directory is a wildcard standing for every file beneath it,
 * which the server expands on save. Picking a directory drops any now-redundant
 * descendant selections; a node already covered by a selected ancestor is shown
 * checked and locked (deselect the ancestor to change it).
 */
export function FileTree({
  loadDir,
  selected,
  onChange
}: {
  loadDir: LoadDir
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [root, setRoot] = useState<DirEntry[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setRoot(null)
    setFailed(false)
    loadDir("")
      .then((entries) => !cancelled && setRoot(entries))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [loadDir])

  function toggle(path: string, dir: boolean) {
    const next = new Set(selected)
    if (next.has(path)) {
      next.delete(path)
    } else {
      if (dir) for (const chosen of [...next]) if (chosen.startsWith(`${path}/`)) next.delete(chosen)
      next.add(path)
    }
    onChange(next)
  }

  if (failed) return <Notice tone="red">Could not scan the working directory.</Notice>
  if (root === null) return <Notice>Scanning directory…</Notice>
  if (root.length === 0) return <Notice>No files in this directory.</Notice>

  return (
    <ul className="max-h-72 overflow-y-auto rounded-md border border-line bg-control py-1">
      {root.map((entry) => (
        <Row
          key={entry.path}
          entry={entry}
          depth={0}
          selected={selected}
          loadDir={loadDir}
          onToggle={toggle}
        />
      ))}
    </ul>
  )
}

function Row(props: {
  entry: DirEntry
  depth: number
  selected: Set<string>
  loadDir: LoadDir
  onToggle: (path: string, dir: boolean) => void
}) {
  return props.entry.dir ? <FolderRow {...props} /> : <FileRow {...props} />
}

function FileRow({
  entry,
  depth,
  selected,
  onToggle
}: {
  entry: DirEntry
  depth: number
  selected: Set<string>
  onToggle: (path: string, dir: boolean) => void
}) {
  const covered = coveredByAncestor(selected, entry.path)
  const checked = covered || selected.has(entry.path)
  return (
    <li>
      <label
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        className="flex cursor-pointer items-center gap-2 py-1 pr-2.5 transition-colors hover:bg-hover pointer-coarse:min-h-9"
      >
        <Box
          state={checked ? "checked" : "unchecked"}
          disabled={covered}
          onClick={() => onToggle(entry.path, false)}
        />
        <FileIcon name={baseName(entry.path)} />
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-text">
          {baseName(entry.path)}
        </span>
      </label>
    </li>
  )
}

function FolderRow({
  entry,
  depth,
  selected,
  loadDir,
  onToggle
}: {
  entry: DirEntry
  depth: number
  selected: Set<string>
  loadDir: LoadDir
  onToggle: (path: string, dir: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<DirEntry[] | null>(null)
  const [failed, setFailed] = useState(false)

  // Fetch this level's children only the first time it is opened.
  function expand() {
    if (!open && children === null && !failed) {
      loadDir(entry.path)
        .then(setChildren)
        .catch(() => setFailed(true))
    }
    setOpen((value) => !value)
  }

  const covered = coveredByAncestor(selected, entry.path)
  const state: CheckState =
    covered || selected.has(entry.path)
      ? "checked"
      : hasSelectedUnder(selected, entry.path)
        ? "indeterminate"
        : "unchecked"

  return (
    <li>
      <div
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        className="flex items-center gap-2 py-1 pr-2.5 transition-colors hover:bg-hover pointer-coarse:min-h-9"
      >
        <Box state={state} disabled={covered} onClick={() => onToggle(entry.path, true)} />
        <button
          type="button"
          onClick={expand}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <ChevronRight
            size={13}
            className={`shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`}
          />
          <Folder size={13} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-heading">
            {baseName(entry.path)}
          </span>
        </button>
      </div>
      {open && failed && (
        <p style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }} className="py-1 text-[12px] text-red">
          Could not read this folder.
        </p>
      )}
      {open && children && (
        <ul>
          {children.map((child) => (
            <Row
              key={child.path}
              entry={child}
              depth={depth + 1}
              selected={selected}
              loadDir={loadDir}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function Notice(props: { children: React.ReactNode; tone?: "red" }) {
  return (
    <p
      className={`rounded-md border border-dashed border-line px-3 py-2.5 text-[12px] ${
        props.tone === "red" ? "text-red" : "text-faint"
      }`}
    >
      {props.children}
    </p>
  )
}

function Box({
  state,
  disabled,
  onClick
}: {
  state: CheckState
  disabled?: boolean
  onClick: () => void
}) {
  const filled = state !== "unchecked"
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "indeterminate" ? "mixed" : state === "checked"}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-colors disabled:opacity-60 ${
        filled ? "border-blue bg-blue text-on-accent" : "border-line bg-surface hover:border-focus"
      }`}
    >
      {state === "checked" && <CheckMark />}
      {state === "indeterminate" && <span className="h-0.5 w-2 rounded-full bg-on-accent" />}
    </button>
  )
}

function CheckMark() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2.5 6.5L5 9L9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
