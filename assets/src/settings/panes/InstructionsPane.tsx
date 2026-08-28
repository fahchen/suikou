import { useCallback, useEffect, useState } from "react"
import type { StoreProxy } from "@musubi/react"

import { PaneHead } from "./pane-parts"
import { Textarea } from "../../components/ui/textarea"
import { TimeAgo } from "../../components/ui/time-ago"
import { storeCache, useMusubiCommand, useMusubiRoot, useMusubiSnapshot } from "../../musubi"

// Mirrors `Suikou.Schemas.Settings.max_instructions/0`; the server rejects more.
const MAX_INSTRUCTIONS = 10_000

// How long a pause in typing counts as "done for now" and triggers the save.
const SAVE_DELAY_MS = 600

type SettingsStore = StoreProxy<"SuikouWeb.Stores.SettingsStore", Musubi.Stores>

const LEDE = "Every agent reads these before it reviews or fixes code. Project instructions come after them."

/** Global review instructions. Saves on a pause in typing, like the panes
 * beside it apply on change. The modal opens over the board and over a review,
 * so this pane mounts its own root store instead of reading either page's. */
export function InstructionsPane() {
  const root = useMusubiRoot({
    module: "SuikouWeb.Stores.SettingsStore",
    id: "settings",
    params: {},
    cache: storeCache,
  })

  if (root.status === "loading") return <Frame>{null}</Frame>
  if (root.status === "error") {
    return (
      <Frame>
        <p className="text-xs text-request">Can't reach Suikou. Reopen this pane once it's back.</p>
      </Frame>
    )
  }

  return <Editor store={root.store} />
}

function Editor({ store }: { store: SettingsStore }) {
  const snapshot = useMusubiSnapshot(store)
  const update = useMusubiCommand(store, "update_settings")
  const saved = snapshot?.review_instructions ?? ""
  const savedAt = snapshot?.saved_at ?? null
  const [text, setText] = useState(saved)
  const [error, setError] = useState<string | null>(null)
  const dirty = text.trim() !== saved

  useEffect(() => {
    setText(saved)
  }, [saved])

  const save = useCallback(
    (value: string) => {
      setError(null)
      update
        .dispatch({ review_instructions: value.trim() === "" ? null : value })
        .then((reply) => setError(reply.error))
        .catch((cause: Error) => setError(cause.message))
    },
    [update],
  )

  // Save on a pause in typing, like every other pane applies on change. The
  // blur below covers the shorter path — closing the modal unmounts this pane
  // before a pending timer would fire.
  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => save(text), SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text, dirty, save])

  return (
    <Frame>
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => dirty && save(text)}
        rows={10}
        maxLength={MAX_INSTRUCTIONS}
        aria-label="Global review instructions"
        placeholder="e.g. Reply in English. Flag any change that widens a public API."
        className="max-h-[320px] overflow-y-auto"
      />
      <div className="flex items-center gap-3">
        <span className="text-xs text-faint">
          {text.length.toLocaleString()} / {MAX_INSTRUCTIONS.toLocaleString()}
        </span>
        <span className="flex-1" />
        {error ? (
          <span className="text-xs text-request">{error}</span>
        ) : dirty || update.isPending ? (
          <span className="text-xs text-faint">Saving…</span>
        ) : (
          savedAt && (
            <span className="inline-flex items-center gap-1 text-xs text-faint">
              Saved <TimeAgo iso={savedAt} />
            </span>
          )
        )}
      </div>
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <PaneHead title="Review instructions" lede={LEDE} />
      {children}
    </div>
  )
}
