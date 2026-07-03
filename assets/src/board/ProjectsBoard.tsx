import { useEffect, useRef, useState, type ReactNode } from "react"
import type { CommandReply, StoreProxy } from "@musubi/react"
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  FileText,
  Folder,
  GitCompare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
} from "lucide-react"

import { storeCache, useMusubiCommand, useMusubiRoot, useSocketConnected } from "../musubi"
import { uiStore } from "../stores/ui-store"
import { SettingsModal } from "../settings/SettingsModal"
import { Dialog, DialogTitle } from "../components/ui/dialog"
import { CreateProjectDialog } from "./CreateProjectDialog"
import { NewReviewDialog } from "./NewReviewDialog"
import { ProjectSettingsDialog } from "./ProjectSettingsDialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu"

type BoardStore = StoreProxy<"SuikouWeb.Stores.ProjectBoardStore", Musubi.Stores>
type LoadBoardReply = CommandReply<"SuikouWeb.Stores.ProjectBoardStore", "load_board", Musubi.Stores>
type BoardProject = LoadBoardReply["projects"][number]
type BoardReview = BoardProject["reviews"][number]
type ReviewFilesGrouped = LoadBoardReply["review_files"]
type BoardReviewFile = ReviewFilesGrouped[number]["files"][number]

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

function filesFor(grouped: ReviewFilesGrouped, reviewId: string): BoardReviewFile[] {
  return grouped.find((entry) => entry.review_id === reviewId)?.files ?? []
}

// Persist the last-good load_board reply so a reload (or a fresh tab) paints the
// projects on the first frame, then the command revalidates in the background —
// stale-while-revalidate, no loading flash. `BOARD_CACHE_BUSTER` is the reply's
// shape version; bump it when the load_board contract changes.
const BOARD_CACHE_KEY = "suikou-board"
const BOARD_CACHE_BUSTER = "v1"

function readBoardCache(): LoadBoardReply | null {
  try {
    const raw = localStorage.getItem(BOARD_CACHE_KEY)
    if (!raw) return null
    const entry = JSON.parse(raw) as { buster: string; data: LoadBoardReply }
    return entry.buster === BOARD_CACHE_BUSTER ? entry.data : null
  } catch {
    return null
  }
}

function writeBoardCache(data: LoadBoardReply): void {
  try {
    localStorage.setItem(BOARD_CACHE_KEY, JSON.stringify({ buster: BOARD_CACHE_BUSTER, data }))
  } catch {
    // Quota or serialization failure: skip the cache; the command still revalidates.
  }
}

/** Projects launcher: a project sidebar and the selected project's review list,
 * under a minimal toolbar. Full-viewport, no window frame. Read + navigate only. */
export function ProjectsBoard() {
  const root = useMusubiRoot({
    module: "SuikouWeb.Stores.ProjectBoardStore",
    id: "board",
    params: {},
    cache: storeCache,
  })

  if (root.status === "loading") {
    // A warm cache resolves the mount in a microtask, so show a transparent
    // placeholder instead of flashing the loading screen over the chrome.
    return readBoardCache() ? <div aria-hidden className="h-screen" /> : <Centered>Loading projects…</Centered>
  }
  if (root.status === "error") {
    return <Centered>Can't reach Suikou. {root.error.message}</Centered>
  }
  return <Board store={root.store} />
}

function Board({ store }: { store: BoardStore }) {
  const loadBoard = useMusubiCommand(store, "load_board")
  const connected = useSocketConnected()
  const [board, setBoard] = useState<LoadBoardReply | null>(() => readBoardCache())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const boardRef = useRef<LoadBoardReply | null>(null)
  boardRef.current = board

  useEffect(() => {
    if (board === null) return
    if (board.projects.length === 0) {
      setSelectedId(null)
      return
    }
    if (selectedId === null || !board.projects.some((p) => p.id === selectedId)) {
      setSelectedId(board.projects[0].id)
    }
  }, [board, selectedId])

  useEffect(() => {
    if (!connected) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let attempts = 0
    const attempt = () => {
      loadBoard
        .dispatch({})
        .then((reply) => {
          if (cancelled) return
          setBoard(reply)
          writeBoardCache(reply)
        })
        .catch(() => {
          if (cancelled) return
          attempts += 1
          if (boardRef.current === null && attempts < 6) timer = setTimeout(attempt, 400)
        })
    }
    attempt()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  const [creatingProject, setCreatingProject] = useState(false)
  const [newReviewKind, setNewReviewKind] = useState<"files" | "diff" | null>(null)
  const [editingReview, setEditingReview] = useState<BoardReview | null>(null)
  const refetch = () => {
    loadBoard
      .dispatch({})
      .then((reply) => {
        setBoard(reply)
        writeBoardCache(reply)
      })
      .catch(() => {})
  }

  const projects = board?.projects ?? []
  const selected = projects.find((p) => p.id === selectedId) ?? null

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas text-ink">
      <Toolbar
        onNewProject={() => setCreatingProject(true)}
        onNewReview={setNewReviewKind}
        canNewReview={selected !== null}
      />
      <MobileProjectBar projects={projects} selectedId={selectedId} onSelect={setSelectedId} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[248px_1fr]">
        <Sidebar projects={projects} selectedId={selectedId} onSelect={setSelectedId} />
        {selected && (
          <ReviewPane
            store={store}
            project={selected}
            reviewFiles={board?.review_files ?? []}
            onNewReview={setNewReviewKind}
            onEditReview={setEditingReview}
            onChanged={refetch}
          />
        )}
      </div>
      <CreateProjectDialog
        store={store}
        open={creatingProject}
        onClose={() => setCreatingProject(false)}
        onCreated={refetch}
      />
      {selected && (
        <NewReviewDialog
          store={store}
          project={selected}
          kind={
            editingReview
              ? editingReview.kind === "git_diff"
                ? "diff"
                : "files"
              : (newReviewKind ?? "files")
          }
          review={editingReview}
          open={newReviewKind !== null || editingReview !== null}
          onClose={() => {
            setNewReviewKind(null)
            setEditingReview(null)
          }}
          onCreated={refetch}
        />
      )}
      <SettingsModal />
    </div>
  )
}

/** Mobile project switcher: a single sticky bar showing the current project;
 * tapping opens a searchable bottom sheet. Hidden at lg where the sidebar
 * takes over. */
function MobileProjectBar({
  projects,
  selectedId,
  onSelect,
}: {
  projects: BoardProject[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = projects.find((p) => p.id === selectedId) ?? null
  return (
    <div className="shrink-0 border-b border-hair-strong bg-surface px-3 py-2 lg:hidden">
      <button
        onClick={() => setOpen(true)}
        disabled={projects.length === 0}
        className="flex h-[38px] w-full items-center gap-2.5 rounded-ctrl border border-hair-strong bg-canvas px-3 text-left disabled:opacity-60"
      >
        {selected ? (
          <ProjectGlyph project={selected} size={16} active />
        ) : (
          <Folder size={16} strokeWidth={1.7} className="text-muted" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
          {selected?.name ?? "No projects"}
        </span>
        <ChevronsUpDown size={15} className="shrink-0 text-muted" aria-hidden />
      </button>
      <ProjectPickerSheet
        open={open}
        projects={projects}
        selectedId={selectedId}
        onSelect={(id) => {
          onSelect(id)
          setOpen(false)
        }}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}

/** Bottom-sheet project picker with a search filter, for mobile. */
function ProjectPickerSheet({
  open,
  projects,
  selectedId,
  onSelect,
  onClose,
}: {
  open: boolean
  projects: BoardProject[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (open) setQuery("")
  }, [open])

  const needle = query.trim().toLowerCase()
  const filtered = needle
    ? projects.filter((p) => p.name.toLowerCase().includes(needle))
    : projects

  return (
    <Dialog open={open} onClose={onClose} className="max-h-[70vh] sm:max-w-[420px]">
        <div className="flex items-center gap-2 border-b border-hair px-3 py-3">
          <Search size={15} className="shrink-0 text-faint" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects…"
            className="h-[26px] flex-1 bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none"
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto p-2">
          {filtered.map((project) => {
            const active = project.id === selectedId
            return (
              <button
                key={project.id}
                onClick={() => onSelect(project.id)}
                aria-current={active ? "true" : undefined}
                className={`flex h-[42px] shrink-0 items-center gap-2.5 rounded-ctrl px-3 text-left text-[13.5px] ${
                  active ? "bg-accent-soft font-semibold text-accent-bright" : "text-text hover:bg-soft"
                }`}
              >
                <ProjectGlyph project={project} size={17} active={active} />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {active && <Check size={16} strokeWidth={2.4} className="shrink-0 text-accent" aria-hidden />}
              </button>
            )
          })}
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-center text-[12.5px] text-faint">No projects match.</p>
          )}
        </div>
    </Dialog>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center bg-canvas text-[13px] text-muted">
      {children}
    </div>
  )
}

function Toolbar({
  onNewProject,
  onNewReview,
  canNewReview,
}: {
  onNewProject: () => void
  onNewReview: (kind: "files" | "diff") => void
  canNewReview: boolean
}) {
  return (
    <div className="flex h-[50px] shrink-0 items-center gap-[9px] border-b border-hair-strong bg-surface px-3">
      <button className="inline-flex h-[30px] items-center gap-[9px] rounded-ctrl px-1 pr-2 hover:bg-soft">
        <span className="grid size-6 place-items-center rounded-[7px] bg-accent text-[13px] font-black text-on-accent">
          S
        </span>
        <span className="text-[14px] font-bold tracking-[-0.02em] text-ink">Suikou</span>
      </button>
      <span className="flex-1" />
      <button className="hidden h-[30px] min-w-[240px] max-w-[320px] items-center gap-2 rounded-ctrl border border-hair-strong bg-canvas px-2.5 pr-2 text-[12.5px] text-faint sm:flex sm:w-[280px]">
        <Search size={14} className="shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">Search projects and reviews…</span>
        <kbd className="rounded bg-soft px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-muted ring-1 ring-inset ring-hair-strong">
          ⌘K
        </kbd>
      </button>
      <span aria-hidden className="hidden h-[22px] w-px bg-hair-strong sm:block" />
      <button
        onClick={() => uiStore.setSettingsOpen(true)}
        className="grid size-[30px] place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
        title="Settings"
      >
        <SlidersHorizontal size={16} aria-hidden />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button className="inline-flex h-[30px] cursor-pointer items-center gap-[5px] rounded-ctrl border border-accent-edge bg-accent px-[11px] text-[13px] font-semibold tracking-[-0.01em] text-on-accent hover:brightness-110">
              <Plus size={15} strokeWidth={1.9} aria-hidden />
              New
              <ChevronDown size={11} strokeWidth={2.2} aria-hidden className="-mr-0.5 opacity-80" />
            </button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem onClick={onNewProject}>
            <Folder size={14} aria-hidden />
            New project
          </DropdownMenuItem>
          {canNewReview && (
            <>
              <DropdownMenuItem onClick={() => onNewReview("files")}>
                <FileText size={14} aria-hidden />
                New file review
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onNewReview("diff")}>
                <GitCompare size={14} aria-hidden />
                New diff review
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function Sidebar({
  projects,
  selectedId,
  onSelect,
}: {
  projects: BoardProject[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <aside className="hidden flex-col border-r border-hair-strong bg-surface px-[9px] pt-3 pb-[9px] lg:flex">
      <div className="flex items-center gap-[7px] px-[9px] pt-[3px] pb-[9px] text-[9.5px] font-bold uppercase tracking-[0.12em] text-faint">
        Projects
        <span aria-hidden className="h-px flex-1 bg-hair" />
      </div>
      <div className="flex flex-col gap-0.5">
        {projects.map((project) => {
          const active = project.id === selectedId
          return (
            <button
              key={project.id}
              onClick={() => onSelect(project.id)}
              aria-current={active ? "true" : undefined}
              className={`flex h-[34px] shrink-0 items-center gap-[9px] rounded-ctrl pr-[9px] pl-2.5 text-left text-[13px] tracking-[-0.008em] ${
                active
                  ? "bg-accent-soft font-semibold text-accent-bright shadow-[inset_0_0_0_1px_var(--accent-edge)]"
                  : "text-text hover:bg-soft"
              }`}
            >
              <ProjectGlyph project={project} size={16} active={active} />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
            </button>
          )
        })}
      </div>
      <span className="flex-1" />
      <div className="flex items-center border-t border-hair px-[9px] pt-[9px] pb-0.5 text-[11px] text-faint">
        <span className="font-mono tabular-nums">
          {projects.length} {projects.length === 1 ? "project" : "projects"}
        </span>
      </div>
    </aside>
  )
}

function ReviewPane({
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

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onClose={onCancel} className="gap-3 p-5 sm:max-w-[400px]">
        <DialogTitle className="text-[15px] font-bold text-ink">{title}</DialogTitle>
        <p className="text-[12.5px] leading-[1.5] text-muted">{body}</p>
        <div className="flex items-center gap-2 pt-1">
          <span className="flex-1" />
          <button onClick={onCancel} className="inline-flex h-[32px] items-center rounded-ctrl px-3 text-[13px] font-medium text-muted hover:bg-soft">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="inline-flex h-[32px] items-center rounded-ctrl bg-request px-4 text-[13px] font-semibold text-on-accent hover:brightness-110"
          >
            {confirmLabel}
          </button>
        </div>
    </Dialog>
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
  // ponytail: opening a review navigates to the review detail route, which is
  // rebuilt in a later pass; the row's open area is inert until that route
  // exists — the ⋯ menu is the live affordance.

  return (
    <div className="group flex items-center gap-3 rounded-panel px-3 py-[11px] pl-[13px] hover:bg-surface hover:shadow-[inset_0_0_0_1px_var(--hair-strong)]">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left">
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
      </button>
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

/** A project's badge: its chosen emoji, or the default folder glyph. */
function ProjectGlyph({
  project,
  size,
  active,
}: {
  project: BoardProject
  size: number
  active?: boolean
}) {
  if (project.emoji) {
    return (
      <span aria-hidden className="shrink-0 leading-none" style={{ fontSize: size }}>
        {project.emoji}
      </span>
    )
  }
  return (
    <Folder
      size={size}
      strokeWidth={1.7}
      className={active ? "text-accent-bright" : "text-muted"}
      aria-hidden
    />
  )
}

// ponytail: unread dot, blocker count, and +N/-M diff stats stay out — the
// load_board contract carries no unread/blocker/numstat data to drive them.
