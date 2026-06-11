import { useState } from "react"

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

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-6 text-lg font-semibold">Projects</h1>
      <CreateProjectForm store={store} />
      {error && <p className="mb-4 text-sm text-red">{error}</p>}
      {snapshot.projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects yet. Add one above.</p>
      ) : (
        <div className="space-y-6">
          {snapshot.projects.map((project) => (
          <section key={project.id}>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">{project.name}</h2>
            <ul className="divide-y divide-border rounded-md border border-border">
              {project.files.map((file) => {
                const key = `${project.id}:${file.path}`
                const busy = isPending && pendingFile === key
                return (
                  <li key={file.path}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void select(project, file)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-60"
                    >
                      <span className="min-w-0 truncate font-mono">{file.path}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {busy ? "Opening…" : file.artifact_id ? "In review" : "Start review"}
                      </span>
                    </button>
                  </li>
                )
              })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
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
    <form onSubmit={(event) => void submit(event)} className="mb-8 space-y-3 rounded-md border border-border p-4">
      <h2 className="text-sm font-medium">New project</h2>
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Project name"
        className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
      />
      <input
        type="text"
        value={path}
        onChange={(event) => setPath(event.target.value)}
        placeholder="Working directory (absolute path)"
        className="w-full rounded-md border border-border bg-transparent px-3 py-2 font-mono text-sm"
      />
      {error && <p className="text-sm text-red">{error}</p>}
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
      >
        {isPending ? "Creating…" : "Create project"}
      </button>
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
