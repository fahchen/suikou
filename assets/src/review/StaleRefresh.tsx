import { RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Marks a file whose source changed on disk since it was loaded, with a button
 * to refetch the live content. Rendered only while the file is stale. */
export function StaleRefresh(props: { onRefresh: () => void }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="inline-flex items-center rounded-md bg-amber-soft px-1.5 py-0.5 text-[11px] font-medium text-amber ring-1 ring-inset ring-amber/30">
        changed on disk
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={props.onRefresh}
        title="Reload the latest content from disk"
        className="text-amber"
      >
        <RotateCw size={13} />
        Refresh
      </Button>
    </span>
  )
}
