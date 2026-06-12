import { ArrowRight, Check, Folder } from "lucide-react"

import { FileIcon } from "./FileIcon"

interface ReviewFile {
  artifact_id: string
  path: string
  approved: boolean
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
  onOpen
}: {
  files: ReviewFile[]
  onOpen: (artifactId: string) => void
}) {
  return (
    <div className="flex flex-col">
      <TreeLevel nodes={buildTree(files)} depth={0} onOpen={onOpen} />
    </div>
  )
}

function TreeLevel({
  nodes,
  depth,
  onOpen
}: {
  nodes: TreeNode[]
  depth: number
  onOpen: (artifactId: string) => void
}) {
  return nodes.map((node) =>
    node.type === "folder" ? (
      <FolderRow key={`folder:${node.name}`} node={node} depth={depth} onOpen={onOpen} />
    ) : (
      <FileRow key={node.file.artifact_id} node={node} depth={depth} onOpen={onOpen} />
    )
  )
}

// Collapse single-folder chains (a -> a/b/c) so deep paths cost one indent.
function FolderRow({
  node,
  depth,
  onOpen
}: {
  node: FolderNode
  depth: number
  onOpen: (artifactId: string) => void
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
      <TreeLevel nodes={children} depth={depth + 1} onOpen={onOpen} />
    </>
  )
}

function FileRow({
  node,
  depth,
  onOpen
}: {
  node: FileNode
  depth: number
  onOpen: (artifactId: string) => void
}) {
  const { file } = node
  return (
    <button
      type="button"
      onClick={() => onOpen(file.artifact_id)}
      style={{ paddingLeft: `${depth * 14 + 14}px` }}
      className="group flex w-full min-w-0 items-center gap-2 py-1.5 pr-3.5 text-left transition-colors hover:bg-hover pointer-coarse:min-h-11"
    >
      <FileIcon name={node.name} />
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-text">{node.name}</span>
      {file.approved && (
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-green">
          <Check size={12} />
          Approved
        </span>
      )}
      <ArrowRight
        size={13}
        className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  )
}
