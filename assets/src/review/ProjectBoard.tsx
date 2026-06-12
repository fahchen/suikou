import { useCallback, useState } from "react"

import { AnimatePresence, motion } from "motion/react"
import {
  ChevronRight,
  FilePlus2,
  FileStack,
  FolderPlus,
  MoreHorizontal,
  PenLine,
  Trash2
} from "lucide-react"

import type { StoreProxy } from "@musubi/react"

import { useMusubiCommand, useMusubiRoot, useMusubiSnapshot } from "../musubi"
import { FileTree } from "./FileTree"
import { ReviewFileTree } from "./ReviewFileTree"
import { ThemeMenu } from "./ThemeMenu"
import { elapsed, fullTimestamp } from "./time"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"

interface ReviewFile {
  artifact_id: string
  path: string
  approved: boolean
}

interface BoardReview {
  id: string
  name: string
  inserted_at: string
  selections: string[]
  files: ReviewFile[]
}

interface BoardProject {
  id: string
  name: string
  path: string
  reviews: BoardReview[]
}

interface BoardSnapshot {
  projects: BoardProject[]
}

type BoardStore = StoreProxy<"SuikouWeb.Stores.ProjectBoardStore", Musubi.Stores>

/** Project board: register directories, then group files into reviews. */
export function ProjectBoard({ onOpen }: { onOpen: (artifactId: string) => void }) {
  const root = useMusubiRoot({
    module: "SuikouWeb.Stores.ProjectBoardStore",
    id: "board",
    params: {}
  })

  if (root.status === "loading") return <Centered>Loading projects…</Centered>
  if (root.status === "error") return <Centered tone="error">{root.error.message}</Centered>

  return <Board store={root.store} onOpen={onOpen} />
}

function Board({ store, onOpen }: { store: BoardStore; onOpen: (artifactId: string) => void }) {
  const snapshot = useMusubiSnapshot(store) as unknown as BoardSnapshot
  const hasProjects = snapshot.projects.length > 0
  const [creating, setCreating] = useState(false)

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-14">
      <header className="mb-7 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold tracking-tight text-heading">Reviews</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Register a working directory, then group its files into reviews.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="pill"
            size="icon-xs"
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
        <div className="space-y-9">
          {snapshot.projects.map((project) => (
            <ProjectSection key={project.id} store={store} project={project} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <p className="mt-6 text-[12px] text-faint">
          No projects yet. Create one to start reviewing its files.
        </p>
      )}

      <CreateProjectDialog store={store} open={creating} onOpenChange={setCreating} />
    </div>
  )
}

function ProjectSection({
  store,
  project,
  onOpen
}: {
  store: BoardStore
  project: BoardProject
  onOpen: (artifactId: string) => void
}) {
  const [composing, setComposing] = useState(false)

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-heading">{project.name}</h2>
          <p className="mt-0.5 truncate font-mono text-[11px] text-faint">{project.path}</p>
        </div>
        {!composing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setComposing(true)}
            className="shrink-0 pointer-coarse:min-h-9"
          >
            <FilePlus2 size={13} />
            New review
          </Button>
        )}
      </div>

      {composing && (
        <ReviewComposer
          store={store}
          project={project}
          command="create_review"
          initial={new Set()}
          title="New review"
          onClose={() => setComposing(false)}
        />
      )}

      {project.reviews.length === 0 ? (
        !composing && (
          <p className="rounded-lg border border-dashed border-line px-3.5 py-3 text-[12px] text-faint">
            No reviews yet. Start one to pick the files you want to review together.
          </p>
        )
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {project.reviews.map((review, index) => (
              <ReviewCard
                key={review.id}
                index={index}
                store={store}
                project={project}
                review={review}
                onOpen={onOpen}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  )
}

function ReviewCard({
  store,
  project,
  review,
  index,
  onOpen
}: {
  store: BoardStore
  project: BoardProject
  review: BoardReview
  index: number
  onOpen: (artifactId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(review.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const remove = useMusubiCommand(store, "delete_review")
  const rename = useMusubiCommand(store, "rename_review")
  const open = editing || expanded
  const firstFile = review.files[0]

  function startRename() {
    setDraftName(review.name)
    setRenaming(true)
  }

  function saveRename() {
    if (!renaming) return
    const next = draftName.trim()
    setRenaming(false)
    if (next && next !== review.name) {
      void rename.dispatch({ review_id: review.id, name: next })
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1], delay: index * 0.04 }}
      className="overflow-hidden rounded-lg border border-line bg-surface"
    >
      <div className="flex items-center gap-1 px-3 py-2">
        <button
          type="button"
          onClick={() => {
            if (!editing) setExpanded((value) => !value)
          }}
          aria-expanded={open}
          aria-label={open ? "Collapse files" : "Expand files"}
          className="-ml-1 shrink-0 rounded p-1 text-faint transition-colors hover:text-muted-foreground pointer-coarse:min-h-9"
        >
          <ChevronRight
            size={14}
            className={`transition-transform ${open ? "rotate-90" : ""}`}
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
                event.preventDefault()
                saveRename()
              } else if (event.key === "Escape") {
                event.preventDefault()
                setRenaming(false)
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-line bg-control px-2 py-1 text-[13px] font-semibold text-heading focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25"
          />
        ) : (
          <button
            type="button"
            disabled={!firstFile}
            aria-label={`Open ${review.name}`}
            title={firstFile ? "Open review" : "No files to open"}
            onClick={() => firstFile && onOpen(firstFile.artifact_id)}
            className="group flex min-w-0 flex-1 items-center gap-2 text-left pointer-coarse:min-h-9"
          >
            <h3 className="truncate text-[13px] font-semibold text-heading decoration-line/70 underline-offset-[3px] group-hover:underline">
              {review.name}
            </h3>
            <span className="shrink-0 text-[11px] text-faint">
              {review.files.length} {review.files.length === 1 ? "file" : "files"}
            </span>
            <span
              className="hidden shrink-0 text-[11px] text-faint sm:inline"
              title={fullTimestamp(review.inserted_at)}
            >
              · {elapsed(review.inserted_at)}
            </span>
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
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
            <DropdownMenuItem
              onClick={() => {
                setExpanded(true)
                setEditing(true)
              }}
            >
              <FileStack size={14} />
              Edit files
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} />
              Delete review
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {editing ? (
        <div className="border-t border-line p-3.5">
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
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-hidden"
            >
              {review.files.length === 0 ? (
                <p className="border-t border-line px-3.5 py-3 text-[12px] text-faint">
                  No files in this review.
                </p>
              ) : (
                <div className="border-t border-line py-1">
                  <ReviewFileTree files={review.files} onOpen={onOpen} />
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
            Permanently removes <b className="text-heading">{review.name}</b> and its{" "}
            {review.files.length} {review.files.length === 1 ? "file" : "files"}, along with every
            comment on them. This cannot be undone.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" className="h-10 sm:h-7" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              className="h-10 sm:h-7"
              disabled={remove.isPending}
              onClick={() => {
                void remove.dispatch({ review_id: review.id })
                setConfirmDelete(false)
              }}
            >
              <Trash2 size={14} />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

function ReviewComposer({
  store,
  project,
  command,
  reviewId,
  initial,
  title,
  onClose
}: {
  store: BoardStore
  project: BoardProject
  command: "create_review" | "update_review_files"
  reviewId?: string
  initial: Set<string>
  title?: string
  onClose: () => void
}) {
  const create = useMusubiCommand(store, "create_review")
  const update = useMusubiCommand(store, "update_review_files")
  const list = useMusubiCommand(store, "list_dir")
  const [name, setName] = useState("")
  const [selected, setSelected] = useState<Set<string>>(initial)
  const [error, setError] = useState<string | null>(null)

  // Read one directory level on demand, so opening the picker never walks the
  // whole working directory.
  const loadDir = useCallback(
    (path: string) => list.dispatch({ project_id: project.id, path }).then((reply) => reply.entries),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.id]
  )

  const isCreate = command === "create_review"
  const pending = isCreate ? create.isPending : update.isPending
  const disabled =
    pending || selected.size === 0 || (isCreate && name.trim() === "")

  async function save() {
    setError(null)
    const selections = [...selected]

    try {
      const reply = isCreate
        ? await create.dispatch({ project_id: project.id, name: name.trim(), selections })
        : await update.dispatch({ review_id: reviewId as string, selections })

      if (reply.error) {
        setError(reply.error)
        return
      }

      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save review")
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
            className="rounded-md border border-line bg-control px-2.5 py-1.5 text-[13px] text-text focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25 pointer-coarse:min-h-9"
          />
        </label>
      )}

      <div className="mb-1 text-[11px] font-medium text-muted-foreground">
        Files <span className="text-faint">({selected.size} selected)</span>
      </div>
      <FileTree loadDir={loadDir} selected={selected} onChange={setSelected} />

      {error && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2.5 text-[12px] text-red">
          {error}
        </motion.p>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-muted-foreground pointer-coarse:min-h-9"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => void save()}
          className="pointer-coarse:min-h-9"
        >
          {pending ? "Saving…" : isCreate ? "Create review" : "Save files"}
        </Button>
      </div>
    </div>
  )
}

function CreateProjectDialog({
  store,
  open,
  onOpenChange
}: {
  store: BoardStore
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { dispatch, isPending } = useMusubiCommand(store, "create_project")
  const [name, setName] = useState("")
  const [path, setPath] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    const reply = await dispatch({ name: name.trim(), path: path.trim() })
    if (reply.project_id) {
      setName("")
      setPath("")
      onOpenChange(false)
    } else {
      setError(reply.error ?? "Could not create project")
    }
  }

  const disabled = isPending || name.trim() === "" || path.trim() === ""

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
            event.preventDefault()
            void submit()
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
              className="rounded-md border border-line bg-control px-2.5 py-1.5 text-[13px] text-text focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25 pointer-coarse:min-h-9"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Working directory</span>
            <input
              type="text"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/Users/you/notes"
              className="rounded-md border border-line bg-control px-2.5 py-1.5 font-mono text-[12.5px] text-text focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25 pointer-coarse:min-h-9"
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
            <DialogClose render={<Button variant="outline" size="sm" className="h-10 sm:h-7" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              size="sm"
              className="h-10 sm:h-7"
              disabled={disabled}
            >
              {isPending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Centered(props: { children: React.ReactNode; tone?: "error" }) {
  return (
    <div className="flex h-screen items-center justify-center text-sm" data-tone={props.tone}>
      <span className={props.tone === "error" ? "text-red" : "text-muted-foreground"}>
        {props.children}
      </span>
    </div>
  )
}
