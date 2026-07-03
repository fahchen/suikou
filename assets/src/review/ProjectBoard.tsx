import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Code2,
  Folder,
  FileDiff,
  FilePlus2,
  FileStack,
  FileText,
  FolderPlus,
  GitBranch,
  GitCompare,
  Loader2,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  Settings,
  ChevronDown,
  Trash2,
} from "lucide-react";

import type { CommandReply, StoreProxy } from "@musubi/react";

import {
  storeCache,
  useMusubiCommand,
  useMusubiRoot,
  usePrefetchReviewStore,
  useSocketConnected,
} from "../musubi";
import { useMediaQuery, WIDE_QUERY } from "../hooks/use-media-query";
import { readCommandCache, writeCommandCache } from "./command-cache";
import { FileTree } from "./FileTree";
import { ReviewFileTree } from "./ReviewFileTree";
import { orderedReviewFiles } from "./file-order";
import { uiStore } from "../stores/ui-store";
import { isHtmlPath } from "./view-kind";
import { elapsed, fullTimestamp } from "./time";
import { Centered } from "@/components/centered";
import { ErrorPage, errorCopy } from "@/components/error-page";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Toggle } from "@/components/ui/toggle";

type BoardStore = StoreProxy<"SuikouWeb.Stores.ProjectBoardStore", Musubi.Stores>;
type LoadBoardReply = CommandReply<"SuikouWeb.Stores.ProjectBoardStore", "load_board", Musubi.Stores>;
type ReviewFilesGrouped = LoadBoardReply["review_files"];
type BoardProject = LoadBoardReply["projects"][number];
type BoardReview = BoardProject["reviews"][number];
type ReviewFileEntry = ReviewFilesGrouped[number]["files"][number];

// Single board per app, so one fixed key for its cached `load_board` reply.
const BOARD_CACHE_KEY = "suikou-board";

// The board chrome and list now render from a `load_board` request-response
// command held in component state, not from a live snapshot subscription — so a
// hard WebSocket disconnect leaves the board intact. A mutation deep in a dialog
// or composer signals success up to `Board` through this context, which refetches.
const BoardRefetchContext = createContext<() => void>(() => {});

function useBoardRefetch(): () => void {
  return useContext(BoardRefetchContext);
}

// The toolbar's `+ New ▾` menu triggers the "New review" composer that lives
// inside `ProjectSection`; the section subscribes to this monotonically
// increasing counter so a click on the toolbar item opens the composer for the
// currently selected project.
type NewReviewRequest = { seq: number; kind: "files" | "diff" };
const NewReviewRequestContext = createContext<NewReviewRequest>({ seq: 0, kind: "files" });

function useNewReviewRequest(): NewReviewRequest {
  return useContext(NewReviewRequestContext);
}

const KIND_TITLE: Record<BoardReview["kind"], string> = {
  file_selection: "File selection review",
  git_diff: "Git diff review",
};

/**
 * Per-review file list from the grouped `load_board` reply. Every review is
 * present in the reply (the server walks them all), so a missing entry means an
 * empty selection — both collapse to `[]`.
 */
function filesForReview(reviewFiles: ReviewFilesGrouped, reviewId: string): ReviewFileEntry[] {
  return reviewFiles.find((e) => e.review_id === reviewId)?.files ?? [];
}

function fileCountLabel(files: ReviewFileEntry[]): string {
  return `${files.length} ${files.length === 1 ? "file" : "files"}`;
}

// Synchronous cache probe used to decide whether the board has a warm snapshot
// it can render against. When a persisted entry exists, the SDK mount will
// resolve in a microtask with that data already populated; the brief "Loading
// projects…" centered screen we used to show during that microtask is replaced
// by a transparent placeholder so the warm-cache transition reads as instant.
function boardCacheIsWarm(): boolean {
  const persister = storeCache.persister;
  if (!persister) return false;
  const key = "board|SuikouWeb.Stores.ProjectBoardStore|{}";
  let entry: ReturnType<typeof persister.getEntry>;
  try {
    entry = persister.getEntry(key);
  } catch {
    return false;
  }
  if (entry === undefined || entry === null) return false;
  if (entry instanceof Promise) return false;
  return entry.buster === storeCache.buster;
}

/** Project board: register directories, then group files into reviews. */
export function ProjectBoard({ onOpen }: { onOpen: (reviewId: string, path: string) => void }) {
  const warmRef = useRef<boolean | null>(null);
  if (warmRef.current === null) warmRef.current = boardCacheIsWarm();

  const root = useMusubiRoot({
    module: "SuikouWeb.Stores.ProjectBoardStore",
    id: "board",
    params: {},
    cache: storeCache,
  });

  if (root.status === "loading") {
    // Warm cache: SDK mount resolves with cached snapshot on the next tick.
    // Render a transparent placeholder so the projects appear without the
    // centered loading screen flashing over the chrome.
    return warmRef.current ? (
      <div aria-hidden className="h-screen" />
    ) : (
      <Centered>Loading projects…</Centered>
    );
  }
  if (root.status === "error") return <ErrorPage {...errorCopy(root.error.message)} />;

  return <Board store={root.store} onOpen={onOpen} />;
}

function Board({
  store,
  onOpen,
}: {
  store: BoardStore;
  onOpen: (reviewId: string, path: string) => void;
}) {
  const loadBoard = useMusubiCommand(store, "load_board");
  const connected = useSocketConnected();
  // Seed from the last-good cached board so a forced reload paints the projects
  // on the first frame; the command below revalidates it (SWR).
  const [board, setBoard] = useState<LoadBoardReply | null>(() =>
    readCommandCache<LoadBoardReply>(BOARD_CACHE_KEY),
  );
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newReviewRequest, setNewReviewRequest] = useState<NewReviewRequest>({
    seq: 0,
    kind: "files",
  });
  // Which project is showing in the right pane. Seeded lazily from the first
  // project once the board arrives; cleared if that project vanishes.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Latest board, read inside callbacks without re-arming the reconnect effect.
  const boardRef = useRef<LoadBoardReply | null>(null);
  boardRef.current = board;

  useEffect(() => {
    if (board === null) return;
    if (board.projects.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (selectedId === null || !board.projects.some((p) => p.id === selectedId)) {
      setSelectedId(board.projects[0].id);
    }
  }, [board, selectedId]);

  // Manual refetch after a mutation (the socket is up here). Keep the last-good
  // list on a transient failure rather than blanking the board.
  const refetch = useCallback(() => {
    loadBoard
      .dispatch({})
      .then((reply) => {
        setBoard(reply);
        writeCommandCache(BOARD_CACHE_KEY, reply);
        setError(null);
      })
      .catch((cause: Error) => {
        if (boardRef.current === null) setError(cause.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch on mount and retry through reconnect. The phoenix socket reopens a beat
  // before the musubi channel re-joins, so an eager dispatch on reconnect rejects
  // with "Store is not connected"; retry through that window and keep the last-good
  // board on screen. Only surface a hard error on the first load, after retries.
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;

    const attempt = () => {
      loadBoard
        .dispatch({})
        .then((reply) => {
          if (cancelled) return;
          setBoard(reply);
          writeCommandCache(BOARD_CACHE_KEY, reply);
          setError(null);
        })
        .catch((cause: Error) => {
          if (cancelled) return;
          attempts += 1;
          if (boardRef.current === null && attempts >= 5) {
            setError(cause.message);
            return;
          }
          timer = setTimeout(attempt, 400);
        });
    };

    attempt();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const selected =
    board?.projects.find((p) => p.id === selectedId) ?? board?.projects[0] ?? null;

  return (
    <BoardRefetchContext.Provider value={refetch}>
      <NewReviewRequestContext.Provider value={newReviewRequest}>
        <div className="flex min-h-screen flex-col bg-canvas">
          <LauncherToolbar
            onNewProject={() => setCreating(true)}
            canCreateReview={selected !== null}
            onNewReview={(kind) =>
              setNewReviewRequest((prev) => ({ seq: prev.seq + 1, kind }))
            }
          />
          <div className="relative flex flex-1 flex-col overflow-hidden border-t border-line-strong bg-[linear-gradient(180deg,var(--accent-softer),transparent_22%),var(--panel)]">
            <BoardBody
              store={store}
              board={board}
              error={error}
              selected={selected}
              onSelect={setSelectedId}
              onOpen={onOpen}
              onNewProject={() => setCreating(true)}
            />
          </div>

          <CreateProjectDialog store={store} open={creating} onOpenChange={setCreating} />
        </div>
      </NewReviewRequestContext.Provider>
    </BoardRefetchContext.Provider>
  );
}

function LauncherToolbar({
  onNewProject,
  onNewReview,
  canCreateReview,
}: {
  onNewProject: () => void;
  onNewReview: (kind: "files" | "diff") => void;
  canCreateReview: boolean;
}) {
  return (
    <div className="sticky top-0 z-30 border-b border-line-strong bg-surface2 shadow-[inset_0_1px_0_var(--line-soft)] backdrop-blur-md">
      <div className="flex h-[50px] items-center gap-[9px] px-3 sm:px-5">
        <button
          type="button"
          title="Suikou home"
          className="flex h-[30px] shrink-0 items-center gap-[9px] rounded-lg px-1 pr-2 hover:bg-hover"
        >
          <span
            aria-hidden
            className="grid size-6 place-items-center rounded-[7px] bg-blue text-[13px] font-black text-on-accent shadow-[inset_0_0.5px_0_oklch(100%_0_0/0.4),0_0_12px_var(--accent-soft)]"
          >
            S
          </span>
          <span className="text-[14px] font-bold tracking-[-0.02em] text-heading">Suikou</span>
        </button>
        <span className="flex-1" />
        <div
          aria-hidden
          className="hidden h-[30px] min-w-[240px] max-w-[320px] flex-none items-center gap-2 rounded-lg border border-line-strong bg-code px-2.5 pr-2 text-[12.5px] text-faint shadow-[inset_0_1px_2px_var(--elev-1)] sm:flex sm:w-[280px]"
        >
          <Search size={14} strokeWidth={1.8} aria-hidden />
          <span className="flex-1 truncate">Search projects and reviews…</span>
          <kbd className="rounded bg-control px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-muted ring-1 ring-inset ring-line-strong">
            ⌘K
          </kbd>
        </div>
        <span aria-hidden className="hidden h-[22px] w-px bg-line-strong sm:block" />
        <Button
          variant="ghost"
          size="icon"
          title="Settings (⌘,)"
          aria-label="Open settings"
          onClick={() => uiStore.setSettingsOpen(true)}
          className="size-[30px] rounded-lg text-muted hover:bg-hover hover:text-heading"
        >
          <Settings strokeWidth={1.8} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                title="New project or review"
                aria-label="New project or review"
                className="inline-flex h-[30px] cursor-pointer items-center gap-[5px] rounded-lg border border-[color:var(--accent-edge)] bg-blue px-[11px] text-[13px] font-semibold tracking-[-0.01em] text-on-accent shadow-[inset_0_0.5px_0_oklch(100%_0_0/0.35),0_1px_3px_var(--elev-1),0_0_16px_var(--accent-soft)] transition-[filter,transform] duration-100 hover:brightness-110 active:translate-y-px active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              />
            }
          >
            <Plus size={14} strokeWidth={1.9} aria-hidden />
            New
            <ChevronDown size={11} strokeWidth={2.2} aria-hidden className="-mr-0.5 opacity-80" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuItem onClick={onNewProject}>
              <FolderPlus size={14} />
              New project…
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canCreateReview}
              onClick={() => onNewReview("files")}
            >
              <FilePlus2 size={14} />
              New review from files…
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canCreateReview}
              onClick={() => onNewReview("diff")}
            >
              <FileDiff size={14} />
              New review from diff…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function BoardBody({
  store,
  board,
  error,
  selected,
  onSelect,
  onOpen,
  onNewProject,
}: {
  store: BoardStore;
  board: LoadBoardReply | null;
  error: string | null;
  selected: BoardProject | null;
  onSelect: (id: string) => void;
  onOpen: (reviewId: string, path: string) => void;
  onNewProject: () => void;
}) {
  if (error !== null) {
    return (
      <p className="p-8 text-[13px] text-red">Could not load projects. {error}</p>
    );
  }
  if (board === null) {
    return <p className="p-8 text-[13px] text-faint">Loading projects…</p>;
  }
  if (board.projects.length === 0) {
    return <EmptyProjectsState onNewProject={onNewProject} />;
  }
  return (
    <div className="grid flex-1 grid-cols-1 sm:grid-cols-[248px_1fr]">
      <ProjectSidebar
        projects={board.projects}
        selectedId={selected?.id ?? null}
        onSelect={onSelect}
        onAddProject={onNewProject}
      />
      {selected !== null && (
        <ProjectSection
          store={store}
          project={selected}
          reviewFiles={board.review_files}
          onOpen={onOpen}
        />
      )}
    </div>
  );
}

function ProjectSidebar({
  projects,
  selectedId,
  onSelect,
  onAddProject,
}: {
  projects: BoardProject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddProject: () => void;
}) {
  const projectLabel = `${projects.length} ${projects.length === 1 ? "project" : "projects"}`;
  return (
    <aside className="flex flex-col border-b border-line-strong bg-surface px-[9px] pt-3 pb-[9px] shadow-[inset_0_1px_0_var(--line-soft)] sm:border-r sm:border-b-0">
      <div className="hidden items-center gap-[7px] px-[9px] pt-[3px] pb-[9px] text-[9.5px] font-bold tracking-[0.12em] text-faint uppercase sm:flex">
        <span>Projects</span>
        <span className="font-mono tabular-nums tracking-[0.06em]">{projects.length}</span>
        <span aria-hidden className="h-px flex-1 bg-line-soft" />
      </div>
      <div
        role="tablist"
        aria-label="Projects"
        className="flex gap-0.5 overflow-x-auto pb-1 sm:flex-col sm:overflow-visible sm:pb-0"
      >
        {projects.map((project) => (
          <ProjectSidebarRow
            key={project.id}
            project={project}
            selected={project.id === selectedId}
            onSelect={() => onSelect(project.id)}
          />
        ))}
        <button
          type="button"
          onClick={onAddProject}
          title="Add project"
          aria-label="Add project"
          className="ml-1 grid size-[38px] shrink-0 cursor-pointer place-items-center rounded-full border border-line bg-soft text-muted transition-colors duration-150 hover:border-accent-edge hover:bg-accent-softer hover:text-accent-bright sm:hidden"
        >
          <Plus size={17} strokeWidth={2} aria-hidden />
        </button>
      </div>
      <button
        type="button"
        onClick={onAddProject}
        className="mt-1 hidden h-[34px] shrink-0 cursor-pointer items-center gap-[9px] rounded-lg border border-dashed border-line-strong bg-soft/40 px-2.5 text-[12.5px] font-medium text-muted transition-colors duration-150 hover:border-accent-edge hover:bg-accent-softer hover:text-accent-bright sm:flex"
      >
        <Plus size={15} strokeWidth={1.9} aria-hidden />
        Add project
      </button>
      <span className="hidden flex-1 sm:block" />
      <div className="mt-[6px] hidden items-center border-t border-line-soft px-[9px] pt-[9px] pb-0.5 text-[11px] text-faint sm:flex">
        <span className="font-mono tabular-nums">{projectLabel}</span>
      </div>
    </aside>
  );
}

function ProjectSidebarRow({
  project,
  selected,
  onSelect,
}: {
  project: BoardProject;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      title={project.path}
      className={`flex h-[34px] shrink-0 cursor-pointer items-center gap-[9px] rounded-lg pr-[9px] pl-2.5 text-left text-[13px] tracking-[-0.008em] transition-colors duration-150 sm:w-auto ${
        selected
          ? "bg-accent-soft font-semibold text-accent-bright shadow-[inset_0_0_0_1px_var(--accent-edge)]"
          : "font-medium text-text hover:bg-hover"
      }`}
    >
      <Folder
        size={16}
        strokeWidth={1.7}
        aria-hidden
        className={`shrink-0 ${selected ? "text-accent-bright" : "text-muted"}`}
      />
      <span className="min-w-0 flex-1 truncate">{project.name}</span>
    </button>
  );
}

function EmptyProjectsState({ onNewProject }: { onNewProject: () => void }) {
  return (
    <div className="grid min-h-[420px] grid-cols-1 sm:grid-cols-[248px_1fr]">
      <aside className="flex flex-col border-b border-line-strong bg-surface px-[9px] pt-3 pb-[9px] sm:border-r sm:border-b-0">
        <div className="hidden items-center gap-[7px] px-[9px] pt-[3px] pb-[9px] text-[9.5px] font-bold tracking-[0.12em] text-faint uppercase sm:flex">
          <span>Projects</span>
          <span className="font-mono tabular-nums tracking-[0.06em]">0</span>
          <span aria-hidden className="h-px flex-1 bg-line-soft" />
        </div>
        <div className="flex flex-1 flex-col items-stretch justify-center gap-[9px] px-1.5 py-4">
          <button
            type="button"
            onClick={onNewProject}
            className="flex h-[34px] shrink-0 cursor-pointer items-center justify-center gap-[9px] rounded-lg border border-dashed border-line-strong bg-soft/40 px-2.5 text-[12.5px] font-medium text-muted transition-colors duration-150 hover:border-accent-edge hover:bg-accent-softer hover:text-accent-bright"
          >
            <Plus size={15} strokeWidth={1.9} aria-hidden />
            Add project
          </button>
          <p className="px-1.5 text-center text-[11px] leading-snug text-faint">
            Register a project by name and filesystem path to start reviewing.
          </p>
        </div>
      </aside>
      <div className="grid place-items-center px-6 py-10 text-center">
        <div className="flex max-w-[340px] flex-col items-center gap-2">
          <div className="mb-1.5 grid size-14 place-items-center rounded-[14px] bg-surface text-faint shadow-[inset_0_0_0_0.5px_var(--line-strong),var(--elev-1)]">
            <Folder size={28} strokeWidth={1.6} aria-hidden />
          </div>
          <h3 className="text-[14.5px] font-semibold tracking-[-0.015em] text-heading">
            No projects yet
          </h3>
          <p className="text-[12.5px] leading-relaxed text-faint">
            Add a project to register its repository and open your first review.
          </p>
          <button
            type="button"
            onClick={onNewProject}
            className="mt-2.5 inline-flex h-[34px] cursor-pointer items-center gap-[5px] rounded-lg border border-[color:var(--accent-edge)] bg-blue px-4 text-[13px] font-semibold text-on-accent shadow-[inset_0_0.5px_0_oklch(100%_0_0/0.35),0_1px_3px_var(--elev-1),0_0_16px_var(--accent-soft)] transition-[filter,transform] duration-100 hover:brightness-110 active:translate-y-px active:brightness-95"
          >
            <Plus size={15} strokeWidth={1.9} aria-hidden />
            Add project
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectSection({
  store,
  project,
  reviewFiles,
  onOpen,
}: {
  store: BoardStore;
  project: BoardProject;
  reviewFiles: ReviewFilesGrouped;
  onOpen: (reviewId: string, path: string) => void;
}) {
  const [composing, setComposing] = useState<"files" | "diff" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);
  const removeProject = useMusubiCommand(store, "delete_project");
  const refetch = useBoardRefetch();
  const newReviewRequest = useNewReviewRequest();
  const reviewCount = project.reviews.length;
  const reviewLabel = `${reviewCount} review${reviewCount === 1 ? "" : "s"}`;

  // Toolbar-triggered "New review" opens the composer for the current project.
  useEffect(() => {
    if (newReviewRequest.seq === 0) return;
    setComposing(newReviewRequest.kind);
  }, [newReviewRequest]);

  return (
    <section className="flex min-w-0 flex-col bg-panel">
      <div className="flex items-center gap-3 border-b border-line-soft px-5 pt-4 pb-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
          <h2 className="min-w-0 truncate text-[17px] font-bold tracking-[-0.02em] text-heading sm:max-w-[45%]">
            {project.name}
          </h2>
          <p className="flex min-w-0 items-center gap-1.5 font-mono text-[11.5px] leading-snug text-faint sm:flex-1">
            <Folder size={12} strokeWidth={1.7} aria-hidden className="shrink-0 sm:hidden" />
            <span className="min-w-0 flex-1 truncate">{project.path}</span>
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-[30px] shrink-0 rounded-lg text-muted hover:bg-hover hover:text-heading"
                title="Project actions"
                aria-label="Project actions"
              />
            }
          >
            <MoreHorizontal size={18} strokeWidth={2.2} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setEditingSettings(true)}>
              <Settings size={14} />
              Edit settings
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} />
              Delete project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-1 flex-col gap-[9px] px-4 pt-3.5 pb-[18px]">
        {composing === null && <NewReviewCard onPick={setComposing} />}

        {composing === "files" && (
          <ReviewComposer
            store={store}
            project={project}
            command="create_review"
            initial={new Set()}
            title="New review"
            onClose={() => setComposing(null)}
          />
        )}

        {composing === "diff" && (
          <DiffReviewComposer store={store} project={project} onClose={() => setComposing(null)} />
        )}

        {project.reviews.length === 0 ? (
          composing === null && (
            <div className="mt-2 grid flex-1 place-items-center px-6 py-10 text-center">
              <div className="flex max-w-[340px] flex-col items-center gap-2">
                <div className="mb-1.5 grid size-14 place-items-center rounded-[14px] bg-surface text-faint shadow-[inset_0_0_0_0.5px_var(--line-strong),var(--elev-1)]">
                  <FileText size={28} strokeWidth={1.6} aria-hidden />
                </div>
                <h3 className="text-[14.5px] font-semibold tracking-[-0.015em] text-heading">
                  Open a review to start
                </h3>
                <p className="text-[12.5px] leading-relaxed text-faint">
                  Select files or a git diff to create the first review for {project.name}.
                </p>
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-[3px]">
            <AnimatePresence initial={false}>
              {project.reviews.map((review, index) => (
                <ReviewCard
                  key={review.id}
                  index={index}
                  store={store}
                  project={project}
                  review={review}
                  files={filesForReview(reviewFiles, review.id)}
                  onOpen={onOpen}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 size={16} className="text-red" />
              Delete this project?
            </DialogTitle>
          </DialogHeader>
          {reviewCount === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Permanently removes <b className="text-heading">{project.name}</b>. This project has
              no reviews. This cannot be undone.
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              <b className="text-heading">{project.name}</b> has {reviewLabel}. Deleting it
              permanently removes all {reviewLabel} and every artifact and comment under them. This
              cannot be undone.
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={removeProject.isPending}
              onClick={() => {
                void removeProject.dispatch({ project_id: project.id }).then(refetch);
                setConfirmDelete(false);
              }}
            >
              <Trash2 size={14} />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditProjectSettingsDialog
        store={store}
        project={project}
        open={editingSettings}
        onOpenChange={setEditingSettings}
      />
    </section>
  );
}

/** "+ New review" affordance at the top of the review list. Clicking anywhere
 * opens a two-item menu: file selection or diff. The Files/Diff chips read as
 * two labeled affordances but share one trigger so the tap target stays big. */
function NewReviewCard({ onPick }: { onPick: (kind: "files" | "diff") => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title="New review"
            aria-label="New review"
            className="group flex w-full cursor-pointer items-center gap-[11px] rounded-[13px] border border-dashed border-line-strong bg-soft/40 px-[13px] py-[11px] text-left transition-colors duration-150 hover:border-accent-edge hover:bg-accent-softer focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/25 aria-expanded:border-solid aria-expanded:border-accent-edge aria-expanded:bg-accent-softer aria-expanded:shadow-[inset_0_0_0_0.5px_var(--accent-edge)]"
          />
        }
      >
        <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-accent-soft text-accent-bright shadow-[inset_0_0_0_0.5px_var(--accent-edge)]">
          <Plus size={17} strokeWidth={1.9} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col gap-px">
          <span className="text-[13.5px] font-semibold tracking-[-0.01em] text-heading">
            New review
          </span>
          <span className="text-[11.5px] text-faint">Select files, or a diff of two refs</span>
        </span>
        <span className="ml-auto hidden shrink-0 items-center gap-[7px] sm:inline-flex">
          <span className="inline-flex h-[25px] items-center gap-[5px] rounded-full bg-soft px-[9px] text-[11.5px] font-medium text-text2 shadow-[inset_0_0_0_0.5px_var(--line-strong)]">
            <FileText size={13} strokeWidth={1.7} aria-hidden />
            Files
          </span>
          <span className="inline-flex h-[25px] items-center gap-[5px] rounded-full bg-soft px-[9px] text-[11.5px] font-medium text-text2 shadow-[inset_0_0_0_0.5px_var(--line-strong)]">
            <GitCompare size={13} strokeWidth={1.8} aria-hidden />
            Diff
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">
        <DropdownMenuItem onClick={() => onPick("files")}>
          <FilePlus2 />
          Review files
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPick("diff")}>
          <FileDiff />
          Review diff
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ReviewCard({
  store,
  project,
  review,
  files,
  index,
  onOpen,
}: {
  store: BoardStore;
  project: BoardProject;
  review: BoardReview;
  files: ReviewFileEntry[];
  index: number;
  onOpen: (reviewId: string, path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(review.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const narrow = !useMediaQuery(WIDE_QUERY);
  const remove = useMusubiCommand(store, "delete_review");
  const rename = useMusubiCommand(store, "rename_review");
  const refetch = useBoardRefetch();
  const prefetchReview = usePrefetchReviewStore();
  const open = editing || expanded;
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const canOpen = files.length > 0;
  // An HTML review is a file-selection review whose files are all HTML docs;
  // there is no distinct board `kind` for it, so detect it from the resolved
  // file list to set it apart from a generic file selection at a glance.
  const isHtmlReview =
    review.kind === "file_selection" &&
    files.length > 0 &&
    files.every((file) => isHtmlPath(file.path));
  // The board carries per-file approval, so a review reads as approved once
  // every one of its files is approved — matching the mockup's "Approved" tag.
  const approved = files.length > 0 && files.every((file) => file.approved);

  async function handleOpen(path: string) {
    setPendingPath(path);
    try {
      onOpen(review.id, path);
    } finally {
      setPendingPath(null);
    }
  }

  function openReview() {
    if (files.length === 0) return;
    void handleOpen(orderedReviewFiles(files)[0].path);
  }

  // Warm the ReviewStore cache for the file `openReview` would open, so a
  // hover-then-click paints instantly. Unminted files stay skipped because
  // route entry is now the only place that mints `artifact_id`s.
  function prefetchFirstFile() {
    const first = orderedReviewFiles(files)[0];
    if (first?.artifact_id) prefetchReview(first.artifact_id);
  }

  function startRename() {
    setDraftName(review.name);
    setRenaming(true);
  }

  function saveRename() {
    if (!renaming) return;
    const next = draftName.trim();
    setRenaming(false);
    if (next && next !== review.name) {
      void rename.dispatch({ review_id: review.id, name: next }).then(refetch);
    }
  }

  // Narrow viewports: when picker (or edit composer) opens, scroll its top into
  // view so the user lands on the new content instead of having to scroll past
  // a long project/review list. Desktop layouts already have the picker on the
  // expanded card visible; skip the scroll there to keep the page steady.
  useEffect(() => {
    if (!open || !narrow) return;
    const handle = window.requestAnimationFrame(() => {
      const target = pickerRef.current ?? cardRef.current;
      if (!target) return;
      target.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(handle);
  }, [open, narrow]);

  return (
    <motion.div
      layout
      ref={cardRef as React.Ref<HTMLDivElement>}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1], delay: index * 0.04 }}
      className="group/card relative overflow-hidden rounded-[13px] border border-transparent bg-transparent transition-[background-color,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-line-strong hover:bg-panel hover:shadow-[inset_0_0_0_1px_var(--line-strong)] motion-reduce:transition-none"
    >
      <div className="flex items-center gap-3 pr-3 pl-[13px] py-[11px]">
        <span
          aria-hidden
          title={KIND_TITLE[review.kind]}
          className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-soft text-text shadow-[inset_0_0_0_0.5px_var(--line-strong),var(--elev-1)]"
        >
          {review.kind === "file_selection" ? (
            <FileText size={18} strokeWidth={1.7} />
          ) : (
            <GitCompare size={18} strokeWidth={1.8} />
          )}
        </span>

        {renaming ? (
          <input
            autoFocus
            value={draftName}
            aria-label="Review name"
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={saveRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveRename();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setRenaming(false);
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-line bg-control px-2 py-1 text-[13px] font-semibold text-heading focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25"
          />
        ) : (
          <button
            type="button"
            disabled={!canOpen || pendingPath !== null}
            aria-label={`Open ${review.name}`}
            title={canOpen ? "Open review" : "No files to open"}
            onClick={openReview}
            onMouseEnter={prefetchFirstFile}
            onFocus={prefetchFirstFile}
            className="group flex min-w-0 flex-1 cursor-pointer flex-col gap-[3px] text-left disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-[13.5px] font-semibold tracking-[-0.012em] text-heading">
                {review.name}
              </h3>
              {isHtmlReview && <HtmlBadge />}
              {pendingPath !== null && (
                <Loader2
                  size={12}
                  className="shrink-0 animate-spin text-blue"
                  aria-label="Opening file"
                />
              )}
            </span>
            <span
              className="flex min-w-0 flex-wrap items-center gap-x-[9px] gap-y-1 text-[11.5px] text-text2"
              title={fullTimestamp(review.inserted_at)}
            >
              {review.kind === "git_diff" && (
                <>
                  <DiffRefsInline review={review} />
                  <MetaDot />
                </>
              )}
              <span className="font-mono tabular-nums" aria-label={fileCountLabel(files)}>
                {fileCountLabel(files)}
              </span>
              <MetaDot />
              <span className="font-mono tabular-nums text-faint">
                {elapsed(review.inserted_at)}
              </span>
            </span>
          </button>
        )}

        {!renaming && approved && (
          <span
            className="inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full bg-green-soft py-0 pr-[9px] pl-[7px] text-[11px] font-semibold text-green shadow-[inset_0_0_0_0.5px_var(--color-green)]"
            title="Approved"
          >
            <Check size={13} strokeWidth={2.4} aria-hidden />
            Approved
          </span>
        )}

        <button
          type="button"
          onClick={() => {
            if (!editing) setExpanded((value) => !value);
          }}
          aria-expanded={open}
          aria-label={open ? "Collapse files" : "Expand files"}
          className="grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-md text-faint opacity-0 transition-[opacity,color,background-color] group-hover/card:opacity-100 hover:bg-hover hover:text-text focus-visible:opacity-100 aria-expanded:opacity-100"
        >
          <ChevronRight
            size={13}
            strokeWidth={2.1}
            className={`transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
          />
        </button>

        <span
          aria-hidden
          className="grid size-[22px] shrink-0 place-items-center text-faint transition-colors group-hover/card:text-text"
        >
          <ChevronRight size={17} strokeWidth={2.1} />
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-[22px] shrink-0 rounded-md text-muted opacity-0 transition-opacity group-hover/card:opacity-100 hover:bg-hover hover:text-heading aria-expanded:opacity-100"
                title="Review actions"
                aria-label="Review actions"
              />
            }
          >
            <MoreHorizontal size={15} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={startRename}>
              <PenLine size={14} />
              Rename
            </DropdownMenuItem>
            {review.kind === "file_selection" && (
              <DropdownMenuItem
                onClick={() => {
                  setExpanded(true);
                  setEditing(true);
                }}
              >
                <FileStack size={14} />
                Edit files
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} />
              Delete review
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {review.kind === "git_diff" && (review.refs_moved || refsVanished(review)) && (
        <DiffRefsBadgeRow review={review} />
      )}

      {editing ? (
        <div ref={pickerRef} className="border-t border-line p-3.5">
          <ReviewComposer
            store={store}
            project={project}
            command="update_review_files"
            reviewId={review.id}
            initial={new Set(review.selections)}
            onClose={() => setEditing(false)}
          />
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              ref={pickerRef as React.Ref<HTMLDivElement>}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-hidden"
            >
              {files.length === 0 ? (
                <p className="border-t border-line px-3.5 py-3 text-[12px] text-faint">
                  No files in this review.
                </p>
              ) : (
                <div className="border-t border-line py-1">
                  <ReviewFileTree
                    variant="list"
                    files={files}
                    pendingPath={pendingPath}
                    onSelect={(file) => void handleOpen(file.path)}
                    onHover={(file) => {
                      if (file.artifact_id) prefetchReview(file.artifact_id);
                    }}
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 size={16} className="text-red" />
              Delete this review?
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            Permanently removes <b className="text-heading">{review.name}</b> and every artifact and
            comment under it. This cannot be undone.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={remove.isPending}
              onClick={() => {
                void remove.dispatch({ review_id: review.id }).then(refetch);
                setConfirmDelete(false);
              }}
            >
              <Trash2 size={14} />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

/** Subtle sub-badge marking a review whose files are HTML documents. */
function HtmlBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-kind-html-bg px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.06em] text-kind-html-fg ring-1 ring-inset ring-kind-html-ring"
      title="HTML document review"
    >
      <Code2 size={10} aria-hidden />
      HTML
    </span>
  );
}

/** Tiny middot separator used between meta-line fields. */
function MetaDot() {
  return (
    <span
      aria-hidden
      className="inline-block size-[2px] shrink-0 rounded-full bg-faint opacity-70"
    />
  );
}

/** Inline `base..head` refs hint that sits on the meta line of a diff review. */
function DiffRefsInline({ review }: { review: BoardReview }) {
  const baseLabel = formatRefLabel(review.base_ref, review.base_sha, review.creation_base_sha);
  const headLabel = formatRefLabel(review.head_ref, review.head_sha, review.creation_head_sha);
  return (
    <span
      className="min-w-0 truncate font-mono text-[11px] text-text2"
      title="Comparing refs"
    >
      {`${baseLabel}..${headLabel}`}
    </span>
  );
}

/** Trailing warning row shown under the meta line when refs have moved or a
 * branch was deleted. Reserved for the exceptional states so a healthy diff
 * stays visually quiet. */
function DiffRefsBadgeRow({ review }: { review: BoardReview }) {
  const baseChanged =
    review.creation_base_sha !== null &&
    review.base_sha !== null &&
    review.creation_base_sha !== review.base_sha;
  const headChanged =
    review.creation_head_sha !== null &&
    review.head_sha !== null &&
    review.creation_head_sha !== review.head_sha;
  const baseVanished = review.creation_base_sha !== null && review.base_sha === null;
  const headVanished = review.creation_head_sha !== null && review.head_sha === null;
  const vanished = baseVanished || headVanished;

  return (
    <div className="-mt-1 flex flex-wrap items-center gap-2 px-3 pb-2.5 pl-[76px]">
      {review.refs_moved && !vanished && (
        <span
          className="inline-flex items-center gap-1 rounded-md bg-amber-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber"
          title={formatMovedTitle(review, baseChanged, headChanged)}
        >
          <GitBranch size={10} aria-hidden />
          refs moved
        </span>
      )}
      {vanished && (
        <span
          className="inline-flex items-center gap-1 rounded-md bg-red-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red"
          title={formatVanishedTitle(review, baseVanished, headVanished)}
        >
          <AlertTriangle size={10} aria-hidden />
          branch deleted
        </span>
      )}
    </div>
  );
}

function refsVanished(review: BoardReview): boolean {
  const baseVanished = review.creation_base_sha !== null && review.base_sha === null;
  const headVanished = review.creation_head_sha !== null && review.head_sha === null;
  return baseVanished || headVanished;
}

function shortSha(sha: string | null): string | null {
  return sha ? sha.slice(0, 7) : null;
}

function formatRefLabel(
  ref: string | null,
  currentSha: string | null,
  creationSha: string | null,
): string {
  const short = shortSha(currentSha) ?? shortSha(creationSha);
  if (ref === null) return short ?? "–";
  if (short === null) return ref;
  return `${ref}@${short}`;
}

function formatMovedTitle(review: BoardReview, baseChanged: boolean, headChanged: boolean): string {
  const parts: string[] = [];
  if (baseChanged) {
    parts.push(`base ${shortSha(review.creation_base_sha)} → ${shortSha(review.base_sha)}`);
  }
  if (headChanged) {
    parts.push(`head ${shortSha(review.creation_head_sha)} → ${shortSha(review.head_sha)}`);
  }
  return parts.length === 0 ? "Refs moved since this review was created" : parts.join("; ");
}

function formatVanishedTitle(
  review: BoardReview,
  baseVanished: boolean,
  headVanished: boolean,
): string {
  const parts: string[] = [];
  if (baseVanished) {
    parts.push(`base branch deleted; diff frozen at ${shortSha(review.creation_base_sha)}`);
  }
  if (headVanished) {
    parts.push(`head branch deleted; diff frozen at ${shortSha(review.creation_head_sha)}`);
  }
  return parts.join("; ");
}

function ReviewComposer({
  store,
  project,
  command,
  reviewId,
  initial,
  title,
  onClose,
}: {
  store: BoardStore;
  project: BoardProject;
  command: "create_review" | "update_review_files";
  reviewId?: string;
  initial: Set<string>;
  title?: string;
  onClose: () => void;
}) {
  const create = useMusubiCommand(store, "create_review");
  const update = useMusubiCommand(store, "update_review_files");
  const list = useMusubiCommand(store, "list_dir");
  const refetch = useBoardRefetch();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [error, setError] = useState<string | null>(null);

  // Read one directory level on demand, so opening the picker never walks the
  // whole working directory.
  const loadDir = useCallback(
    (path: string) =>
      list.dispatch({ project_id: project.id, path }).then((reply) => reply.entries),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.id],
  );

  const isCreate = command === "create_review";
  const pending = isCreate ? create.isPending : update.isPending;
  const disabled = pending || selected.size === 0 || (isCreate && name.trim() === "");

  async function save() {
    setError(null);
    const selections = [...selected];

    try {
      const reply = isCreate
        ? await create.dispatch({ project_id: project.id, name: name.trim(), selections })
        : await update.dispatch({ review_id: reviewId as string, selections });

      if (reply.error) {
        setError(reply.error);
        return;
      }

      refetch();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save review");
    }
  }

  return (
    <div className={isCreate ? "mb-3 rounded-lg border border-line bg-surface p-3.5" : ""}>
      {title && (
        <div className="mb-3 flex items-center gap-2">
          <FilePlus2 size={14} className="text-blue" />
          <h3 className="text-[13px] font-semibold text-heading">{title}</h3>
        </div>
      )}

      {isCreate && (
        <label className="mb-3 flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Review name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Launch docs"
            className="rounded-md border border-line bg-control px-2.5 py-1.5 text-[13px] text-text focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25"
          />
        </label>
      )}

      <div className="mb-1 text-[11px] font-medium text-muted-foreground">
        Files <span className="text-faint">({selected.size} selected)</span>
      </div>
      <FileTree loadDir={loadDir} selected={selected} onChange={setSelected} />

      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-2.5 text-[12px] text-red"
        >
          {error}
        </motion.p>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
          Cancel
        </Button>
        <Button size="sm" disabled={disabled} onClick={() => void save()}>
          {pending ? "Saving…" : isCreate ? "Create review" : "Save files"}
        </Button>
      </div>
    </div>
  );
}

function DiffReviewComposer({
  store,
  project,
  onClose,
}: {
  store: BoardStore;
  project: BoardProject;
  onClose: () => void;
}) {
  const listBranches = useMusubiCommand(store, "list_branches");
  const create = useMusubiCommand(store, "create_diff_review");
  const refetch = useBoardRefetch();
  const [name, setName] = useState("");
  const [branches, setBranches] = useState<BranchGroups | null>(null);
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  const [baseRef, setBaseRef] = useState<string | null>(null);
  const [headRef, setHeadRef] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listBranches.dispatch({ project_id: project.id }).then((reply) => {
      if (cancelled) return;
      if (reply.error) {
        setLoadError(reply.error);
        setBranches({ local: [], remote: [] });
        return;
      }
      setBranches({
        local: reply.branches,
        remote: reply.remote_branches ?? [],
      });
      setDefaultBranch(reply.default);
      setBaseRef(reply.default);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const disabled = create.isPending || branches === null || name.trim() === "" || !headRef;

  async function save() {
    if (!headRef) return;
    setError(null);
    try {
      const reply = await create.dispatch({
        project_id: project.id,
        name: name.trim(),
        base_ref: baseRef,
        head_ref: headRef,
      });
      if (reply.error) {
        setError(reply.error);
        return;
      }
      refetch();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create diff review");
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-line bg-surface p-3.5">
      <div className="mb-3 flex items-center gap-2">
        <FileDiff size={14} className="text-blue" />
        <h3 className="text-[13px] font-semibold text-heading">New diff review</h3>
      </div>

      <label className="mb-3 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">Review name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Auth rewrite"
          className="rounded-md border border-line bg-control px-2.5 py-1.5 text-[13px] text-text focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25"
        />
      </label>

      {loadError ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-2.5 text-[12px] text-red"
        >
          {loadError}
        </motion.p>
      ) : (
        <div className="mb-2 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Base</span>
            <BranchCombobox
              ariaLabel="Base branch"
              groups={branches}
              defaultBranch={defaultBranch}
              value={baseRef}
              onChange={setBaseRef}
              placeholder={branches === null ? "Loading…" : "Select base"}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Head</span>
            <BranchCombobox
              ariaLabel="Head branch"
              groups={branches}
              defaultBranch={defaultBranch}
              value={headRef}
              onChange={setHeadRef}
              placeholder={branches === null ? "Loading…" : "Select head"}
            />
          </label>
        </div>
      )}

      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-2.5 text-[12px] text-red"
        >
          {error}
        </motion.p>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
          Cancel
        </Button>
        <Button size="sm" disabled={disabled} onClick={() => void save()}>
          {create.isPending ? "Creating…" : "Create diff review"}
        </Button>
      </div>
    </div>
  );
}

function CreateProjectDialog({
  store,
  open,
  onOpenChange,
}: {
  store: BoardStore;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { dispatch, isPending } = useMusubiCommand(store, "create_project");
  const refetch = useBoardRefetch();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [respectGitignore, setRespectGitignore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setPath("");
      setRespectGitignore(true);
      setError(null);
    }
  }, [open]);

  async function submit() {
    setError(null);
    const reply = await dispatch({
      name: name.trim(),
      path: path.trim(),
      respect_gitignore: respectGitignore,
    });
    if (reply.project_id) {
      setName("");
      setPath("");
      setRespectGitignore(true);
      refetch();
      onOpenChange(false);
    } else {
      setError(reply.error ?? "Could not create project");
    }
  }

  const disabled = isPending || name.trim() === "" || path.trim() === "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus size={16} className="text-blue" />
            New project
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Project name"
              className="rounded-md border border-line bg-control px-2.5 py-1.5 text-[13px] text-text focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Working directory</span>
            <input
              type="text"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/Users/you/notes"
              className="rounded-md border border-line bg-control px-2.5 py-1.5 font-mono text-[12.5px] text-text focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25"
            />
          </label>

          <p className="text-[11px] text-faint">Scans the directory for files to review.</p>

          <RespectGitignoreToggle pressed={respectGitignore} onPressedChange={setRespectGitignore} />

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[12px] text-red"
            >
              {error}
            </motion.p>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button type="submit" size="sm" disabled={disabled}>
              {isPending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RespectGitignoreToggle({
  pressed,
  onPressedChange,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-muted-foreground">Respect .gitignore</p>
        <p className="text-[11px] text-faint">Off lists every file, including ignored ones.</p>
      </div>
      <Toggle
        variant="outline"
        size="sm"
        pressed={pressed}
        onPressedChange={onPressedChange}
        aria-label="Respect .gitignore"
      >
        {pressed ? "On" : "Off"}
      </Toggle>
    </div>
  );
}

function EditProjectSettingsDialog({
  store,
  project,
  open,
  onOpenChange,
}: {
  store: BoardStore;
  project: BoardProject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { dispatch, isPending } = useMusubiCommand(store, "update_project");
  const refetch = useBoardRefetch();
  const [respectGitignore, setRespectGitignore] = useState(project.respect_gitignore);
  const [error, setError] = useState<string | null>(null);

  // Reseed from the project snapshot whenever the dialog reopens, so a prior
  // unsaved toggle does not linger.
  useEffect(() => {
    if (open) {
      setRespectGitignore(project.respect_gitignore);
      setError(null);
    }
  }, [open, project.respect_gitignore]);

  async function submit() {
    setError(null);
    const reply = await dispatch({
      project_id: project.id,
      respect_gitignore: respectGitignore,
    });
    if (reply.error) {
      setError(reply.error);
    } else {
      refetch();
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings size={16} className="text-blue" />
            Project settings
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-3"
        >
          <p className="truncate font-mono text-[11px] text-faint">{project.path}</p>

          <RespectGitignoreToggle pressed={respectGitignore} onPressedChange={setRespectGitignore} />

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[12px] text-red"
            >
              {error}
            </motion.p>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Saving…" : "Save settings"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type BranchGroups = { local: string[]; remote: string[] };

/**
 * Branch picker with type-ahead search and Local / Remote grouping. Built as
 * a Popover + filtered list because a plain `<select>` is unusable for repos
 * with many branches and the project has no shared combobox primitive yet.
 */
function BranchCombobox({
  ariaLabel,
  groups,
  defaultBranch,
  value,
  onChange,
  placeholder,
}: {
  ariaLabel: string;
  groups: BranchGroups | null;
  defaultBranch: string | null;
  value: string | null;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => filterBranchGroups(groups, query), [groups, query]);
  const total = filtered.local.length + filtered.remote.length;

  useEffect(() => {
    if (open) {
      setQuery("");
      // Focus the search input on next paint so type-to-search works
      // immediately.
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={ariaLabel}
            disabled={groups === null}
            className="flex h-8 w-full cursor-pointer items-center justify-between gap-1.5 rounded-md border border-line bg-control px-2 text-left text-[13px] text-text transition-colors hover:bg-hover focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25 aria-expanded:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
          />
        }
      >
        <span className={`min-w-0 truncate ${value ? "" : "text-faint"}`}>
          {value ?? placeholder}
        </span>
        {value !== null && value === defaultBranch && (
          <span
            className="shrink-0 rounded bg-blue-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue ring-1 ring-inset ring-blue/30"
            title="Repository default branch"
          >
            default
          </span>
        )}
        <ChevronsUpDown size={13} className="shrink-0 text-faint" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-56 max-w-80 gap-0 p-0">
        <div className="flex items-center gap-1.5 border-b border-line px-2.5 py-1.5">
          <Search size={12} className="shrink-0 text-faint" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search branches…"
            aria-label="Search branches"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-faint"
          />
        </div>
        <div role="listbox" className="max-h-64 overflow-y-auto py-1">
          {total === 0 ? (
            <p className="px-3 py-2 text-[12px] text-faint">No branches match.</p>
          ) : (
            <>
              {filtered.local.length > 0 && (
                <BranchGroup
                  label="Local"
                  branches={filtered.local}
                  value={value}
                  defaultBranch={defaultBranch}
                  onPick={(branch) => {
                    onChange(branch);
                    setOpen(false);
                  }}
                />
              )}
              {filtered.remote.length > 0 && (
                <BranchGroup
                  label="Remote (origin)"
                  branches={filtered.remote}
                  value={value}
                  defaultBranch={defaultBranch}
                  onPick={(branch) => {
                    onChange(branch);
                    setOpen(false);
                  }}
                />
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BranchGroup({
  label,
  branches,
  value,
  defaultBranch,
  onPick,
}: {
  label: string;
  branches: string[];
  value: string | null;
  defaultBranch: string | null;
  onPick: (branch: string) => void;
}) {
  return (
    <div className="px-1 pb-1">
      <p className="border-b border-line-soft px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {branches.map((branch) => {
        const selected = branch === value;
        const isDefault = branch === defaultBranch;
        return (
          <button
            key={branch}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onPick(branch)}
            className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] text-text transition-colors hover:bg-tint"
          >
            <span className="flex w-3.5 shrink-0 justify-center text-blue">
              {selected && <Check size={12} />}
            </span>
            <span className="min-w-0 flex-1 truncate">{branch}</span>
            {isDefault && (
              <span
                className="shrink-0 rounded bg-blue-soft px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-blue ring-1 ring-inset ring-blue/30"
                title="Repository default branch"
              >
                default
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function filterBranchGroups(groups: BranchGroups | null, query: string): BranchGroups {
  if (groups === null) return { local: [], remote: [] };
  const q = query.trim().toLowerCase();
  if (q === "") return groups;
  const match = (branch: string) => branch.toLowerCase().includes(q);
  return { local: groups.local.filter(match), remote: groups.remote.filter(match) };
}
