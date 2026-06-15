import { ArrowRight, Check, Folder, Loader2 } from "lucide-react"

import { ChangeStatusIcon, type ChangeStatus } from "./ChangeStatusIcon"
import { FileIcon } from "./FileIcon"
import { FILE_TREE_SCROLL } from "./file-tree-scroll"

interface ReviewFile {
  path: string
  artifact_id: string | null
  approved: boolean
  change_status?: ChangeStatus
}

interface FileNode {
  type: "file"
  name: string
  file: ReviewFile
}

interface FolderNode {
  type: "folder"
  name: string
  children: TreeNode[]
}

type TreeNode = FileNode | FolderNode

function buildTree(files: ReviewFile[]): TreeNode[] {
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

  sort(root.children)
  return root.children
}

function sort(nodes: TreeNode[]): void {
  nodes.sort((a, b) =>
    a.type !== b.type ? (a.type === "folder" ? -1 : 1) : a.name.localeCompare(b.name)
  )
  for (const node of nodes) if (node.type === "folder") sort(node.children)
}

/** Read-only nested view of a review's files; a leaf opens its artifact. */
export function ReviewFileTree({
  files,
  pendingPath,
  onOpen,
  onHover
}: {
  files: ReviewFile[]
  pendingPath?: string | null
  onOpen: (path: string) => void
  onHover?: (file: ReviewFile) => void
}) {
  return (
    <div className={`flex flex-col ${FILE_TREE_SCROLL}`}>
      <TreeLevel
        nodes={buildTree(files)}
        depth={0}
        pendingPath={pendingPath ?? null}
        onOpen={onOpen}
        onHover={onHover}
      />
    </div>
  )
}

function TreeLevel({
  nodes,
  depth,
  pendingPath,
  onOpen,
  onHover
}: {
  nodes: TreeNode[]
  depth: number
  pendingPath: string | null
  onOpen: (path: string) => void
  onHover?: (file: ReviewFile) => void
}) {
  return nodes.map((node) =>
    node.type === "folder" ? (
      <FolderRow
        key={`folder:${node.name}`}
        node={node}
        depth={depth}
        pendingPath={pendingPath}
        onOpen={onOpen}
        onHover={onHover}
      />
    ) : (
      <FileRow
        key={node.file.path}
        node={node}
        depth={depth}
        pending={pendingPath === node.file.path}
        onOpen={onOpen}
        onHover={onHover}
      />
    )
  )
}

// Collapse single-folder chains (a -> a/b/c) so deep paths cost one indent.
function FolderRow({
  node,
  depth,
  pendingPath,
  onOpen,
  onHover
}: {
  node: FolderNode
  depth: number
  pendingPath: string | null
  onOpen: (path: string) => void
  onHover?: (file: ReviewFile) => void
}) {
  let name = node.name
  let children = node.children
  while (children.length === 1 && children[0].type === "folder") {
    name = `${name}/${children[0].name}`
    children = children[0].children
  }

  return (
    <>
      <div
        className="flex w-full min-w-0 items-center gap-1.5 py-1 pr-3.5 text-[12px] text-muted-foreground"
        style={{ paddingLeft: `${depth * 14 + 14}px` }}
      >
        <Folder size={13} className="shrink-0 text-faint" />
        <span className="min-w-0 truncate font-medium">{name}</span>
      </div>
      <TreeLevel
        nodes={children}
        depth={depth + 1}
        pendingPath={pendingPath}
        onOpen={onOpen}
        onHover={onHover}
      />
    </>
  )
}

function FileRow({
  node,
  depth,
  pending,
  onOpen,
  onHover
}: {
  node: FileNode
  depth: number
  pending: boolean
  onOpen: (path: string) => void
  onHover?: (file: ReviewFile) => void
}) {
  const { file } = node
  const hover = onHover ? () => onHover(file) : undefined
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => onOpen(file.path)}
      onMouseEnter={hover}
      onFocus={hover}
      style={{ paddingLeft: `${depth * 14 + 14}px` }}
      className={`group flex w-full min-w-0 cursor-pointer items-center gap-2 py-1.5 pr-3.5 text-left transition-colors hover:bg-hover disabled:cursor-not-allowed ${
        pending ? "animate-pulse bg-tint/60" : ""
      }`}
    >
      <ChangeStatusIcon status={file.change_status ?? null} size={12} />
      <FileIcon name={node.name} />
      <span
        className={`min-w-0 flex-1 truncate font-mono text-[12.5px] ${
          file.artifact_id ? "text-text" : "text-muted-foreground"
        }`}
      >
        {node.name}
      </span>
      {file.approved && (
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-green">
          <Check size={12} />
          Approved
        </span>
      )}
      {pending ? (
        <Loader2 size={12} className="shrink-0 animate-spin text-blue" aria-label="Opening" />
      ) : (
        <ArrowRight
          size={13}
          className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
        />
      )}
    </button>
  )
}
