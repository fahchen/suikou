import { useState } from "react"
import { Link } from "@tanstack/react-router"
import type { CommandReply, StoreProxy } from "@musubi/react"
import { Check, FileText, GitCompare, MoreHorizontal, Pencil, Settings, Trash2 } from "lucide-react"

import { useMusubiCommand } from "../../musubi"
import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import { ProjectSettingsDialog } from "../ProjectSettingsDialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"

type BoardStore = StoreProxy<"SuikouWeb.Stores.ProjectBoardStore", Musubi.Stores>
type LoadBoardReply = CommandReply<"SuikouWeb.Stores.ProjectBoardStore", "load_board", Musubi.Stores>
type BoardProject = LoadBoardReply["projects"][number]
type BoardReview = BoardProject["reviews"][number]
type ReviewFilesGrouped = LoadBoardReply["review_files"]
type BoardReviewFile = ReviewFilesGrouped[number]["files"][number]

export function ReviewPane({
  store,
  project,
  reviewFiles,
  onNewReview,
  onEditReview,
  onChanged,
}: {
  store: BoardStore
  project: BoardProject
  reviewFiles: ReviewFilesGrouped
  onNewReview: (kind: "files" | "diff") => void
  onEditReview: (review: BoardReview) => void
  onChanged: () => void
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col bg-canvas">
      <div className="flex shrink-0 items-center gap-3 border-b border-hair px-5 py-[14px] pt-4">
        {project.emoji && (
          <span aria-hidden className="shrink-0 text-[18px] leading-none">
            {project.emoji}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[17px] font-bold tracking-[-0.02em] text-ink">
            {project.name}
          </span>
          <span className="truncate font-mono text-[11px] text-faint">{project.path}</span>
        </div>
        <ProjectActions
          store={store}
          project={project}
          onNewReview={onNewReview}
          onChanged={onChanged}
        />
      </div>
      <div className="flex flex-1 flex-col gap-[9px] overflow-auto px-4 pt-[14px] pb-[18px]">
        {project.reviews.map((review) => (
          <ReviewRow
            key={review.id}
            store={store}
            review={review}
            files={filesFor(reviewFiles, review.id)}
            onEdit={onEditReview}
            onDeleted={onChanged}
          />
        ))}
      </div>
    </div>
  )
}

function ProjectActions({
  store,
  project,
  onNewReview,
  onChanged,
}: {
  store: BoardStore
  project: BoardProject
  onNewReview: (kind: "files" | "diff") => void
  onChanged: () => void
}) {
  const remove = useMusubiCommand(store, "delete_project")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              className="grid size-[30px] cursor-pointer place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
              title="Project actions"
            >
              <MoreHorizontal size={18} aria-hidden />
            </button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => onNewReview("files")}>
            <FileText size={14} aria-hidden />
            Create file review
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNewReview("diff")}>
            <GitCompare size={14} aria-hidden />
            Create diff review
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
            <Settings size={14} aria-hidden />
            Project settings
          </DropdownMenuItem>
          <DropdownMenuItem destructive onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} aria-hidden />
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProjectSettingsDialog
        store={store}
        project={project}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={onChanged}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${project.name}?`}
        body="This removes the project and its reviews from Suikou. The files on disk are left untouched."
        confirmLabel="Delete project"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          remove
            .dispatch({ project_id: project.id })
            .then(() => {
              setConfirmDelete(false)
              onChanged()
            })
            .catch(() => {})
        }}
      />
    </>
  )
}

function ReviewRow({
  store,
  review,
  files,
  onEdit,
  onDeleted,
}: {
  store: BoardStore
  review: BoardReview
  files: BoardReviewFile[]
  onEdit: (review: BoardReview) => void
  onDeleted: () => void
}) {
  const isDiff = review.kind === "git_diff"
  const approved = files.length > 0 && files.every((file) => file.approved)

  return (
    <div className="group flex items-center gap-3 rounded-panel px-3 py-[11px] pl-[13px] hover:bg-surface hover:shadow-[inset_0_0_0_1px_var(--hair-strong)]">
      <Link
        to="/reviews/$reviewId"
        params={{ reviewId: review.id }}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          aria-hidden
          title={isDiff ? "Git diff review" : "File selection review"}
          className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-soft text-text shadow-[inset_0_0_0_0.5px_var(--hair-strong)]"
        >
          {isDiff ? <GitCompare size={18} strokeWidth={1.8} /> : <FileText size={18} strokeWidth={1.7} />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="truncate text-[13.5px] font-semibold tracking-[-0.012em] text-ink">
            {review.name}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-[9px] gap-y-1 text-[11.5px] text-muted">
            <span
              className={`inline-flex h-[17px] items-center rounded-full px-[7px] text-[10px] font-bold uppercase tracking-[0.04em] ${
                isDiff
                  ? "bg-accent-soft text-accent-bright shadow-[inset_0_0_0_0.5px_var(--accent-edge)]"
                  : "bg-soft text-muted shadow-[inset_0_0_0_0.5px_var(--hair-strong)]"
              }`}
            >
              {isDiff ? "Diff" : "Files"}
            </span>
            {isDiff && review.base_ref && (
              <>
                <span className="font-mono">
                  {review.base_ref}
                  <span className="text-faint">..</span>
                  {review.head_ref}
                </span>
                <Dot />
              </>
            )}
            <span className="font-mono tabular-nums">
              {files.length} {files.length === 1 ? "file" : "files"}
            </span>
            <Dot />
            <span className="font-mono tabular-nums text-faint">{elapsed(review.inserted_at)}</span>
          </span>
        </span>
      </Link>
      {approved && (
        <span className="inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full bg-approve-soft pr-[9px] pl-[7px] text-[11px] font-semibold text-approve shadow-[inset_0_0_0_0.5px_var(--approve-edge)]">
          <Check size={13} strokeWidth={2.4} aria-hidden />
          Approved
        </span>
      )}
      <ReviewActions store={store} review={review} onEdit={onEdit} onDeleted={onDeleted} />
    </div>
  )
}

function ReviewActions({
  store,
  review,
  onEdit,
  onDeleted,
}: {
  store: BoardStore
  review: BoardReview
  onEdit: (review: BoardReview) => void
  onDeleted: () => void
}) {
  const remove = useMusubiCommand(store, "delete_review")
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              className="grid size-[30px] shrink-0 cursor-pointer place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
              title="Review actions"
            >
              <MoreHorizontal size={18} aria-hidden />
            </button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => onEdit(review)}>
            <Pencil size={14} aria-hidden />
            Edit review
          </DropdownMenuItem>
          <DropdownMenuItem destructive onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} aria-hidden />
            Delete review
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${review.name}?`}
        body="This removes the review from Suikou. The files on disk are left untouched."
        confirmLabel="Delete review"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          remove
            .dispatch({ review_id: review.id })
            .then(() => {
              setConfirmDelete(false)
              onDeleted()
            })
            .catch(() => {})
        }}
      />
    </>
  )
}

function Dot() {
  return <span aria-hidden className="inline-block size-[2px] shrink-0 rounded-full bg-faint opacity-70" />
}

function filesFor(grouped: ReviewFilesGrouped, reviewId: string): BoardReviewFile[] {
  return grouped.find((entry) => entry.review_id === reviewId)?.files ?? []
}

/** Coarse relative time (2h, 4d, 1w) for a review's created-at stamp. */
function elapsed(iso: string): string {
  const stamp = /Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`
  const secs = Math.max(0, (Date.now() - new Date(stamp).getTime()) / 1000)
  if (secs < 60) return `${Math.floor(secs)}s`
  const mins = secs / 60
  if (mins < 60) return `${Math.floor(mins)}m`
  const hours = mins / 60
  if (hours < 24) return `${Math.floor(hours)}h`
  const days = hours / 24
  if (days < 7) return `${Math.floor(days)}d`
  return `${Math.floor(days / 7)}w`
}

