import { observer } from "mobx-react-lite"
import { Check, ChevronDown } from "lucide-react"

import { ChangeStatusIcon } from "./ChangeStatusIcon"
import { FileIcon } from "./FileIcon"
import { orderedReviewFiles } from "./file-order"
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

/**
 * Turns the current file's name into a dropdown that jumps to any file in the
 * review. The trigger reads as the file path; the menu lists every file in
 * canonical path order with its change-status glyph, type icon, and comment
 * count so the reviewer can see outstanding work at a glance. Selection is
 * delegated to the caller, which either scrolls the stacked card into view or
 * navigates to the artifact.
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
        {orderedReviewFiles(props.files).map((file) => {
          const { dir, basename } = splitPath(file.path)
          const count = props.commentCountFor(file.path)
          const isCurrent = file.path === props.currentPath
          return (
            <DropdownMenuItem key={file.path} onClick={() => props.onSelect(file)} className="gap-1.5">
              <ChangeStatusIcon status={file.change_status ?? null} size={12} />
              <FileIcon name={basename} />
              <span className="flex min-w-0 items-baseline gap-px overflow-hidden font-mono text-[12px]">
                {dir && (
                  <span className="min-w-0 truncate text-faint" aria-hidden>
                    {dir}
                  </span>
                )}
                <span className="shrink-0 truncate font-medium">{basename}</span>
              </span>
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
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
