import { useState } from "react"

import { motion } from "motion/react"
import { ArrowRight, Check, FilePlus2, FolderPlus, Pencil, X } from "lucide-react"

import type { StoreProxy } from "@musubi/react"

import { useMusubiCommand, useMusubiRoot, useMusubiSnapshot } from "../musubi"
import { FileTree } from "./FileTree"
import { ThemeMenu } from "./ThemeMenu"
import { Button } from "@/components/ui/button"

interface ReviewFile {
  artifact_id: string
  path: string
  approved: boolean
}

interface BoardReview {
  id: string
  name: string
  files: ReviewFile[]
}

interface BoardProject {
  id: string
  name: string
  path: string
  files: string[]
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

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-14">
      <header className="mb-7 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold tracking-tight text-heading">Reviews</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Register a working directory, then group its files into reviews.
          </p>
        </div>
        <ThemeMenu />
      </header>

      <CreateProjectForm store={store} />

      {hasProjects ? (
        <div className="mt-8 space-y-9">
          {snapshot.projects.map((project) => (
            <ProjectSection key={project.id} store={store} project={project} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <p className="mt-6 text-[12px] text-faint">
          No projects yet. Add a working directory above to begin.
        </p>
      )}
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
          {project.reviews.map((review) => (
            <ReviewCard
              key={review.id}
              store={store}
              project={project}
              review={review}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function ReviewCard({
  store,
  project,
  review,
  onOpen
}: {
  store: BoardStore
  project: BoardProject
  review: BoardReview
  onOpen: (artifactId: string) => void
}) {
  const [editing, setEditing] = useState(false)

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="truncate text-[13px] font-semibold text-heading">{review.name}</h3>
          <span className="shrink-0 text-[11px] text-faint">
            {review.files.length} {review.files.length === 1 ? "file" : "files"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing((value) => !value)}
          className="shrink-0 text-muted-foreground pointer-coarse:min-h-9"
        >
          {editing ? <X size={12} /> : <Pencil size={12} />}
          {editing ? "Cancel" : "Edit files"}
        </Button>
      </div>

      {editing ? (
        <div className="p-3.5">
          <ReviewComposer
            store={store}
            project={project}
            command="update_review_files"
            reviewId={review.id}
            initial={new Set(review.files.map((file) => file.path))}
            onClose={() => setEditing(false)}
          />
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {review.files.map((file) => (
            <li key={file.artifact_id}>
              <button
                type="button"
                onClick={() => onOpen(file.artifact_id)}
                className="group flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-hover pointer-coarse:min-h-11"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-text">
                  {file.path}
                </span>
                {file.approved && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-green">
                    <Check size={12} />
                    Approved
                  </span>
                )}
                <ArrowRight
                  size={13}
                  className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
  const [name, setName] = useState("")
  const [selected, setSelected] = useState<Set<string>>(initial)
  const [error, setError] = useState<string | null>(null)

  const isCreate = command === "create_review"
  const pending = isCreate ? create.isPending : update.isPending
  const disabled =
    pending || selected.size === 0 || (isCreate && name.trim() === "")

  async function save() {
    setError(null)
    const file_paths = [...selected]

    try {
      const reply = isCreate
        ? await create.dispatch({ project_id: project.id, name: name.trim(), file_paths })
        : await update.dispatch({ review_id: reviewId as string, file_paths })

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
      <FileTree files={project.files} selected={selected} onChange={setSelected} />

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

function CreateProjectForm({ store }: { store: BoardStore }) {
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
    } else {
      setError(reply.error ?? "Could not create project")
    }
  }

  const disabled = isPending || name.trim() === "" || path.trim() === ""

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="rounded-xl border border-line bg-surface p-4 shadow-[var(--surface-shadow)] sm:p-5"
    >
      <div className="mb-3.5 flex items-center gap-2">
        <FolderPlus size={15} className="text-blue" />
        <h2 className="text-[13px] font-semibold text-heading">New project</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
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
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 text-[12px] text-red"
        >
          {error}
        </motion.p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[11px] text-faint">Scans the directory for files to review.</p>
        <Button
          type="submit"
          size="sm"
          disabled={disabled}
          className="shrink-0 pointer-coarse:min-h-9"
        >
          {isPending ? "Creating…" : "Create project"}
        </Button>
      </div>
    </form>
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
