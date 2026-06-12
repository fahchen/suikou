import { useMemo, useState } from "react"

import { ChevronRight, FileText, Folder } from "lucide-react"

interface TreeNode {
  name: string
  path: string
  isFile: boolean
  children: TreeNode[]
}

/** Builds a sorted folder/file tree from a flat list of relative paths. */
export function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", isFile: false, children: [] }

  for (const full of paths) {
    let node = root
    let prefix = ""
    const parts = full.split("/")

    parts.forEach((part, index) => {
      prefix = prefix ? `${prefix}/${part}` : part
      const isFile = index === parts.length - 1
      let child = node.children.find((candidate) => candidate.name === part)

      if (!child) {
        child = { name: part, path: prefix, isFile, children: [] }
        node.children.push(child)
      }

      node = child
    })
  }

  sort(root)
  return root.children
}

function sort(node: TreeNode) {
  node.children.sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1
    return a.name.localeCompare(b.name)
  })
  node.children.forEach(sort)
}

function descendantFiles(node: TreeNode): string[] {
  if (node.isFile) return [node.path]
  return node.children.flatMap(descendantFiles)
}

type CheckState = "checked" | "indeterminate" | "unchecked"

function folderState(node: TreeNode, selected: Set<string>): CheckState {
  const files = descendantFiles(node)
  const picked = files.filter((path) => selected.has(path)).length
  if (picked === 0) return "unchecked"
  if (picked === files.length) return "checked"
  return "indeterminate"
}

/**
 * Controlled multi-select tree. `selected` holds chosen file paths; toggling a
 * folder cascades to every file beneath it.
 */
export function FileTree({
  files,
  selected,
  onChange
}: {
  files: string[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const tree = useMemo(() => buildTree(files), [files])

  function toggle(node: TreeNode, checked: boolean) {
    const next = new Set(selected)
    for (const path of descendantFiles(node)) {
      if (checked) next.add(path)
      else next.delete(path)
    }
    onChange(next)
  }

  if (files.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line px-3 py-2.5 text-[12px] text-faint">
        No files in this directory.
      </p>
    )
  }

  return (
    <ul className="max-h-72 overflow-y-auto rounded-md border border-line bg-control py-1">
      {tree.map((node) => (
        <TreeRow key={node.path} node={node} depth={0} selected={selected} onToggle={toggle} />
      ))}
    </ul>
  )
}

function TreeRow({
  node,
  depth,
  selected,
  onToggle
}: {
  node: TreeNode
  depth: number
  selected: Set<string>
  onToggle: (node: TreeNode, checked: boolean) => void
}) {
  const [open, setOpen] = useState(true)
  const indent = { paddingLeft: `${depth * 16 + 8}px` }

  if (node.isFile) {
    const checked = selected.has(node.path)
    return (
      <li>
        <label
          style={indent}
          className="flex cursor-pointer items-center gap-2 py-1 pr-2.5 transition-colors hover:bg-hover pointer-coarse:min-h-9"
        >
          <Box checked={checked ? "checked" : "unchecked"} onClick={() => onToggle(node, !checked)} />
          <FileText size={13} className="shrink-0 text-faint" />
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-text">{node.name}</span>
        </label>
      </li>
    )
  }

  const state = folderState(node, selected)

  return (
    <li>
      <div
        style={indent}
        className="flex items-center gap-2 py-1 pr-2.5 transition-colors hover:bg-hover pointer-coarse:min-h-9"
      >
        <Box checked={state} onClick={() => onToggle(node, state !== "checked")} />
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <ChevronRight
            size={13}
            className={`shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`}
          />
          <Folder size={13} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-heading">
            {node.name}
          </span>
        </button>
      </div>
      {open && (
        <ul>
          {node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function Box({ checked, onClick }: { checked: CheckState; onClick: () => void }) {
  const filled = checked !== "unchecked"
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked === "indeterminate" ? "mixed" : checked === "checked"}
      onClick={onClick}
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
        filled ? "border-blue bg-blue text-on-accent" : "border-line bg-surface hover:border-focus"
      }`}
    >
      {checked === "checked" && <CheckMark />}
      {checked === "indeterminate" && <span className="h-0.5 w-2 rounded-full bg-on-accent" />}
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
