import type { ReviewFileEntry } from "./types"

interface FileNode {
  type: "file"
  name: string
  entry: ReviewFileEntry
}

interface FolderNode {
  type: "folder"
  name: string
  children: TreeNode[]
}

type TreeNode = FileNode | FolderNode

/**
 * Flattens a review's files into the exact order the artifact-switcher tree
 * presents them: depth-first, folders before files at each level, each group
 * alphabetical by name. This is NOT the same as sorting full paths, so prev/next
 * stepping stays in lockstep with what the file tree shows.
 *
 * ## Examples
 *
 *     orderedReviewFiles([{ path: "a.txt" }, { path: "dir/b.txt" }])
 *     //=> [{ path: "dir/b.txt" }, { path: "a.txt" }]
 */
export function orderedReviewFiles(
  files: ReadonlyArray<ReviewFileEntry>
): ReviewFileEntry[] {
  const root: FolderNode = { type: "folder", name: "", children: [] }
  for (const entry of files) {
    const parts = entry.path.split("/")
    let dir = root
    for (const segment of parts.slice(0, -1)) {
      let next = dir.children.find(
        (c): c is FolderNode => c.type === "folder" && c.name === segment
      )
      if (!next) {
        next = { type: "folder", name: segment, children: [] }
        dir.children.push(next)
      }
      dir = next
    }
    dir.children.push({ type: "file", name: parts[parts.length - 1], entry })
  }
  sortNodes(root.children)
  return flatten(root.children)
}

/**
 * Returns the files immediately before/after the one matching `artifactId` in
 * tree order. Yields `null` at each end, or for both when the artifact isn't in
 * the list (so callers can simply disable the corresponding control).
 *
 * ## Examples
 *
 *     adjacentReviewFiles(files, "art-2")
 *     //=> { prev: <entry art-1>, next: <entry art-3> }
 */
export function adjacentReviewFiles(
  files: ReadonlyArray<ReviewFileEntry>,
  artifactId: string
): { prev: ReviewFileEntry | null; next: ReviewFileEntry | null } {
  const ordered = orderedReviewFiles(files)
  const index = ordered.findIndex((f) => f.artifact_id === artifactId)
  if (index === -1) return { prev: null, next: null }
  return {
    prev: index > 0 ? ordered[index - 1] : null,
    next: index < ordered.length - 1 ? ordered[index + 1] : null
  }
}

// Folders before files, each alphabetical by name — mirrors the tree popover.
function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) =>
    a.type !== b.type ? (a.type === "folder" ? -1 : 1) : a.name.localeCompare(b.name)
  )
  for (const node of nodes) if (node.type === "folder") sortNodes(node.children)
}

function flatten(nodes: ReadonlyArray<TreeNode>): ReviewFileEntry[] {
  const out: ReviewFileEntry[] = []
  for (const node of nodes) {
    if (node.type === "folder") out.push(...flatten(node.children))
    else out.push(node.entry)
  }
  return out
}
