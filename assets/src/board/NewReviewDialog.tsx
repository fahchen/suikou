import { useEffect, useState } from "react"
import { ChevronRight, Folder, X } from "lucide-react"

import { useMusubiCommand } from "../musubi"
import { Checkbox } from "../components/ui/checkbox"
import { Combobox } from "../components/ui/combobox"
import { Dialog, DialogTitle } from "../components/ui/dialog"
import { FileIcon } from "./FileIcon"
import type { BoardProject, BoardReview, BoardStore } from "./types"

type Kind = "files" | "diff"

/** Compose a new review, or edit an existing one. Pick files from the project
 * tree, or a diff between two refs. Creating dispatches create_review /
 * create_diff_review; editing dispatches rename_review and (for file reviews)
 * update_review_files. A diff review's refs are fixed after creation. */
export function NewReviewDialog({
  store,
  project,
  kind,
  review,
  open,
  onClose,
  onCreated,
}: {
  store: BoardStore
  project: BoardProject
  kind: Kind
  review?: BoardReview | null
  open: boolean
  onClose: () => void
  onCreated: (reviewId?: string) => void
}) {
  const createFiles = useMusubiCommand(store, "create_review")
  const createDiff = useMusubiCommand(store, "create_diff_review")
  const renameReview = useMusubiCommand(store, "rename_review")
  const updateFiles = useMusubiCommand(store, "update_review_files")
  const [name, setName] = useState("")
  const [nameDirty, setNameDirty] = useState(false)
  const [selections, setSelections] = useState<Set<string>>(new Set())
  const [base, setBase] = useState("")
  const [head, setHead] = useState("")
  const [error, setError] = useState<string | null>(null)
  const editing = review != null
  const activeKind: Kind = review ? (review.kind === "git_diff" ? "diff" : "files") : kind
  const busy =
    createFiles.isPending || createDiff.isPending || renameReview.isPending || updateFiles.isPending

  // A sensible default name — the project for a file review, the refs for a
  // diff — that keeps syncing into the field until the user edits it.
  const derivedName =
    activeKind === "diff" && head.trim()
      ? `${base.trim() ? `${base.trim()}..` : ""}${head.trim()}`
      : project.name

  useEffect(() => {
    if (!open) return
    setError(null)
    if (review) {
      // Prefill from the review being edited; treat the name as dirty so the
      // derived default never clobbers the existing title.
      setNameDirty(true)
      setName(review.name)
      setSelections(new Set(review.selections))
      setBase(review.base_ref ?? "")
      setHead(review.head_ref ?? "")
    } else {
      setNameDirty(false)
      setSelections(new Set())
      setBase("")
      setHead("")
    }
  }, [open, kind, project.id, review])

  useEffect(() => {
    if (open && !nameDirty && !review) setName(derivedName)
  }, [open, nameDirty, derivedName, review])

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

  const canSubmit =
    name.trim().length > 0 && (activeKind === "files" ? selections.size > 0 : head.trim().length > 0)

  const submit = () => {
    if (!canSubmit) return
    const reviewName = name.trim() || derivedName
    const fail = (cause: Error) => setError(cause.message)
    const done = (reply: { error: string | null; review_id?: string | null }) => {
      if (reply.error) {
        setError(reply.error)
        return
      }
      onCreated(reply.review_id ?? undefined)
      onClose()
    }

    if (review) {
      // Edit: rename, and for file reviews also update the selection. A diff
      // review's refs are fixed, so only its name is editable.
      const renamed =
        reviewName !== review.name
          ? renameReview.dispatch({ review_id: review.id, name: reviewName })
          : Promise.resolve({ error: null })
      renamed
        .then((reply) => {
          if (reply.error) return reply
          if (activeKind === "files") {
            return updateFiles.dispatch({ review_id: review.id, selections: [...selections] })
          }
          return reply
        })
        .then(done)
        .catch(fail)
      return
    }

    if (activeKind === "files") {
      createFiles
        .dispatch({ project_id: project.id, name: reviewName, selections: [...selections] })
        .then(done)
        .catch(fail)
    } else {
      createDiff
        .dispatch({
          project_id: project.id,
          name: reviewName,
          base_ref: base.trim() || null,
          head_ref: head.trim(),
        })
        .then(done)
        .catch(fail)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-h-[86vh] overflow-hidden sm:h-[600px] sm:max-w-[560px]">
        <header className="flex items-center gap-3 border-b border-hair px-5 py-4">
          <DialogTitle className="text-base font-bold text-ink">
            {editing ? "Edit" : "New"} {activeKind === "files" ? "file" : "diff"} review
          </DialogTitle>
          <span className="text-xs text-faint">{project.name}</span>
          <span className="flex-1" />
          <button onClick={onClose} aria-label="Close" className="grid size-[28px] place-items-center rounded-full bg-soft text-muted hover:text-ink">
            <X size={15} aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5">
          {review && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted">Review ID</span>
              <span className="flex h-[34px] items-center rounded-ctrl border border-hair bg-soft px-3 font-mono text-xs text-faint select-all">
                {review.id}
              </span>
            </div>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted">Name</span>
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setNameDirty(true)
              }}
              placeholder={derivedName}
              className="h-[34px] rounded-ctrl border border-hair-strong bg-canvas px-3 text-sm text-ink placeholder:text-faint focus:border-accent-edge focus:outline-none"
            />
          </label>

          {activeKind === "files" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted">
                Files{selections.size > 0 && ` · ${selections.size} selected`}
              </span>
              <div className="min-h-[200px] flex-1 overflow-auto rounded-ctrl border border-hair-strong bg-canvas p-1">
                <DirNode store={store} projectId={project.id} path="" depth={0} selections={selections} onToggle={toggle} />
              </div>
            </div>
          ) : editing ? (
            <ReadonlyRefs base={base} head={head} />
          ) : (
            <DiffRefs store={store} projectId={project.id} base={base} head={head} onBase={setBase} onHead={setHead} />
          )}

          {error && <p className="text-xs text-request">{error}</p>}
        </div>

        <footer className="flex items-center gap-2 border-t border-hair px-5 py-3">
          <span className="flex-1" />
          <button onClick={onClose} className="inline-flex h-[32px] items-center rounded-ctrl px-3 text-sm font-medium text-muted hover:bg-soft">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !canSubmit}
            className="inline-flex h-[32px] items-center rounded-ctrl bg-accent px-4 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            {busy ? (editing ? "Saving…" : "Creating…") : editing ? "Save changes" : "Create review"}
          </button>
        </footer>
    </Dialog>
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
    return <div className="px-2 py-1 text-xs text-faint">Loading…</div>
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
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs text-text"
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
            className="flex h-[28px] w-full items-center gap-2 rounded-ctrl px-1.5 text-left text-xs text-text hover:bg-soft"
          >
            <span className="pointer-events-none flex">
              <Checkbox checked={isCovered} onCheckedChange={() => onToggle(entry.path, false)} />
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-1.5 pl-[19px]">
              <FileIcon name={name} size={13} />
              <span className="min-w-0 flex-1 truncate">{name}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** A diff review's refs shown read-only — they are fixed once the review
 * exists, so editing only reaches the review's name. */
function ReadonlyRefs({ base, head }: { base: string; head: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted">Diff range</span>
      <span className="flex h-[34px] items-center rounded-ctrl border border-hair bg-soft px-3 font-mono text-xs text-faint">
        {base ? `${base}..${head}` : head}
      </span>
      <span className="text-xs text-faint">Refs are fixed once the review exists.</span>
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
      <span className="text-xs font-semibold text-muted">{label}</span>
      <Combobox value={value} onValueChange={onChange} options={branches} placeholder="Search a branch…" />
    </div>
  )
}
