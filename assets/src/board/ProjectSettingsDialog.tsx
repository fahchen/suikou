import { useEffect, useState } from "react"
import { X } from "lucide-react"

import { useMusubiCommand } from "../musubi"
import { Button } from "../components/ui/button"
import { Checkbox } from "../components/ui/checkbox"
import { Dialog, DialogTitle } from "../components/ui/dialog"
import { EmojiPicker } from "../components/ui/emoji-picker"
import { Field } from "../components/ui/field"
import { Textarea } from "../components/ui/textarea"
import type { BoardProject, BoardStore } from "./types"

// Mirrors `Suikou.Schemas.Settings.max_instructions/0`; the server rejects more.
const MAX_INSTRUCTIONS = 10_000

/** Edit a project's settings: its display name, its review instructions, and
 * whether it respects `.gitignore`. The path is identity and shown read-only.
 * Dispatches update_project and refetches the board. */
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
  const [instructions, setInstructions] = useState(project.review_instructions ?? "")
  const [error, setError] = useState<string | null>(null)
  const busy = update.isPending

  useEffect(() => {
    if (!open) return
    setName(project.name)
    setEmoji(project.emoji)
    setRespectGitignore(project.respect_gitignore)
    setInstructions(project.review_instructions ?? "")
    setError(null)
  }, [open, project.name, project.emoji, project.respect_gitignore, project.review_instructions])

  const submit = () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    update
      .dispatch({
        project_id: project.id,
        name: trimmedName,
        respect_gitignore: respectGitignore,
        emoji,
        review_instructions: instructions.trim() === "" ? null : instructions,
      })
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
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="rounded-full bg-soft">
          <X size={15} aria-hidden />
        </Button>
      </div>

      <Field label="Name">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && submit()}
          className="h-[34px] w-full rounded-ctrl border border-hair-strong bg-canvas px-3 text-sm text-ink placeholder:text-faint focus:border-accent-edge focus:outline-none"
        />
      </Field>

      <Field label="Review instructions" hint="Agents reviewing this project follow these, after the global ones.">
        <Textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          rows={4}
          maxLength={MAX_INSTRUCTIONS}
          placeholder="e.g. Report any Repo call inside queries/."
          className="max-h-[200px] overflow-y-auto"
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
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </Dialog>
  )
}
