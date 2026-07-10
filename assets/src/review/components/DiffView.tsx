import { PatchDiff } from "@pierre/diffs/react"
import { observer } from "mobx-react-lite"

import { uiStore } from "../../stores/ui-store"

/** Baseline git-diff renderer: hands the server's per-file unified patch
 * straight to `@pierre/diffs`. The unified/split toggle switches the library's
 * `diffStyle` on the same payload — no second pipeline. Comment anchoring is
 * a follow-up slice. */
export const DiffView = observer(function DiffView({ patch }: { patch: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <PatchDiff patch={patch} options={{ diffStyle: uiStore.diffStyle }} />
    </div>
  )
})
