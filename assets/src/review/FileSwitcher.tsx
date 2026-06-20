import { observer } from "mobx-react-lite"
import { Check, ChevronDown, Folder } from "lucide-react"

import { ChangeStatusIcon } from "./ChangeStatusIcon"
import { FileIcon } from "./FileIcon"
import type { ReviewFileEntry } from "./types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"

function splitPath(path: string): { dir: string; basename: string } {
  const slash = path.lastIndexOf("/")
  return slash === -1
    ? { dir: "", basename: path }
    : { dir: path.slice(0, slash + 1), basename: path.slice(slash + 1) }
}

interface FileLeaf {
  type: "file"
  name: string
  file: ReviewFileEntry
}

interface FolderNode {
  type: "folder"
  name: string
  children: TreeNode[]
}

type TreeNode = FileLeaf | FolderNode

function buildTree(files: ReviewFileEntry[]): TreeNode[] {
  const root: FolderNode = { type: "folder", name: "", children: [] }

  for (const file of files) {
    const parts = file.path.split("/")
    let dir = root

    for (const segment of parts.slice(0, -1)) {
      let next = dir.children.find(
        (child): child is FolderNode => child.type === "folder" && child.name === segment
      )
      if (!next) {
        next = { type: "folder", name: segment, children: [] }
        dir.children.push(next)
      }
      dir = next
    }

    dir.children.push({ type: "file", name: parts[parts.length - 1], file })
  }

  sortTree(root.children)
  return root.children
}

function sortTree(nodes: TreeNode[]): void {
  nodes.sort((a, b) =>
    a.type !== b.type ? (a.type === "folder" ? -1 : 1) : a.name.localeCompare(b.name)
  )
  for (const node of nodes) if (node.type === "folder") sortTree(node.children)
}

/**
 * Turns the current file's name into a dropdown that jumps to any file in the
 * review. The trigger reads as the file path; the menu lists every file with
 * its change-status glyph, type icon, and comment count so the reviewer can see
 * outstanding work at a glance. Selection is delegated to the caller, which
 * either scrolls the stacked card into view or navigates to the artifact.
 */
export const FileSwitcher = observer(function FileSwitcher(props: {
  files: ReviewFileEntry[]
  currentPath: string
  commentCountFor: (path: string) => number
  onSelect: (file: ReviewFileEntry) => void
}) {
  const current = splitPath(props.currentPath)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title="Switch file"
            aria-label={`Switch file (current: ${props.currentPath})`}
            className="flex h-7 min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-md px-2 transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
          />
        }
      >
        <FileIcon name={current.basename} />
        <span className="flex min-w-0 items-baseline gap-px overflow-hidden font-mono text-[12px]">
          {current.dir && (
            <span className="min-w-0 truncate text-faint" aria-hidden>
              {current.dir}
            </span>
          )}
          <span className="shrink-0 truncate font-medium text-heading">{current.basename}</span>
        </span>
        <ChevronDown size={12} className="shrink-0 text-faint" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-[min(26rem,calc(100vw-2rem))]">
        {renderTree(buildTree(props.files), 0, props)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

function renderTree(
  nodes: TreeNode[],
  depth: number,
  props: {
    currentPath: string
    commentCountFor: (path: string) => number
    onSelect: (file: ReviewFileEntry) => void
  }
): React.ReactNode[] {
  const indent = `${depth * 14 + 8}px`
  return nodes.flatMap((node) => {
    if (node.type === "folder") {
      // Collapse single-folder chains (a -> a/b/c) so deep paths cost one indent.
      let name = node.name
      let children = node.children
      while (children.length === 1 && children[0].type === "folder") {
        name = `${name}/${children[0].name}`
        children = children[0].children
      }
      return [
        <div
          key={`folder:${depth}:${name}`}
          className="flex min-w-0 items-center gap-1.5 py-1 pr-2 text-[12px] text-muted-foreground"
          style={{ paddingLeft: indent }}
        >
          <Folder size={13} className="shrink-0 text-faint" />
          <span className="min-w-0 truncate font-medium">{name}</span>
        </div>,
        ...renderTree(children, depth + 1, props)
      ]
    }

    const { file } = node
    const count = props.commentCountFor(file.path)
    const isCurrent = file.path === props.currentPath
    return (
      <DropdownMenuItem
        key={file.path}
        onClick={() => props.onSelect(file)}
        className="gap-1.5"
        style={{ paddingLeft: indent }}
      >
        <ChangeStatusIcon status={file.change_status ?? null} size={12} />
        <FileIcon name={node.name} />
        <span className="min-w-0 truncate font-mono text-[12px] font-medium">{node.name}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {count > 0 && (
            <span
              aria-label={`${count} ${count === 1 ? "comment" : "comments"}`}
              className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-tint px-1.5 font-mono text-[10px] tabular-nums text-muted-foreground ring-1 ring-inset ring-line-soft"
            >
              {count}
            </span>
          )}
          {isCurrent && <Check size={13} className="text-blue" aria-label="Current file" />}
        </span>
      </DropdownMenuItem>
    )
  })
}
