import { useState } from "react"

import { motion } from "motion/react"
import { ArrowRight, Check, FileText, FolderPlus } from "lucide-react"

import type { StoreProxy } from "@musubi/react"

import { useMusubiCommand, useMusubiRoot, useMusubiSnapshot } from "../musubi"

interface BoardFile {
  path: string
  artifact_id: string | null
}

interface BoardProject {
  id: string
  name: string
  files: BoardFile[]
}

interface BoardSnapshot {
  projects: BoardProject[]
}

type BoardStore = StoreProxy<"SuikouWeb.Stores.ProjectBoardStore", Musubi.Stores>

/** Project/file picker: the reviewer's entry point before an artifact exists. */
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
  const { dispatch, isPending } = useMusubiCommand(store, "create_artifact")
  const [pendingFile, setPendingFile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function select(project: BoardProject, file: BoardFile) {
    if (file.artifact_id) {
      onOpen(file.artifact_id)
      return
    }

    const key = `${project.id}:${file.path}`
    setPendingFile(key)
    setError(null)
    const reply = await dispatch({ project_id: project.id, file_path: file.path })
    setPendingFile(null)

    if (reply.artifact_id) {
      onOpen(reply.artifact_id)
    } else {
      setError(reply.error ?? "Could not open file")
    }
  }

  const hasProjects = snapshot.projects.length > 0

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-14">
      <header className="mb-7">
        <h1 className="text-[20px] font-semibold tracking-tight text-heading">Reviews</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Register a working directory, then open any markdown file to start a review.
        </p>
      </header>

      <CreateProjectForm store={store} />

      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-6 rounded-md bg-red-soft px-3 py-2 text-[12px] text-red"
        >
          {error}
        </motion.p>
      )}

      {hasProjects ? (
        <div className="mt-8 space-y-7">
          {snapshot.projects.map((project) => (
            <ProjectSection
              key={project.id}
              project={project}
              pendingFile={pendingFile}
              isPending={isPending}
              onSelect={select}
            />
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
  project,
  pendingFile,
  isPending,
  onSelect
}: {
  project: BoardProject
  pendingFile: string | null
  isPending: boolean
  onSelect: (project: BoardProject, file: BoardFile) => void
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="text-[13px] font-semibold text-heading">{project.name}</h2>
        <span className="shrink-0 text-[11px] text-faint">
          {project.files.length} {project.files.length === 1 ? "file" : "files"}
        </span>
      </div>

      {project.files.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3.5 py-3 text-[12px] text-faint">
          No markdown files in this directory yet.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {project.files.map((file) => {
            const busy = isPending && pendingFile === `${project.id}:${file.path}`
            return (
              <li key={file.path}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSelect(project, file)}
                  className="group flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-hover disabled:opacity-60 pointer-coarse:min-h-11"
                >
                  <FileText size={14} className="shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-text">
                    {file.path}
                  </span>
                  <FileState busy={busy} started={file.artifact_id !== null} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function FileState({ busy, started }: { busy: boolean; started: boolean }) {
  if (busy) {
    return <span className="shrink-0 text-[11px] text-faint">Opening…</span>
  }

  if (started) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
        <Check size={12} />
        In review
      </span>
    )
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-blue opacity-0 transition-opacity group-hover:opacity-100">
      Start review
      <ArrowRight size={12} />
    </span>
  )
}

function CreateProjectForm({ store }: { store: BoardStore }) {
  const { dispatch, isPending } = useMusubiCommand(store, "create_project")
  const [name, setName] = useState("")
  const [path, setPath] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
      onSubmit={(event) => void submit(event)}
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
        <p className="text-[11px] text-faint">Scans the directory for markdown files to review.</p>
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-blue px-3 py-1.5 text-[12px] font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50 pointer-coarse:min-h-9"
        >
          {isPending ? "Creating…" : "Create project"}
        </button>
      </div>
    </form>
  )
}

function Centered(props: { children: React.ReactNode; tone?: "error" }) {
  return (
    <div className="flex h-screen items-center justify-center text-sm" data-tone={props.tone}>
      <span className={props.tone === "error" ? "text-red" : "text-muted-foreground"}>{props.children}</span>
    </div>
  )
}
