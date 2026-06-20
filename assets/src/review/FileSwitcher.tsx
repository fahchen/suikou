import { observer } from "mobx-react-lite"
import { ChevronDown } from "lucide-react"

import { FileIcon } from "./FileIcon"
import { ReviewFileTree } from "./ReviewFileTree"
import { type ReviewFileEntry } from "./types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"

function splitPath(path: string): { dir: string; basename: string } {
  const slash = path.lastIndexOf("/")
  return slash === -1
    ? { dir: "", basename: path }
    : { dir: path.slice(0, slash + 1), basename: path.slice(slash + 1) }
}

/**
 * Turns the current file's name into a dropdown that jumps to any file in the
 * review. The trigger reads as the file path; the menu lists every file via the
 * shared `ReviewFileTree`, so each row's change-status glyph, type icon, comment
 * count, and verdict match the board's expanded preview exactly.
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
        <ReviewFileTree
          variant="menu"
          files={props.files}
          currentPath={props.currentPath}
          commentCountFor={props.commentCountFor}
          onSelect={props.onSelect}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
