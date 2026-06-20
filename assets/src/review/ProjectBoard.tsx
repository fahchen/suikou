import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Code2,
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
  Trash2,
} from "lucide-react";

import type { StoreProxy, StoreSnapshot } from "@musubi/react";

import {
  storeCache,
  useMusubiCommand,
  useMusubiRoot,
  useMusubiSnapshot,
  usePrefetchReviewStore,
} from "../musubi";
import { useMediaQuery, WIDE_QUERY } from "../hooks/use-media-query";
import { FileTree } from "./FileTree";
import { ReviewFileTree } from "./ReviewFileTree";
import { orderedReviewFiles } from "./file-order";
import { ThemeMenu } from "./ThemeMenu";
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

type BoardStore = StoreProxy<"SuikouWeb.Stores.ProjectBoardStore", Musubi.Stores>;
type BoardSnapshot = StoreSnapshot<"SuikouWeb.Stores.ProjectBoardStore", Musubi.Stores>;
type BoardProject = BoardSnapshot["projects"][number];
type BoardReview = BoardProject["reviews"][number];
type ReviewFilesAsync = BoardSnapshot["review_files"];
type ReviewFileEntry = NonNullable<ReviewFilesAsync["data"]>[number]["files"][number];

const KIND_META: Record<
  BoardReview["kind"],
  {
    icon: typeof FileText;
    badgeIcon: typeof FileText;
    badge: string;
    title: string;
    badgeClass: string;
  }
> = {
  file_selection: {
    icon: FileText,
    badgeIcon: FileText,
    badge: "Files",
    title: "File selection review",
    badgeClass: "bg-kind-files-bg text-kind-files-fg ring-1 ring-inset ring-kind-files-ring",
  },
  git_diff: {
    icon: GitCompare,
    badgeIcon: GitCompare,
    badge: "Diff",
    title: "Git diff review",
    badgeClass: "bg-kind-diff-bg text-kind-diff-fg ring-1 ring-inset ring-kind-diff-ring",
  },
};

/** Per-review file list from the async board field — `null` until it resolves. */
function filesForReview(reviewFiles: ReviewFilesAsync, reviewId: string): ReviewFileEntry[] | null {
  const entry = reviewFiles.data?.find((e) => e.review_id === reviewId);
  return entry ? entry.files : null;
}

function fileCountLabel(
  files: ReviewFileEntry[] | null,
  status: ReviewFilesAsync["status"],
): string {
  if (files) return `${files.length} ${files.length === 1 ? "file" : "files"}`;
  if (status === "failed") return "–";
  return "Loading…";
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
  const snapshot = useMusubiSnapshot(store);
  const hasProjects = snapshot.projects.length > 0;
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-7 sm:py-16">
      <header className="mb-9 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-0.018em] text-heading">Reviews</h1>
          <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
            Register a working directory, then group its files into reviews.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="pill"
            size="icon"
            onClick={() => setCreating(true)}
            title="New project"
            aria-label="New project"
          >
            <FolderPlus className="size-4 text-muted-foreground" />
          </Button>
          <ThemeMenu />
        </div>
      </header>

      {hasProjects ? (
        <div className="space-y-10">
          {snapshot.projects.map((project) => (
            <ProjectSection
              key={project.id}
              store={store}
              project={project}
              reviewFiles={snapshot.review_files}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : (
        <p className="mt-6 text-[12px] text-faint">
          No projects yet. Create one to start reviewing its files.
        </p>
      )}

      <CreateProjectDialog store={store} open={creating} onOpenChange={setCreating} />
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
  reviewFiles: ReviewFilesAsync;
  onOpen: (reviewId: string, path: string) => void;
}) {
  const [composing, setComposing] = useState<"files" | "diff" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const removeProject = useMusubiCommand(store, "delete_project");
  const reviewCount = project.reviews.length;
  const reviewLabel = `${reviewCount} review${reviewCount === 1 ? "" : "s"}`;

  return (
    <section>
      <div className="mb-3.5 flex items-baseline justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-heading">
            {project.name}
          </h2>
          <p className="mt-0.5 truncate font-mono text-[11px] leading-snug text-faint">
            {project.path}
          </p>
        </div>
        {composing === null && (
          <div className="flex shrink-0 items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="default"
                    className="shrink-0 text-muted-foreground hover:text-heading"
                    title="New review"
                    aria-label="New review"
                  />
                }
              >
                <Plus />
                New review
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem onClick={() => setComposing("files")}>
                  <FilePlus2 />
                  Review files
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setComposing("diff")}>
                  <FileDiff />
                  Review diff
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="-mr-1 shrink-0 text-muted-foreground"
                    title="Project actions"
                    aria-label="Project actions"
                  />
                }
              >
                <MoreHorizontal size={15} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={14} />
                  Delete project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

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
          <p className="rounded-lg border border-dashed border-line px-3.5 py-3 text-[12px] text-faint">
            No reviews yet. Start one to pick the files you want to review together.
          </p>
        )
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {project.reviews.map((review, index) => (
              <ReviewCard
                key={review.id}
                index={index}
                store={store}
                project={project}
                review={review}
                files={filesForReview(reviewFiles, review.id)}
                filesStatus={reviewFiles.status}
                onOpen={onOpen}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

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
                void removeProject.dispatch({ project_id: project.id });
                setConfirmDelete(false);
              }}
            >
              <Trash2 size={14} />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ReviewCard({
  store,
  project,
  review,
  files,
  filesStatus,
  index,
  onOpen,
}: {
  store: BoardStore;
  project: BoardProject;
  review: BoardReview;
  files: ReviewFileEntry[] | null;
  filesStatus: ReviewFilesAsync["status"];
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
  const prefetchReview = usePrefetchReviewStore();
  const open = editing || expanded;
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const fileCount = files?.length ?? 0;
  const filesLoading = files === null && filesStatus !== "failed";
  const canOpen = fileCount > 0;
  // An HTML review is a file-selection review whose files are all HTML docs;
  // there is no distinct board `kind` for it, so detect it from the resolved
  // file list to set it apart from a generic file selection at a glance.
  const isHtmlReview =
    review.kind === "file_selection" &&
    files !== null &&
    files.length > 0 &&
    files.every((file) => isHtmlPath(file.path));

  async function handleOpen(path: string) {
    setPendingPath(path);
    try {
      onOpen(review.id, path);
    } finally {
      setPendingPath(null);
    }
  }

  function openReview() {
    if (!files || files.length === 0) return;
    void handleOpen(orderedReviewFiles(files)[0].path);
  }

  // Warm the ReviewStore cache for the file `openReview` would open, so a
  // hover-then-click paints instantly. Unminted files stay skipped because
  // route entry is now the only place that mints `artifact_id`s.
  function prefetchFirstFile() {
    const first = files ? orderedReviewFiles(files)[0] : undefined;
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
      void rename.dispatch({ review_id: review.id, name: next });
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
      className="group/card relative overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--elev-1)] transition-[box-shadow,border-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:border-line-strong hover:shadow-[var(--elev-2)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-center gap-1.5 px-3 py-2.5">
        <button
          type="button"
          onClick={() => {
            if (!editing) setExpanded((value) => !value);
          }}
          aria-expanded={open}
          aria-label={open ? "Collapse files" : "Expand files"}
          className="-ml-1 shrink-0 cursor-pointer rounded-md p-1 text-faint transition-colors hover:bg-hover hover:text-muted-foreground"
        >
          <ChevronRight
            size={14}
            className={`transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
          />
        </button>

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
            aria-busy={filesLoading}
            aria-label={`Open ${review.name}`}
            title={
              filesLoading ? "Loading review files…" : canOpen ? "Open review" : "No files to open"
            }
            onClick={openReview}
            onMouseEnter={prefetchFirstFile}
            onFocus={prefetchFirstFile}
            className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
          >
            <h3 className="truncate text-[13.5px] font-semibold tracking-[-0.005em] text-heading">
              {review.name}
            </h3>
            <BadgeChip kind={review.kind} />
            {isHtmlReview && <HtmlBadge />}
            {pendingPath !== null && (
              <Loader2
                size={12}
                className="shrink-0 animate-spin text-blue"
                aria-label="Opening file"
              />
            )}
            <span
              className="ml-auto hidden shrink-0 items-center gap-1.5 text-[11px] tabular-nums text-faint sm:inline-flex"
              title={fullTimestamp(review.inserted_at)}
            >
              {filesLoading ? (
                <span className="inline-flex items-center gap-1" aria-label="Loading files">
                  <Loader2 size={11} className="animate-spin" aria-hidden />
                  <span className="h-2.5 w-10 animate-pulse rounded-sm bg-soft" />
                </span>
              ) : (
                <span aria-label={`${fileCountLabel(files, filesStatus)}`}>
                  {fileCountLabel(files, filesStatus)}
                </span>
              )}
              <span aria-hidden className="text-line-strong">
                ·
              </span>
              <span>{elapsed(review.inserted_at)}</span>
            </span>
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground"
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

      {review.kind === "git_diff" && <DiffRefsLine review={review} />}

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
              {files === null ? (
                <p className="border-t border-line px-3.5 py-3 text-[12px] text-faint">
                  {filesStatus === "failed" ? "Could not load files." : "Loading…"}
                </p>
              ) : files.length === 0 ? (
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
                void remove.dispatch({ review_id: review.id });
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

function BadgeChip({ kind }: { kind: BoardReview["kind"] }) {
  const meta = KIND_META[kind];
  const Icon = meta.badgeIcon;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.06em] ${meta.badgeClass}`}
      title={meta.title}
    >
      <Icon size={10} aria-hidden />
      {meta.badge}
    </span>
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

function DiffRefsLine({ review }: { review: BoardReview }) {
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

  const baseLabel = formatRefLabel(review.base_ref, review.base_sha, review.creation_base_sha);
  const headLabel = formatRefLabel(review.head_ref, review.head_sha, review.creation_head_sha);

  return (
    <div className="-mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-2.5 pl-8 text-[11px] text-muted-foreground">
      <span className="truncate font-mono text-text2" title="Comparing refs">
        {baseLabel}..{headLabel}
      </span>
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
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const reply = await dispatch({ name: name.trim(), path: path.trim() });
    if (reply.project_id) {
      setName("");
      setPath("");
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
