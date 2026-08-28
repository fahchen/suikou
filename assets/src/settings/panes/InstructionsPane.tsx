import { useEffect, useState } from "react"
import type { StoreProxy } from "@musubi/react"

import { PaneHead } from "./pane-parts"
import { Textarea } from "../../components/ui/textarea"
import { storeCache, useMusubiCommand, useMusubiRoot, useMusubiSnapshot } from "../../musubi"

// Mirrors `Suikou.Schemas.Settings.max_instructions/0`; the server rejects more.
const MAX_INSTRUCTIONS = 10_000

type SettingsStore = StoreProxy<"SuikouWeb.Stores.SettingsStore", Musubi.Stores>

const LEDE = "Every agent reads these before it reviews or fixes code. Project instructions come after them."

/** Global review instructions. The modal opens over the board and over a review,
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
  const [text, setText] = useState(saved)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setText(saved)
  }, [saved])

  const dirty = text.trim() !== saved

  const save = () => {
    setError(null)
    update
      .dispatch({ review_instructions: text.trim() === "" ? null : text })
      .then((reply) => setError(reply.error))
      .catch((cause: Error) => setError(cause.message))
  }

  return (
    <Frame>
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
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
        {error && <span className="text-xs text-request">{error}</span>}
        <span className="flex-1" />
        <button
          onClick={save}
          disabled={!dirty || update.isPending}
          className="inline-flex h-[32px] items-center rounded-ctrl bg-accent px-4 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
        >
          {update.isPending ? "Saving…" : "Save"}
        </button>
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
