import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { Link } from "@tanstack/react-router"
import type { CommandReply, StoreProxy } from "@musubi/react"
import { Check, ChevronsUpDown, Clipboard, FileText, FolderInput, GitCompare, MoreHorizontal, Pencil, Search, Settings, Terminal, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { writeClipboard } from "../../lib/clipboard"

import { useMusubiCommand } from "../../musubi"
import { parseIso } from "../../lib/utils"
import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import { Dialog, DialogTitle } from "../../components/ui/dialog"
import { ProjectSettingsDialog } from "../ProjectSettingsDialog"
import { ProjectPickerSheet } from "./ProjectNavigation"
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
  projects,
  selectedId,
  onSelectProject,
  reviewFiles,
  onNewReview,
  onEditReview,
  onChanged,
}: {
  // Null only during the cache-seeded first frame while the live board store
  // mounts — the list still renders, interactive menus are held back.
  store: BoardStore | null
  project: BoardProject
  projects: BoardProject[]
  selectedId: string | null
  onSelectProject: (id: string) => void
  reviewFiles: ReviewFilesGrouped
  onNewReview: (kind: "files" | "diff") => void
  onEditReview: (review: BoardReview) => void
  onChanged: () => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div className="flex min-h-0 min-w-0 flex-col bg-surface lg:mr-2.5 lg:mb-2.5 lg:overflow-hidden lg:rounded-panel lg:border lg:border-hair lg:shadow-[0_1px_3px_oklch(30%_0.01_250/0.06)]">
      <div className="flex shrink-0 items-center gap-3 px-5 py-[14px] pt-4">
        {project.emoji && (
          <span aria-hidden className="shrink-0 text-lg leading-none">
            {project.emoji}
          </span>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex min-w-0 flex-1 flex-col text-left lg:pointer-events-none"
          title="Switch project"
        >
          <span className="flex w-full items-center gap-1.5">
            <span className="min-w-0 truncate text-lg font-bold tracking-[-0.02em] text-ink">
              {project.name}
            </span>
            <ChevronsUpDown size={15} className="shrink-0 text-muted lg:hidden" aria-hidden />
          </span>
          <span className="truncate font-mono text-xs text-faint">
            {project.path ?? "no reviews yet"}
          </span>
        </button>
        {store && (
          <ProjectActions
            store={store}
            project={project}
            onNewReview={onNewReview}
            onChanged={onChanged}
          />
        )}
      </div>
      <ProjectPickerSheet
        open={pickerOpen}
        projects={projects}
        selectedId={selectedId}
        onSelect={(id) => {
          onSelectProject(id)
          setPickerOpen(false)
        }}
        onClose={() => setPickerOpen(false)}
      />
      <div className="flex flex-1 flex-col divide-y divide-hair overflow-auto">
        {project.reviews.map((review) => (
          <ReviewRow
            key={review.id}
            store={store}
            review={review}
            files={filesFor(reviewFiles, review.id)}
            elsewhere={projects.filter((candidate) => candidate.id !== project.id)}
            onEdit={onEditReview}
            onDeleted={onChanged}
            onChanged={onChanged}
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
              className="grid size-[30px] place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
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
  elsewhere,
  onEdit,
  onDeleted,
  onChanged,
}: {
  store: BoardStore | null
  review: BoardReview
  files: BoardReviewFile[]
  /** Every project this review could be filed under instead of its current one. */
  elsewhere: BoardProject[]
  onEdit: (review: BoardReview) => void
  onDeleted: () => void
  onChanged: () => void
}) {
  const isDiff = review.kind === "git_diff"
  const approved = files.length > 0 && files.every((file) => file.approved)

  return (
    <div className="group flex items-center gap-3 px-5 py-3 hover:bg-soft">
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
          <span className="truncate text-sm font-semibold tracking-[-0.012em] text-ink">
            {review.name}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-[9px] gap-y-1 text-xs text-muted">
            <span
              className={`inline-flex h-[17px] items-center rounded-full px-[7px] text-2xs font-bold uppercase tracking-[0.04em] ${
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
        <span className="inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full bg-approve-soft pr-[9px] pl-[7px] text-xs font-semibold text-approve shadow-[inset_0_0_0_0.5px_var(--approve-edge)]">
          <Check size={13} strokeWidth={2.4} aria-hidden />
          Approved
        </span>
      )}
      {store && (
        <ReviewActions
          store={store}
          review={review}
          elsewhere={elsewhere}
          onEdit={onEdit}
          onDeleted={onDeleted}
          onMoved={onChanged}
        />
      )}
    </div>
  )
}

function ReviewActions({
  store,
  review,
  elsewhere,
  onEdit,
  onDeleted,
  onMoved,
}: {
  store: BoardStore
  review: BoardReview
  elsewhere: BoardProject[]
  onEdit: (review: BoardReview) => void
  onDeleted: () => void
  onMoved: () => void
}) {
  const remove = useMusubiCommand(store, "delete_review")
  const move = useMusubiCommand(store, "move_review")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [moving, setMoving] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              className="grid size-[30px] shrink-0 place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
              title="Review actions"
            >
              <MoreHorizontal size={18} aria-hidden />
            </button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem
            onClick={() => copyText(review.id, `Copied ID for “${review.name}”`, review.id)}
          >
            <Clipboard size={14} aria-hidden />
            Copy review ID
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              copyText(
                `suikou review wait ${review.id}`,
                `Copied wait command for “${review.name}”`,
                `suikou review wait ${review.id}`,
              )
            }
          >
            <Terminal size={14} aria-hidden />
            Copy wait command
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEdit(review)}>
            <Pencil size={14} aria-hidden />
            Edit review
          </DropdownMenuItem>
          {elsewhere.length > 0 && (
            <DropdownMenuItem onClick={() => setMoving(true)}>
              <FolderInput size={14} aria-hidden />
              Move to project…
            </DropdownMenuItem>
          )}
          <DropdownMenuItem destructive onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} aria-hidden />
            Delete review
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MoveReviewDialog
        open={moving}
        review={review}
        projects={elsewhere}
        onClose={() => setMoving(false)}
        onConfirm={(projectId) => {
          move
            .dispatch({ review_id: review.id, project_id: projectId })
            .then(() => {
              setMoving(false)
              onMoved()
            })
            .catch(() => setMoving(false))
        }}
      />
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

function copyText(text: string, message: string, description: string) {
  writeClipboard(text).then((ok) =>
    ok
      ? toast.success(message, { description })
      : toast.error("Copy failed"),
  )
}

function Dot() {
  return <span aria-hidden className="inline-block size-[2px] shrink-0 rounded-full bg-faint opacity-70" />
}

/** Pick the project a review should be filed under instead, then confirm. Moving
 * only changes where the review is listed — its checkout, comments and history
 * travel with it, and its scratch directory keeps the heading it was created
 * under. Picking a row only selects it; the move happens on the button, so a
 * mis-click in a long list costs nothing. The filter narrows the list without
 * clearing the pick, so the button keeps naming what it will do. */
function MoveReviewDialog({
  open,
  review,
  projects,
  onClose,
  onConfirm,
}: {
  open: boolean
  review: BoardReview
  projects: BoardProject[]
  onClose: () => void
  onConfirm: (projectId: string) => void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const pickedRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (open) {
      setPicked(null)
      setQuery("")
    }
  }, [open])

  const target = projects.find((project) => project.id === picked)
  const needle = query.trim().toLowerCase()
  const visible = needle
    ? projects.filter((project) => project.name.toLowerCase().includes(needle))
    : projects

  // Keep the highlighted row in view when the arrows walk past the fold.
  useEffect(() => {
    pickedRef.current?.scrollIntoView({ block: "nearest" })
  }, [picked])

  // Arrows walk the filtered list and Enter commits, so the whole move can be
  // done from the keyboard without the field stealing focus on open.
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      if (picked) onConfirm(picked)
      return
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    if (visible.length === 0) return
    const at = visible.findIndex((project) => project.id === picked)
    const step = event.key === "ArrowDown" ? 1 : -1
    const next = at === -1 ? (step === 1 ? 0 : visible.length - 1) : at + step
    setPicked(visible[Math.min(Math.max(next, 0), visible.length - 1)].id)
  }

  return (
    <Dialog open={open} onClose={onClose} className="sm:max-w-[420px]">
      <div className="flex flex-col gap-3 p-5">
        <DialogTitle className="text-base font-bold text-ink">
          Move “{review.name}”
        </DialogTitle>
        <p className="text-xs text-muted">
          The checkout, comments and history come along. Generated output stays where it
          already is on disk.
        </p>
        <div className="group flex h-[34px] shrink-0 items-center gap-2 rounded-ctrl border border-hair-strong bg-canvas px-2.5 focus-within:border-accent-edge">
          <Search
            size={14}
            className="shrink-0 text-faint transition-colors group-focus-within:text-muted"
            aria-hidden
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Filter projects"
            aria-label="Filter projects"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear filter"
              className="grid size-[18px] shrink-0 place-items-center rounded-full text-faint hover:bg-soft hover:text-ink"
            >
              <X size={12} aria-hidden />
            </button>
          )}
        </div>
        <div className="flex max-h-[300px] flex-col gap-0.5 overflow-auto">
          {visible.length === 0 && (
            <p className="px-2.5 py-3 text-sm text-faint">No project matches “{query}”.</p>
          )}
          {visible.map((project) => (
            <button
              key={project.id}
              ref={(node) => {
                if (project.id === picked) pickedRef.current = node
              }}
              onClick={() => setPicked(project.id)}
              onDoubleClick={() => onConfirm(project.id)}
              aria-pressed={project.id === picked}
              className={`flex items-center gap-2.5 rounded-ctrl px-2.5 py-2 text-left text-sm transition-colors ${
                project.id === picked
                  ? "bg-accent-soft text-ink shadow-[inset_0_0_0_0.5px_var(--accent-edge)]"
                  : "text-text hover:bg-soft hover:text-ink"
              }`}
            >
              <span className="w-[18px] shrink-0 text-center">{project.emoji ?? "📁"}</span>
              <span className="truncate">{project.name}</span>
              {project.id === picked && (
                <Check size={14} className="ml-auto shrink-0 text-accent" aria-hidden />
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex-1" />
          <button
            onClick={onClose}
            className="inline-flex h-[32px] items-center rounded-ctrl px-3 text-sm font-medium text-muted hover:bg-soft"
          >
            Cancel
          </button>
          <button
            onClick={() => picked && onConfirm(picked)}
            disabled={!target}
            className="inline-flex h-[32px] items-center rounded-ctrl bg-accent px-4 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            {target ? `Move to ${target.name}` : "Move review"}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function filesFor(grouped: ReviewFilesGrouped, reviewId: string): BoardReviewFile[] {
  return grouped.find((entry) => entry.review_id === reviewId)?.files ?? []
}

/** Coarse relative time (2h, 4d, 1w) for a review's created-at stamp. */
function elapsed(iso: string): string {
  const secs = Math.max(0, (Date.now() - parseIso(iso).getTime()) / 1000)
  if (secs < 60) return `${Math.floor(secs)}s`
  const mins = secs / 60
  if (mins < 60) return `${Math.floor(mins)}m`
  const hours = mins / 60
  if (hours < 24) return `${Math.floor(hours)}h`
  const days = hours / 24
  if (days < 7) return `${Math.floor(days)}d`
  return `${Math.floor(days / 7)}w`
}

