import type { StoreProxy } from "@musubi/react"
import { useEffect, useMemo, useState } from "react"
import { ArrowDownUp, MessageSquare, MessageSquarePlus } from "lucide-react"

import { scrollBehavior } from "../../lib/utils"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu"
import { FileCommentComposer } from "./comments/FileCommentComposer"
import { SideCommentCard } from "./comments/SideCommentCard"
import { safeDraft, type Comment, type CommentsStoreProxy } from "./comments/shared"

type HighlightRange = { start: number; end: number } | null
type SortOrder = "newest" | "oldest"
type FileStoreProxy = StoreProxy<"SuikouWeb.Stores.FileStore", Musubi.Stores>

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
]

export function SideRail({
  comments,
  commentsProxy,
  fileProxy,
  fileCommentDraftKey,
  storageKey,
  onHoverRange,
  onFocus,
}: {
  comments: Comment[]
  commentsProxy: CommentsStoreProxy | null
  fileProxy: FileStoreProxy | null
  fileCommentDraftKey: string | null
  storageKey: string | null
  onHoverRange: (range: HighlightRange) => void
  onFocus: (comment: Comment) => void
}) {
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => readSortOrder(storageKey))
  const [fileComposing, setFileComposing] = useState(() => hasDraftBody(fileCommentDraftKey))
  const sortedComments = useMemo(() => {
    const direction = sortOrder === "newest" ? -1 : 1
    return [...comments].sort((a, b) => direction * (commentTime(a) - commentTime(b)))
  }, [comments, sortOrder])

  useEffect(() => {
    setSortOrder(readSortOrder(storageKey))
  }, [storageKey])

  useEffect(() => {
    setFileComposing(hasDraftBody(fileCommentDraftKey))
  }, [fileCommentDraftKey])

  useEffect(() => {
    if (storageKey === null) return
    localStorage.setItem(storageKey, sortOrder)
  }, [storageKey, sortOrder])

  const focusLine = (comment: Comment) => {
    onHoverRange(commentRange(comment))
    onFocus(comment)
    scrollToCommentAnchor(comment)
  }
  const selectedSortLabel = SORT_OPTIONS.find((option) => option.value === sortOrder)?.label ?? "Newest first"

  return (
    <aside className="hidden min-h-0 flex-col lg:flex">
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-hair px-3">
        <MessageSquare size={15} className="text-muted" aria-hidden />
        <h3 className="text-xs font-bold tracking-[-0.01em] text-ink">Comments</h3>
        <span className="rounded-full bg-soft px-2 py-0.5 text-2xs font-bold text-muted tabular-nums">{comments.length}</span>
        <span className="flex-1" />
        {fileProxy && fileCommentDraftKey && (
          <button
            type="button"
            onClick={() => setFileComposing(true)}
            title="Comment on this file"
            className="grid size-[26px] place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
          >
            <MessageSquarePlus size={14} aria-hidden />
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                title={`Sort: ${selectedSortLabel}`}
                aria-label={`Sort comments: ${selectedSortLabel}`}
                className="grid size-[26px] place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink focus:ring-2 focus:ring-accent-edge focus:outline-none"
              >
                <ArrowDownUp size={14} aria-hidden />
              </button>
            }
          />
          <DropdownMenuContent align="end">
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                selected={option.value === sortOrder}
                onClick={() => setSortOrder(option.value)}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {fileComposing && fileProxy && fileCommentDraftKey && (
        <div className="shrink-0 border-b border-hair p-2">
          <FileCommentComposer
            fileProxy={fileProxy}
            draftKey={fileCommentDraftKey}
            onClose={() => setFileComposing(false)}
          />
        </div>
      )}
      <div
        className="min-h-0 flex-1 overflow-auto p-2"
        aria-label={`Comments sorted by ${selectedSortLabel.toLowerCase()}`}
      >
        {sortedComments.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <div className="flex flex-col items-center gap-2.5">
              <div className="grid size-[38px] place-items-center rounded-[12px] border border-hair-strong bg-soft text-muted shadow-[inset_0_0.5px_0_var(--edge-top-2)]">
                <MessageSquare size={16} aria-hidden />
              </div>
              <div className="text-xs font-semibold text-ink">No comments on this file</div>
              <div className="max-w-[24ch] text-xs leading-[1.45] text-muted">Click a line's gutter to start a new thread.</div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sortedComments.map((comment) => (
              <SideCommentCard
                key={comment.id}
                comment={comment}
                commentsProxy={commentsProxy}
                onFocusLine={() => focusLine(comment)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function commentRange(comment: Comment | null): HighlightRange {
  return comment?.anchor?.type === "line_range"
    ? { start: comment.anchor.start_line, end: comment.anchor.end_line }
    : null
}

function readSortOrder(storageKey: string | null): SortOrder {
  if (!storageKey) return "newest"
  return localStorage.getItem(storageKey) === "oldest" ? "oldest" : "newest"
}

function hasDraftBody(draftKey: string | null): boolean {
  return safeDraft(draftKey ? localStorage.getItem(draftKey) : null)?.body.trim().length ? true : false
}

function commentTime(comment: Comment): number {
  return Date.parse(comment.inserted_at) || 0
}

function scrollToCommentAnchor(comment: Comment) {
  if (comment.anchor?.type !== "line_range") return
  document
    .querySelector(`[data-review-line="${comment.anchor.start_line}"]`)
    ?.scrollIntoView({ block: "center", behavior: scrollBehavior() })
}
