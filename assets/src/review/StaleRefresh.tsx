import { RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Marks a file whose source changed on disk since it was loaded: a compact
 * amber reload button. Rendered only while the file is stale. */
export function StaleRefresh(props: { onRefresh: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={props.onRefresh}
      title="Changed on disk — reload"
      aria-label="Changed on disk — reload"
      className="bg-amber-soft text-amber ring-1 ring-inset ring-amber/30 hover:bg-amber-soft hover:text-amber"
    >
      <RotateCw />
    </Button>
  )
}
