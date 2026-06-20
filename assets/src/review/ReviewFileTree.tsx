import { ArrowRight, Check, Loader2 } from "lucide-react"

import { ChangeStatusIcon, type ChangeStatus } from "./ChangeStatusIcon"
import { FileIcon } from "./FileIcon"
import { FILE_TREE_SCROLL } from "./file-tree-scroll"

interface ReviewFile {
  path: string
  artifact_id: string | null
  approved: boolean
  change_status?: ChangeStatus
}

function splitPath(path: string): { dir: string; basename: string } {
  const slash = path.lastIndexOf("/")
  return slash === -1
    ? { dir: "", basename: path }
    : { dir: path.slice(0, slash + 1), basename: path.slice(slash + 1) }
}

/** Read-only flat list of a review's files in path order; a row opens its artifact. */
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
  const ordered = [...files].sort((a, b) => a.path.localeCompare(b.path))
  return (
    <div className={`flex flex-col ${FILE_TREE_SCROLL}`}>
      {ordered.map((file) => (
        <FileRow
          key={file.path}
          file={file}
          pending={pendingPath === file.path}
          onOpen={onOpen}
          onHover={onHover}
        />
      ))}
    </div>
  )
}

function FileRow({
  file,
  pending,
  onOpen,
  onHover
}: {
  file: ReviewFile
  pending: boolean
  onOpen: (path: string) => void
  onHover?: (file: ReviewFile) => void
}) {
  const { dir, basename } = splitPath(file.path)
  const hover = onHover ? () => onHover(file) : undefined
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => onOpen(file.path)}
      onMouseEnter={hover}
      onFocus={hover}
      className={`group flex w-full min-w-0 cursor-pointer items-center gap-2 py-1.5 pl-3.5 pr-3.5 text-left transition-colors hover:bg-hover disabled:cursor-not-allowed ${
        pending ? "animate-pulse bg-tint/60" : ""
      }`}
    >
      <ChangeStatusIcon status={file.change_status ?? null} size={12} />
      <FileIcon name={basename} />
      <span className="flex min-w-0 flex-1 items-baseline gap-px overflow-hidden font-mono text-[12.5px]">
        {dir && (
          <span className="min-w-0 truncate text-faint" aria-hidden>
            {dir}
          </span>
        )}
        <span className={`shrink-0 truncate ${file.artifact_id ? "text-text" : "text-muted-foreground"}`}>
          {basename}
        </span>
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
