import { PatchDiff } from "@pierre/diffs/react"

/** Baseline git-diff renderer: hands the server's per-file unified patch
 * straight to `@pierre/diffs`. Comment anchoring and split view are follow-up
 * slices; this only wires the D6 skeleton so `structure.kind === "diff"` files
 * stop rendering as raw patch text. */
export function DiffView({ patch }: { patch: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <PatchDiff patch={patch} />
    </div>
  )
}
