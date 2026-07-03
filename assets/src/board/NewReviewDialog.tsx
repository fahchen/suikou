import { useEffect, useState } from "react"
import { ChevronRight, Folder, X } from "lucide-react"

import { useMusubiCommand } from "../musubi"
import { Checkbox } from "../components/ui/checkbox"
import { Select } from "../components/ui/select"
import { FileIcon } from "./FileIcon"
import type { BoardProject, BoardStore } from "./types"

type Kind = "files" | "diff"

/** Compose a new review: pick files from the project tree, or a diff between
 * two refs. Dispatches create_review or create_diff_review, then refetches. */
export function NewReviewDialog({
  store,
  project,
  kind,
  open,
  onClose,
  onCreated,
}: {
  store: BoardStore
  project: BoardProject
  kind: Kind
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const createFiles = useMusubiCommand(store, "create_review")
  const createDiff = useMusubiCommand(store, "create_diff_review")
  const [selections, setSelections] = useState<Set<string>>(new Set())
  const [base, setBase] = useState("")
  const [head, setHead] = useState("")
  const [error, setError] = useState<string | null>(null)
  const busy = createFiles.isPending || createDiff.isPending

  // The name is derived from the project, not typed: a diff carries its refs, a
  // file review takes the project name.
  const derivedName =
    kind === "diff" && head.trim() ? `${base.trim() ? `${base.trim()}..` : ""}${head.trim()}` : project.name

  useEffect(() => {
    if (!open) return
    setSelections(new Set())
    setBase("")
    setHead("")
    setError(null)
  }, [open, kind, project.id])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  // A selection entry is a file OR a directory path; the server expands a
  // directory to every file beneath it, so a parent folder can be picked
  // without opening it. Toggling a directory drops any redundant descendant
  // entries; a path already covered by a selected ancestor stays put.
  const toggle = (path: string, isDir: boolean) =>
    setSelections((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
        return next
      }
      if ([...next].some((sel) => path.startsWith(`${sel}/`))) return next
      if (isDir) for (const sel of [...next]) if (sel.startsWith(`${path}/`)) next.delete(sel)
      next.add(path)
      return next
    })

  const canSubmit = kind === "files" ? selections.size > 0 : head.trim().length > 0

  const submit = () => {
    if (!canSubmit) return
    const done = (reply: { review_id: string | null; error: string | null }) => {
      if (reply.error) {
        setError(reply.error)
        return
      }
      onCreated()
      onClose()
    }
    if (kind === "files") {
      createFiles
        .dispatch({ project_id: project.id, name: derivedName, selections: [...selections] })
        .then(done)
        .catch((cause: Error) => setError(cause.message))
    } else {
      createDiff
        .dispatch({
          project_id: project.id,
          name: derivedName,
          base_ref: base.trim() || null,
          head_ref: head.trim(),
        })
        .then(done)
        .catch((cause: Error) => setError(cause.message))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[oklch(0%_0_0/0.5)] backdrop-blur-[2px]" />
      <div className="relative flex max-h-[86vh] w-full flex-col rounded-t-[18px] border border-hair-strong bg-surface shadow-[0_20px_60px_oklch(0%_0_0/0.4)] sm:h-[600px] sm:max-w-[560px] sm:rounded-[16px]">
        <header className="flex items-center gap-3 border-b border-hair px-5 py-4">
          <h2 className="text-[15px] font-bold text-ink">
            New {kind === "files" ? "file" : "diff"} review
          </h2>
          <span className="text-[12px] text-faint">{project.name}</span>
          <span className="flex-1" />
          <button onClick={onClose} aria-label="Close" className="grid size-[28px] place-items-center rounded-full bg-soft text-muted hover:text-ink">
            <X size={15} aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5">
          {kind === "files" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              <span className="text-[11.5px] font-semibold text-muted">
                Files{selections.size > 0 && ` · ${selections.size} selected`}
              </span>
              <div className="min-h-[200px] flex-1 overflow-auto rounded-panel border border-hair-strong bg-canvas p-1.5">
                <DirNode store={store} projectId={project.id} path="" depth={0} selections={selections} onToggle={toggle} />
              </div>
            </div>
          ) : (
            <DiffRefs store={store} projectId={project.id} base={base} head={head} onBase={setBase} onHead={setHead} />
          )}

          {error && <p className="text-[12px] text-request">{error}</p>}
        </div>

        <footer className="flex items-center gap-2 border-t border-hair px-5 py-3">
          <span className="flex-1" />
          <button onClick={onClose} className="inline-flex h-[32px] items-center rounded-ctrl px-3 text-[13px] font-medium text-muted hover:bg-soft">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !canSubmit}
            className="inline-flex h-[32px] items-center rounded-ctrl bg-accent px-4 text-[13px] font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create review"}
          </button>
        </footer>
      </div>
    </div>
  )
}

function DirNode({
  store,
  projectId,
  path,
  depth,
  selections,
  onToggle,
}: {
  store: BoardStore
  projectId: string
  path: string
  depth: number
  selections: Set<string>
  onToggle: (path: string, isDir: boolean) => void
}) {
  const listDir = useMusubiCommand(store, "list_dir")
  const [entries, setEntries] = useState<{ path: string; dir: boolean }[] | null>(null)
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set())

  useEffect(() => {
    listDir.dispatch({ project_id: projectId, path }).then((reply) => setEntries(reply.entries))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, projectId])

  if (entries === null) {
    return <div className="px-2 py-1 text-[12px] text-faint">Loading…</div>
  }

  const sel = [...selections]
  const covered = (p: string) => sel.some((s) => s === p || p.startsWith(`${s}/`))
  const hasDescendant = (p: string) => sel.some((s) => s.startsWith(`${p}/`))

  return (
    <div style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      {entries.map((entry) => {
        const name = entry.path.slice(entry.path.lastIndexOf("/") + 1)
        const isCovered = covered(entry.path)
        if (entry.dir) {
          const isOpen = openDirs.has(entry.path)
          return (
            <div key={entry.path}>
              <div className="flex h-[28px] w-full items-center gap-2 rounded-ctrl px-1.5 hover:bg-soft">
                <Checkbox
                  checked={isCovered}
                  indeterminate={!isCovered && hasDescendant(entry.path)}
                  onCheckedChange={() => onToggle(entry.path, true)}
                  aria-label={name}
                />
                <button
                  onClick={() =>
                    setOpenDirs((prev) => {
                      const next = new Set(prev)
                      if (next.has(entry.path)) next.delete(entry.path)
                      else next.add(entry.path)
                      return next
                    })
                  }
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[12.5px] text-text"
                >
                  <ChevronRight size={13} className={`shrink-0 text-faint transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden />
                  <Folder size={14} className="shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                </button>
              </div>
              {isOpen && (
                <DirNode store={store} projectId={projectId} path={entry.path} depth={depth + 1} selections={selections} onToggle={onToggle} />
              )}
            </div>
          )
        }
        return (
          <button
            key={entry.path}
            type="button"
            onClick={() => onToggle(entry.path, false)}
            className="flex h-[28px] w-full items-center gap-2 rounded-ctrl px-1.5 pl-[30px] text-left text-[12.5px] text-text hover:bg-soft"
          >
            <span className="pointer-events-none flex">
              <Checkbox checked={isCovered} onCheckedChange={() => onToggle(entry.path, false)} />
            </span>
            <FileIcon name={name} size={13} />
            <span className="min-w-0 flex-1 truncate">{name}</span>
          </button>
        )
      })}
    </div>
  )
}

function DiffRefs({
  store,
  projectId,
  base,
  head,
  onBase,
  onHead,
}: {
  store: BoardStore
  projectId: string
  base: string
  head: string
  onBase: (v: string) => void
  onHead: (v: string) => void
}) {
  const listBranches = useMusubiCommand(store, "list_branches")
  const [branches, setBranches] = useState<string[]>([])

  useEffect(() => {
    listBranches.dispatch({ project_id: projectId }).then((reply) => {
      setBranches([...reply.branches, ...reply.remote_branches])
      if (reply.default && !base) onBase(reply.default)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  return (
    <div className="flex flex-col gap-4">
      <RefSelect label="Base ref" value={base} branches={branches} onChange={onBase} />
      <RefSelect label="Head ref" value={head} branches={branches} onChange={onHead} />
    </div>
  )
}

function RefSelect({
  label,
  value,
  branches,
  onChange,
}: {
  label: string
  value: string
  branches: string[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-muted">{label}</span>
      <Select value={value} onValueChange={onChange} options={branches} placeholder="Select a branch…" />
    </div>
  )
}
