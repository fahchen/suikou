import { useEffect, useRef, useState, type ReactNode } from "react"
import type { CommandReply, StoreProxy } from "@musubi/react"
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Folder,
  GitCompare,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react"

import { storeCache, useMusubiCommand, useMusubiRoot, useSocketConnected } from "../musubi"
import { uiStore } from "../stores/ui-store"
import { SettingsModal } from "../settings/SettingsModal"
import { CreateProjectDialog } from "./CreateProjectDialog"
import { NewReviewDialog } from "./NewReviewDialog"
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
    return <Centered>Loading projects…</Centered>
  }
  if (root.status === "error") {
    return <Centered>Can't reach Suikou. {root.error.message}</Centered>
  }
  return <Board store={root.store} />
}

function Board({ store }: { store: BoardStore }) {
  const loadBoard = useMusubiCommand(store, "load_board")
  const connected = useSocketConnected()
  const [board, setBoard] = useState<LoadBoardReply | null>(null)
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
          if (!cancelled) setBoard(reply)
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
  const refetch = () => {
    loadBoard.dispatch({}).then(setBoard).catch(() => {})
  }

  const projects = board?.projects ?? []
  const selected = projects.find((p) => p.id === selectedId) ?? null

  return (
    <div className="flex h-screen flex-col bg-canvas text-ink">
      <Toolbar
        onNewProject={() => setCreatingProject(true)}
        onNewReview={setNewReviewKind}
        canNewReview={selected !== null}
      />
      <ChipStrip
        projects={projects}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onAddProject={() => setCreatingProject(true)}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[248px_1fr]">
        <Sidebar
          projects={projects}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddProject={() => setCreatingProject(true)}
        />
        {selected && (
          <ReviewPane
            store={store}
            project={selected}
            reviewFiles={board?.review_files ?? []}
            onNewReview={setNewReviewKind}
            onDeleted={refetch}
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
          kind={newReviewKind ?? "files"}
          open={newReviewKind !== null}
          onClose={() => setNewReviewKind(null)}
          onCreated={refetch}
        />
      )}
      <SettingsModal />
    </div>
  )
}

/** Mobile project switcher: the desktop sidebar collapsed to a horizontal
 * scroll of project chips. Hidden at lg where the sidebar takes over. */
function ChipStrip({
  projects,
  selectedId,
  onSelect,
  onAddProject,
}: {
  projects: BoardProject[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddProject: () => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-hair-strong bg-surface px-3 py-2 lg:hidden">
      {projects.map((project) => {
        const active = project.id === selectedId
        return (
          <button
            key={project.id}
            onClick={() => onSelect(project.id)}
            aria-current={active ? "true" : undefined}
            className={`inline-flex h-[34px] shrink-0 items-center gap-2 rounded-ctrl px-3 text-[13px] font-medium ${
              active
                ? "bg-accent-soft text-accent-bright shadow-[inset_0_0_0_1px_var(--accent-edge)]"
                : "bg-canvas text-text shadow-[inset_0_0_0_0.5px_var(--hair-strong)]"
            }`}
          >
            <Folder size={15} strokeWidth={1.7} className={active ? "text-accent-bright" : "text-muted"} aria-hidden />
            {project.name}
          </button>
        )
      })}
      <button
        onClick={onAddProject}
        className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-ctrl border border-dashed border-hair-strong text-muted"
        title="Add project"
      >
        <Plus size={16} strokeWidth={2} aria-hidden />
      </button>
    </div>
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
    <div className="flex h-[50px] items-center gap-[9px] border-b border-hair-strong bg-surface px-3">
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
  onAddProject,
}: {
  projects: BoardProject[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddProject: () => void
}) {
  return (
    <aside className="hidden flex-col border-r border-hair-strong bg-surface px-[9px] pt-3 pb-[9px] lg:flex">
      <div className="flex items-center gap-[7px] px-[9px] pt-[3px] pb-[9px] text-[9.5px] font-bold uppercase tracking-[0.12em] text-faint">
        Projects
        <span className="font-mono tabular-nums tracking-[0.06em]">{projects.length}</span>
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
              <Folder size={16} strokeWidth={1.7} className={active ? "text-accent-bright" : "text-muted"} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
            </button>
          )
        })}
      </div>
      <button
        onClick={onAddProject}
        className="mt-1 flex h-[34px] shrink-0 items-center gap-[9px] rounded-ctrl border border-dashed border-hair-strong bg-canvas/40 px-2.5 text-[12.5px] font-medium text-muted hover:border-accent-edge hover:text-accent-bright"
      >
        <Plus size={15} strokeWidth={1.9} aria-hidden />
        Add project
      </button>
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
  onDeleted,
}: {
  store: BoardStore
  project: BoardProject
  reviewFiles: ReviewFilesGrouped
  onNewReview: (kind: "files" | "diff") => void
  onDeleted: () => void
}) {
  return (
    <div className="flex min-w-0 flex-col bg-canvas">
      <div className="flex items-center gap-3 border-b border-hair px-5 py-[14px] pt-4">
        <span className="text-[17px] font-bold tracking-[-0.02em] text-ink">{project.name}</span>
        <span className="truncate font-mono text-[11.5px] text-faint">{project.path}</span>
        <span className="flex-1" />
        <ProjectActions store={store} project={project} onDeleted={onDeleted} />
      </div>
      <div className="flex flex-1 flex-col gap-[9px] overflow-auto px-4 pt-[14px] pb-[18px]">
        <NewReviewCard onNew={onNewReview} />
        {project.reviews.map((review) => (
          <ReviewRow key={review.id} review={review} files={filesFor(reviewFiles, review.id)} />
        ))}
      </div>
    </div>
  )
}

function ProjectActions({
  store,
  project,
  onDeleted,
}: {
  store: BoardStore
  project: BoardProject
  onDeleted: () => void
}) {
  const remove = useMusubiCommand(store, "delete_project")
  return (
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
        <DropdownMenuItem onClick={() => void navigator.clipboard?.writeText(project.path)}>
          <Copy size={14} aria-hidden />
          Copy path
        </DropdownMenuItem>
        <DropdownMenuItem
          destructive
          onClick={() => {
            remove.dispatch({ project_id: project.id }).then(onDeleted).catch(() => {})
          }}
        >
          <Trash2 size={14} aria-hidden />
          Delete project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NewReviewCard({ onNew }: { onNew: (kind: "files" | "diff") => void }) {
  return (
    <div className="group flex items-center gap-[11px] rounded-panel border border-dashed border-hair-strong bg-canvas/40 px-[13px] py-[11px] hover:border-accent-edge hover:bg-accent-softer">
      <button onClick={() => onNew("files")} className="flex min-w-0 flex-1 items-center gap-[11px] text-left">
        <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-accent-soft text-accent-bright shadow-[inset_0_0_0_0.5px_var(--accent-edge)]">
          <Plus size={17} strokeWidth={1.9} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col gap-px">
          <span className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">New review</span>
          <span className="text-[11.5px] text-faint">Select files, or a diff of two refs</span>
        </span>
      </button>
      <span className="ml-auto hidden items-center gap-[7px] sm:inline-flex">
        <button
          onClick={() => onNew("files")}
          className="inline-flex h-[25px] items-center gap-[5px] rounded-full bg-soft px-[9px] text-[11.5px] font-medium text-muted shadow-[inset_0_0_0_0.5px_var(--hair-strong)] hover:text-ink"
        >
          <FileText size={13} strokeWidth={1.7} aria-hidden />
          Files
        </button>
        <button
          onClick={() => onNew("diff")}
          className="inline-flex h-[25px] items-center gap-[5px] rounded-full bg-soft px-[9px] text-[11.5px] font-medium text-muted shadow-[inset_0_0_0_0.5px_var(--hair-strong)] hover:text-ink"
        >
          <GitCompare size={13} strokeWidth={1.8} aria-hidden />
          Diff
        </button>
      </span>
    </div>
  )
}

function ReviewRow({ review, files }: { review: BoardReview; files: BoardReviewFile[] }) {
  const isDiff = review.kind === "git_diff"
  const approved = files.length > 0 && files.every((file) => file.approved)
  // ponytail: opening a review navigates to the review detail route, which is
  // rebuilt in a later pass; the row is inert until that route exists.

  return (
    <button
      type="button"
      className="group flex items-center gap-3 rounded-panel px-3 py-[11px] pl-[13px] text-left hover:bg-surface hover:shadow-[inset_0_0_0_1px_var(--hair-strong)]"
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
      <span className="flex shrink-0 items-center gap-2">
        {approved && (
          <span className="inline-flex h-[22px] items-center gap-[5px] rounded-full bg-approve-soft pr-[9px] pl-[7px] text-[11px] font-semibold text-approve shadow-[inset_0_0_0_0.5px_var(--approve-edge)]">
            <Check size={13} strokeWidth={2.4} aria-hidden />
            Approved
          </span>
        )}
        <ChevronRight size={17} strokeWidth={2.1} className="text-faint transition-colors group-hover:text-text" aria-hidden />
      </span>
    </button>
  )
}

function Dot() {
  return <span aria-hidden className="inline-block size-[2px] shrink-0 rounded-full bg-faint opacity-70" />
}

// ponytail: unread dot, blocker count, and +N/-M diff stats stay out — the
// load_board contract carries no unread/blocker/numstat data to drive them.
