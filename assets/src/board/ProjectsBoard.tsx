import { useEffect, useRef, useState, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import type { CommandReply, StoreProxy } from "@musubi/react"
import { ChevronDown, FileText, Folder, GitCompare, Plus, SlidersHorizontal, WifiOff } from "lucide-react"

import { FileNotice } from "../review/components/EditorSurface"

import { storeCache, useMusubiCommand, useMusubiRoot, useSocketConnected } from "../musubi"
import { uiStore } from "../stores/ui-store"
import { SettingsModal } from "../settings/SettingsModal"
import { Sidebar } from "./components/ProjectNavigation"
import { ReviewPane } from "./components/ReviewPane"
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

// Persist the last-good load_board reply so a reload (or a fresh tab) paints the
// projects on the first frame, then the command revalidates in the background —
// stale-while-revalidate, no loading flash. `BOARD_CACHE_BUSTER` is the reply's
// shape version; bump it when the load_board contract changes.
const BOARD_CACHE_KEY = "suikou-board"
const BOARD_CACHE_BUSTER = "v1"
const BOARD_SELECTED_PROJECT_KEY = "suikou-board-selected-project"

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

function readSelectedProjectId(): string | null {
  return localStorage.getItem(BOARD_SELECTED_PROJECT_KEY)
}

function writeSelectedProjectId(projectId: string | null): void {
  if (projectId) localStorage.setItem(BOARD_SELECTED_PROJECT_KEY, projectId)
  else localStorage.removeItem(BOARD_SELECTED_PROJECT_KEY)
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
    return (
      <div className="grid h-screen place-items-center bg-canvas">
        <FileNotice
          icon={WifiOff}
          title="Can't reach Suikou"
          body="The server didn't respond. Check that the dev server is running, then reload."
          tone="request"
          meta={root.error.message}
        />
      </div>
    )
  }
  return <Board store={root.store} />
}

function Board({ store }: { store: BoardStore }) {
  const loadBoard = useMusubiCommand(store, "load_board")
  const connected = useSocketConnected()
  const navigate = useNavigate()
  const [board, setBoard] = useState<LoadBoardReply | null>(() => readBoardCache())
  const [selectedId, setSelectedId] = useState<string | null>(() => readSelectedProjectId())
  const boardRef = useRef<LoadBoardReply | null>(null)
  boardRef.current = board

  useEffect(() => {
    if (board === null) return
    if (board.projects.length === 0) {
      setSelectedId(null)
      return
    }
    if (selectedId === null || !board.projects.some((p) => p.id === selectedId)) {
      const remembered = readSelectedProjectId()
      const fallback = remembered && board.projects.some((project) => project.id === remembered) ? remembered : board.projects[0].id
      setSelectedId(fallback)
    }
  }, [board, selectedId])

  useEffect(() => {
    writeSelectedProjectId(selectedId)
  }, [selectedId])

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
  const refetch = () =>
    loadBoard
      .dispatch({})
      .then((reply) => {
        setBoard(reply)
        writeBoardCache(reply)
        return reply
      })
      .catch(() => null)

  const projects = board?.projects ?? []
  const selected = projects.find((p) => p.id === selectedId) ?? null

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas text-ink">
      <Toolbar
        onNewProject={() => setCreatingProject(true)}
        onNewReview={setNewReviewKind}
        canNewReview={selected !== null}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[248px_1fr]">
        <Sidebar projects={projects} selectedId={selectedId} onSelect={setSelectedId} />
        {selected && (
          <ReviewPane
            store={store}
            project={selected}
            projects={projects}
            selectedId={selectedId}
            onSelectProject={setSelectedId}
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
        onCreated={(projectId) => {
          refetch().then((reply) => {
            if (reply?.projects.some((p) => p.id === projectId)) setSelectedId(projectId)
          })
        }}
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
          onCreated={(reviewId) => {
            refetch()
            if (reviewId) navigate({ to: "/reviews/$reviewId", params: { reviewId } })
          }}
        />
      )}
      <SettingsModal />
    </div>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center bg-canvas text-sm text-muted">
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
        <span className="grid size-6 place-items-center rounded-[7px] bg-accent text-sm font-black text-on-accent">
          S
        </span>
        <span className="text-sm font-bold tracking-[-0.02em] text-ink">Suikou</span>
      </button>
      <span className="flex-1" />
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
            <button className="inline-flex h-[30px] cursor-pointer items-center gap-[5px] rounded-ctrl border border-accent-edge bg-accent px-[11px] text-sm font-semibold tracking-[-0.01em] text-on-accent hover:brightness-110">
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

// ponytail: unread dot, blocker count, and +N/-M diff stats stay out — the
// load_board contract carries no unread/blocker/numstat data to drive them.
