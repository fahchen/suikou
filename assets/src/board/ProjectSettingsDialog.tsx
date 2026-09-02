import { useEffect, useState } from "react"
import { X } from "lucide-react"

import { useMusubiCommand } from "../musubi"
import { Checkbox } from "../components/ui/checkbox"
import { Dialog, DialogTitle } from "../components/ui/dialog"
import { EmojiPicker } from "../components/ui/emoji-picker"
import type { BoardProject, BoardStore } from "./types"

/** Edit a project's settings: its display name and whether it respects
 * `.gitignore`. The path is identity and shown read-only. Dispatches
 * update_project and refetches the board. */
export function ProjectSettingsDialog({
  store,
  project,
  open,
  onClose,
  onSaved,
}: {
  store: BoardStore
  project: BoardProject
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const update = useMusubiCommand(store, "update_project")
  const [name, setName] = useState(project.name)
  const [emoji, setEmoji] = useState<string | null>(project.emoji)
  const [respectGitignore, setRespectGitignore] = useState(project.respect_gitignore)
  const [error, setError] = useState<string | null>(null)
  const busy = update.isPending

  useEffect(() => {
    if (!open) return
    setName(project.name)
    setEmoji(project.emoji)
    setRespectGitignore(project.respect_gitignore)
    setError(null)
  }, [open, project.name, project.emoji, project.respect_gitignore])

  const submit = () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    update
      .dispatch({ project_id: project.id, name: trimmedName, respect_gitignore: respectGitignore, emoji })
      .then((reply) => {
        if (reply.error) {
          setError(reply.error)
          return
        }
        onSaved()
        onClose()
      })
      .catch((cause: Error) => setError(cause.message))
  }

  return (
    <Dialog open={open} onClose={onClose} className="gap-4 p-5 sm:max-w-[440px]">
      <div className="flex items-center gap-3">
        <DialogTitle className="text-base font-bold text-ink">Project settings</DialogTitle>
        <span className="flex-1" />
        <button onClick={onClose} aria-label="Close" className="grid size-[28px] place-items-center rounded-full bg-soft text-muted hover:text-ink">
          <X size={15} aria-hidden />
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submit()}
            className="h-[34px] w-full rounded-ctrl border border-hair-strong bg-canvas px-3 text-sm text-ink placeholder:text-faint focus:border-accent-edge focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted">Emoji</span>
          <EmojiPicker value={emoji} onChange={setEmoji} />
        </label>

        <button
          type="button"
          onClick={() => setRespectGitignore((v) => !v)}
          className="flex items-center gap-2.5 text-left text-xs text-text"
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

        {error && <p className="text-xs text-request">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          <span className="flex-1" />
          <button onClick={onClose} className="inline-flex h-[32px] items-center rounded-ctrl px-3 text-sm font-medium text-muted hover:bg-soft">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !name.trim()}
            className="inline-flex h-[32px] items-center rounded-ctrl bg-accent px-4 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
    </Dialog>
  )
}
