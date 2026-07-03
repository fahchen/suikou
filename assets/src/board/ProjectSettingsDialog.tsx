import { useEffect, useState } from "react"
import { X } from "lucide-react"

import { useMusubiCommand } from "../musubi"
import { Checkbox } from "../components/ui/checkbox"
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

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

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
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[oklch(0%_0_0/0.5)] backdrop-blur-[2px]" />
      <div className="relative flex w-full flex-col gap-4 rounded-t-[18px] border border-hair-strong bg-surface p-5 shadow-[0_20px_60px_oklch(0%_0_0/0.4)] sm:max-w-[440px] sm:rounded-[16px]">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-bold text-ink">Project settings</h2>
          <span className="flex-1" />
          <button onClick={onClose} aria-label="Close" className="grid size-[28px] place-items-center rounded-full bg-soft text-muted hover:text-ink">
            <X size={15} aria-hidden />
          </button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-semibold text-muted">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submit()}
            className="h-[34px] w-full rounded-ctrl border border-hair-strong bg-canvas px-3 text-[13px] text-ink placeholder:text-faint focus:border-accent-edge focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-semibold text-muted">Path</span>
          <span className="flex h-[34px] items-center truncate rounded-ctrl border border-hair bg-soft px-3 font-mono text-[12.5px] text-faint">
            {project.path}
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-semibold text-muted">Emoji</span>
          <EmojiPicker value={emoji} onChange={setEmoji} />
        </label>

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
            disabled={busy || !name.trim()}
            className="inline-flex h-[32px] items-center rounded-ctrl bg-accent px-4 text-[13px] font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  )
}
