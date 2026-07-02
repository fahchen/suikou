import { observer } from "mobx-react-lite"
import { Folder, Loader2 } from "lucide-react"

import { ChangeStatusIcon, type ChangeStatus } from "./ChangeStatusIcon"
import { FileIcon } from "./FileIcon"
import { VerdictIcon } from "./TopBarVerdictMenu"
import { FILE_TREE_SCROLL } from "./file-tree-scroll"
import { VERDICT_META, type Verdict } from "./types"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

/** Minimal file shape both the board list and the in-review switcher share. */
export interface ReviewFileRow {
  path: string
  artifact_id: string | null
  verdict: Verdict | null
  change_status?: ChangeStatus | null
  /** Diff review only: added/deleted line counts from `git diff --numstat`;
   * both `null` for a file-selection review or a binary diff. */
  added?: number | null
  deleted?: number | null
}

/** `menu` renders dropdown items inside a switcher popup; `list` renders plain
 * buttons for the board's expanded preview. */
type Variant = "menu" | "list"

interface FileLeaf<F> {
  type: "file"
  name: string
  file: F
}

interface FolderNode<F> {
  type: "folder"
  name: string
  children: TreeNode<F>[]
}

type TreeNode<F> = FileLeaf<F> | FolderNode<F>

function buildTree<F extends ReviewFileRow>(files: F[]): TreeNode<F>[] {
  const root: FolderNode<F> = { type: "folder", name: "", children: [] }

  for (const file of files) {
    const parts = file.path.split("/")
    let dir = root

    for (const segment of parts.slice(0, -1)) {
      let next = dir.children.find(
        (child): child is FolderNode<F> => child.type === "folder" && child.name === segment
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

function sortTree<F>(nodes: TreeNode<F>[]): void {
  nodes.sort((a, b) =>
    a.type !== b.type ? (a.type === "folder" ? -1 : 1) : a.name.localeCompare(b.name)
  )
  for (const node of nodes) if (node.type === "folder") sortTree(node.children)
}

interface RowProps<F extends ReviewFileRow> {
  variant: Variant
  currentPath?: string | null
  pendingPath?: string | null
  commentCountFor?: (path: string) => number
  onSelect: (file: F) => void
  onHover?: (file: F) => void
}

/**
 * Nested file tree shared by the in-review switcher (`menu`) and the board's
 * expanded review preview (`list`). Both render the same row chrome — change
 * status, type icon, path, and the colored verdict glyph — so a file's verdict
 * reads identically wherever it appears. Selection and hover are delegated to
 * the caller, which opens the artifact or warms its cache.
 */
export const ReviewFileTree = observer(function ReviewFileTree<F extends ReviewFileRow>(
  props: { files: F[] } & RowProps<F>
) {
  const rows = renderLevel(buildTree(props.files), 0, props)
  return props.variant === "list" ? (
    <div className={`flex flex-col ${FILE_TREE_SCROLL}`}>{rows}</div>
  ) : (
    <>{rows}</>
  )
})

function renderLevel<F extends ReviewFileRow>(
  nodes: TreeNode<F>[],
  depth: number,
  props: RowProps<F>
): React.ReactNode[] {
  const baseIndent = props.variant === "list" ? 14 : 8
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
          className="flex min-w-0 items-center gap-1.5 py-1 pr-3.5 text-[12px] text-muted-foreground"
          style={{ paddingLeft: `${depth * 14 + baseIndent}px` }}
        >
          <Folder size={13} className="shrink-0 text-faint" />
          <span className="min-w-0 truncate font-medium">{name}</span>
        </div>,
        ...renderLevel(children, depth + 1, props)
      ]
    }
    return [
      <FileLeafRow
        key={node.file.path}
        file={node.file}
        name={node.name}
        indent={`${depth * 14 + baseIndent}px`}
        props={props}
      />
    ]
  })
}

function FileLeafRow<F extends ReviewFileRow>({
  file,
  name,
  indent,
  props
}: {
  file: F
  name: string
  indent: string
  props: RowProps<F>
}) {
  const hover = props.onHover ? () => props.onHover?.(file) : undefined
  const isCurrent = props.currentPath != null && file.path === props.currentPath
  const inner = (
    <>
      <ChangeStatusIcon status={file.change_status ?? null} size={12} />
      <FileIcon name={name} />
      <span
        className={`min-w-0 flex-1 truncate font-mono text-[12px] ${
          isCurrent
            ? "font-medium text-blue"
            : file.artifact_id
              ? "text-text"
              : "text-muted-foreground"
        }`}
      >
        {name}
      </span>
      <Trailing file={file} props={props} />
    </>
  )

  if (props.variant === "menu") {
    return (
      <DropdownMenuItem
        onClick={() => props.onSelect(file)}
        onMouseEnter={hover}
        aria-current={isCurrent ? "true" : undefined}
        className={`gap-1.5 ${isCurrent ? "bg-blue-soft" : ""}`}
        style={{ paddingLeft: indent }}
      >
        {inner}
      </DropdownMenuItem>
    )
  }

  const pending = props.pendingPath != null && file.path === props.pendingPath
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => props.onSelect(file)}
      onMouseEnter={hover}
      onFocus={hover}
      aria-current={isCurrent ? "true" : undefined}
      style={{ paddingLeft: indent }}
      className={`group flex w-full min-w-0 cursor-pointer items-center gap-2 py-1.5 pr-3.5 text-left transition-colors hover:bg-hover disabled:cursor-not-allowed ${
        pending ? "animate-pulse bg-tint/60" : isCurrent ? "bg-blue-soft" : ""
      }`}
    >
      {inner}
    </button>
  )
}

function Trailing<F extends ReviewFileRow>({ file, props }: { file: F; props: RowProps<F> }) {
  const count = props.commentCountFor?.(file.path) ?? 0
  const pending = props.pendingPath != null && file.path === props.pendingPath
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5">
      <DiffDeltas added={file.added ?? null} deleted={file.deleted ?? null} size="sm" />
      {count > 0 && (
        <span
          aria-label={`${count} ${count === 1 ? "comment" : "comments"}`}
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-tint px-1.5 font-mono text-[10px] tabular-nums text-muted-foreground ring-1 ring-inset ring-line-soft"
        >
          {count}
        </span>
      )}
      {file.verdict && (
        <span title={VERDICT_META[file.verdict].label} aria-label={VERDICT_META[file.verdict].label}>
          <VerdictIcon verdict={file.verdict} size={13} />
        </span>
      )}
      {props.variant === "list" && pending && (
        <Loader2 size={12} className="shrink-0 animate-spin text-blue" aria-label="Opening" />
      )}
    </span>
  )
}

/**
 * Per-file `+N / −M` chip for a git_diff review row. Both counts null (binary
 * file, or a non-diff review) renders nothing; a zero count is skipped so a
 * pure-addition/pure-deletion file only shows the meaningful side. Colors ride
 * the shared `--color-green` / `--color-red` tokens so all 13 themes agree.
 *
 * `size="md"` (default) matches the file-head chip (11px / gap 7px); `"sm"` is
 * the tighter chip used inside navigator rows (10px / gap 5px per the
 * `.frow .deltas` mockup rule).
 */
export function DiffDeltas({
  added,
  deleted,
  size = "md"
}: {
  added: number | null
  deleted: number | null
  size?: "sm" | "md"
}) {
  if (added == null && deleted == null) return null
  const showAdded = added != null && added > 0
  const showDeleted = deleted != null && deleted > 0
  if (!showAdded && !showDeleted) return null
  const label = [
    showAdded ? `${added} added` : null,
    showDeleted ? `${deleted} deleted` : null
  ]
    .filter(Boolean)
    .join(", ")
  const scale =
    size === "sm" ? "gap-[5px] text-[10px]" : "gap-[7px] text-[11px]"
  return (
    <span
      aria-label={label}
      className={`inline-flex shrink-0 items-center font-mono font-[720] tabular-nums ${scale}`}
    >
      {showAdded && <span className="text-green">+{added}</span>}
      {showDeleted && <span className="text-red">−{deleted}</span>}
    </span>
  )
}
