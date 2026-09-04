import { useEffect, useState } from "react"
import { X } from "lucide-react"

import { useMusubiCommand } from "../musubi"
import { Button } from "../components/ui/button"
import { Checkbox } from "../components/ui/checkbox"
import { Dialog, DialogTitle } from "../components/ui/dialog"
import { EmojiPicker } from "../components/ui/emoji-picker"
import { Field } from "../components/ui/field"
import type { BoardStore } from "./types"

/** Register a project: a name, an optional emoji and the gitignore-respect flag.
 * No directory — a project is a label, and the checkout is named when its first
 * review is created. Dispatches create_project and refetches the board. */
export function CreateProjectDialog({
  store,
  open,
  onClose,
  onCreated,
}: {
  store: BoardStore
  open: boolean
  onClose: () => void
  onCreated: (projectId: string) => void
}) {
  const create = useMusubiCommand(store, "create_project")
  const [name, setName] = useState("")
  const [emoji, setEmoji] = useState<string | null>(null)
  const [respectGitignore, setRespectGitignore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const busy = create.isPending

  useEffect(() => {
    if (!open) return
    setName("")
    setEmoji(null)
    setRespectGitignore(true)
    setError(null)
  }, [open])

  const submit = () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    create
      .dispatch({ name: trimmedName, respect_gitignore: respectGitignore, emoji })
      .then((reply) => {
        if (reply.error || !reply.project_id) {
          setError(reply.error ?? "create_failed")
          return
        }
        onCreated(reply.project_id)
        onClose()
      })
      .catch((cause: Error) => setError(cause.message))
  }

  return (
    <Dialog open={open} onClose={onClose} className="gap-4 p-5 sm:max-w-[440px]">
      <div className="flex items-center gap-3">
        <DialogTitle className="text-base font-bold text-ink">New project</DialogTitle>
        <span className="flex-1" />
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="rounded-full bg-soft">
          <X size={15} aria-hidden />
        </Button>
      </div>

      <Field label="Name">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Data Platform"
          onKeyDown={(event) => event.key === "Enter" && submit()}
          className="h-[34px] w-full rounded-ctrl border border-hair-strong bg-canvas px-3 text-sm text-ink placeholder:text-faint focus:border-accent-edge focus:outline-none"
        />
      </Field>

      <Field label="Project icon">
        <EmojiPicker value={emoji} onChange={setEmoji} />
      </Field>

      <button
        type="button"
        onClick={() => setRespectGitignore((v) => !v)}
        className="flex items-center gap-2.5 text-left text-xs text-text"
      >
        <span className="pointer-events-none flex">
          <Checkbox checked={respectGitignore} onCheckedChange={setRespectGitignore} aria-label="Respect .gitignore" />
        </span>
        Respect .gitignore when listing files
      </button>

      {error && <p className="text-xs text-request">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button size="lg" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="accent" size="lg" onClick={submit} disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create project"}
        </Button>
      </div>
    </Dialog>
  )
}
