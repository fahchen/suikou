import { useEffect, useState, type ReactNode } from "react"
import { X } from "lucide-react"

import { useMusubiCommand } from "../musubi"
import { Checkbox } from "../components/ui/checkbox"
import { Dialog, DialogTitle } from "../components/ui/dialog"
import { EmojiPicker } from "../components/ui/emoji-picker"
import type { BoardStore } from "./types"

/** Register a directory as a project: a name and an absolute path, plus the
 * gitignore-respect flag. Dispatches create_project and refetches the board. */
export function CreateProjectDialog({
  store,
  open,
  onClose,
  onCreated,
}: {
  store: BoardStore
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const create = useMusubiCommand(store, "create_project")
  const [name, setName] = useState("")
  const [path, setPath] = useState("")
  const [emoji, setEmoji] = useState<string | null>(null)
  const [respectGitignore, setRespectGitignore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const busy = create.isPending

  useEffect(() => {
    if (!open) return
    setName("")
    setPath("")
    setEmoji(null)
    setRespectGitignore(true)
    setError(null)
  }, [open])

  const submit = () => {
    const trimmedName = name.trim()
    const trimmedPath = path.trim()
    if (!trimmedName || !trimmedPath) return
    create
      .dispatch({ name: trimmedName, path: trimmedPath, respect_gitignore: respectGitignore, emoji })
      .then((reply) => {
        if (reply.error) {
          setError(reply.error)
          return
        }
        onCreated()
        onClose()
      })
      .catch((cause: Error) => setError(cause.message))
  }

  return (
    <Dialog open={open} onClose={onClose} className="gap-4 p-5 sm:max-w-[440px]">
      <div className="flex items-center gap-3">
        <DialogTitle className="text-[15px] font-bold text-ink">New project</DialogTitle>
        <span className="flex-1" />
        <button onClick={onClose} aria-label="Close" className="grid size-[28px] place-items-center rounded-full bg-soft text-muted hover:text-ink">
          <X size={15} aria-hidden />
        </button>
      </div>

      <Field label="Name">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Data Platform"
            className="h-[34px] w-full rounded-ctrl border border-hair-strong bg-canvas px-3 text-[13px] text-ink placeholder:text-faint focus:border-accent-edge focus:outline-none"
          />
        </Field>
        <Field label="Path">
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submit()}
            placeholder="/Users/you/code/project"
            className="h-[34px] w-full rounded-ctrl border border-hair-strong bg-canvas px-3 font-mono text-[12.5px] text-ink placeholder:text-faint focus:border-accent-edge focus:outline-none"
          />
        </Field>

        <Field label="Emoji">
          <EmojiPicker value={emoji} onChange={setEmoji} />
        </Field>

        <button
          type="button"
          onClick={() => setRespectGitignore((v) => !v)}
          className="flex items-center gap-2.5 text-left text-[12.5px] text-text"
        >
          <span className="pointer-events-none flex">
            <Checkbox
              checked={respectGitignore}
              onCheckedChange={setRespectGitignore}
              aria-label="Respect .gitignore"
            />
          </span>
          Respect .gitignore when listing files
        </button>

        {error && <p className="text-[12px] text-request">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          <span className="flex-1" />
          <button onClick={onClose} className="inline-flex h-[32px] items-center rounded-ctrl px-3 text-[13px] font-medium text-muted hover:bg-soft">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !name.trim() || !path.trim()}
            className="inline-flex h-[32px] items-center rounded-ctrl bg-accent px-4 text-[13px] font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create project"}
          </button>
        </div>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-muted">{label}</span>
      {children}
    </label>
  )
}
